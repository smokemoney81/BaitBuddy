import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { verifyGooglePlayPurchase, constructStripeWebhookEvent } from '../lib/purchaseVerification.js';
import { BILLING_PLANS, PLAY_PRODUCT_PLANS, canonicalPlanId } from '../../../shared/billingCatalog.js';
import { applyPayment } from '../lib/paymentLedger.js';
import { stripeReady, openStripeCheckout, openBillingPortal, fulfillStripeSession, processStripeEvent } from '../lib/stripeBilling.js';
import { resolvePlan, PLAN_RANK } from '../lib/planResolver.js';

const router = Router();

// Ohne server-seitige Kaufverifikation (Google-Play-Service-Account bzw.
// Stripe-Secret) darf /premium/activate niemanden freischalten — sonst reicht
// ein beliebiger nicht-leerer purchase_token/transaction_id, um sich selbst
// Elite zu geben. Beide Env-Variablen sind in backend/.env.example
// dokumentiert; ohne STRIPE_SECRET_KEY bleiben auch /premium/checkout und
// die Stripe-Aktivierung mit 501 gesperrt.
const GOOGLE_PLAY_VERIFICATION_CONFIGURED = !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
const STRIPE_PAYMENT_VERIFICATION_CONFIGURED = !!process.env.STRIPE_SECRET_KEY;

// resolvePlan/PLAN_RANK kommen zentral aus lib/planResolver.js — auch der
// TTS-Endpunkt (Ultimate-Stimme) nutzt dieselbe Auflösung.

// Referral-Belohnung: Kauft ein eingeladener Freund den Basic-Plan, bekommt der
// Referrer 10 € Rabatt auf den nächsten Ultimate-Kauf, gedeckelt bei 3 Freunden
// (30 €). Der Rabatt lebt in den Referrer-Metadaten (ultimate_discount_cents)
// und wird beim Ultimate-Web-Checkout eingelöst.
const ULTIMATE_DISCOUNT_PER_REFERRAL_CENTS = 1000;
const ULTIMATE_DISCOUNT_MAX_CENTS = 3000;


const PLAN_DISPLAY_NAMES = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  elite: 'Ultimate',
  ultimate: 'Ultimate',
  friends: 'Freundschaft',
  friends_monthly: 'Freundschaft',
  trial_10_10: '10-Tage-Zugang',
};

function readDiscountCents(user) {
  const raw = Number(user?.app_metadata?.ultimate_discount_cents);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), ULTIMATE_DISCOUNT_MAX_CENTS);
}

// Schreibt dem Referrer eine 10-€-Ultimate-Gutschrift gut, sobald der von ihm
// eingeladene Nutzer erstmals Basic aktiviert. Best-effort: Fehler werden
// geloggt, blockieren die Basic-Aktivierung aber nicht. Idempotent über das
// Flag referrals.basic_reward_granted (eine Gutschrift je Einladung).
async function grantReferralBasicReward(referredUser) {
  try {
    if (!referredUser?.user_metadata?.referred_by) return;

    const { data: row, error } = await supabase
      .from('referrals')
      .select('id, referrer_user_id, basic_reward_granted')
      .eq('referred_user_id', referredUser.id)
      .maybeSingle();
    if (error || !row || row.basic_reward_granted) return;

    const { data: refRes, error: refErr } =
      await supabase.auth.admin.getUserById(row.referrer_user_id);
    if (refErr || !refRes?.user) return;

    const refMeta = refRes.user.app_metadata || {};
    const current = readDiscountCents(refRes.user);
    const next = Math.min(current + ULTIMATE_DISCOUNT_PER_REFERRAL_CENTS, ULTIMATE_DISCOUNT_MAX_CENTS);

    const { error: updErr } = await supabase.auth.admin.updateUserById(row.referrer_user_id, {
      app_metadata: { ...refMeta, ultimate_discount_cents: next },
    });
    if (updErr) return;

    await supabase.from('referrals').update({ basic_reward_granted: true }).eq('id', row.id);
  } catch (e) {
    console.error('[premium] grantReferralBasicReward fehlgeschlagen:', e?.message || e);
  }
}

router.get('/premium/status', requireAuth, async (req, res) => {
  const {
    effectiveId,
    isActive,
    expiresAt,
    remainingHours,
    isTrial,
    isPass,
    source,
    trialUsed,
    trialStartedAt,
    trialExpiresAt,
    premiumPassStartedAt,
    premiumPassExpiresAt,
  } = resolvePlan(req.user);

  return res.json({
    ok: true,
    plan: {
      id: effectiveId,
      name: PLAN_DISPLAY_NAMES[effectiveId] || 'Free',
      is_active: isActive,
      is_trial: isTrial && isActive,
      is_pass: isPass && isActive,
      source,
      expires_at: expiresAt,
      remaining_days: remainingHours == null ? null : Math.ceil(remainingHours / 24),
      remaining_hours: remainingHours,
      trial_used: trialUsed,
      trial_started_at: trialStartedAt,
      trial_expires_at: trialExpiresAt,
      premium_pass_started_at: premiumPassStartedAt,
      premium_pass_expires_at: premiumPassExpiresAt,
      // Angesammelter Referral-Rabatt (Cent) auf den nächsten Ultimate-Kauf.
      ultimate_discount_cents: readDiscountCents(req.user),
      can_manage_subscription: Boolean(req.user.app_metadata?.stripe_customer_id)
    }
  });
});

router.post('/plan/status', requireAuth, async (req, res) => {
  const { effectiveId, isActive } = resolvePlan(req.user);
  return res.json({
    ok: true,
    plan: { id: effectiveId, name: effectiveId, is_active: isActive }
  });
});

const PRODUCTS = [
  { id: 'basic', name: 'Basic', price: 8.99, features: ['Werbefrei', 'KI-Buddy unbegrenzt', 'Fangbuch', 'Spots', 'Wetter'] },
  { id: 'pro', name: 'Pro', price: 18, features: ['Alles in Basic', 'KI-Fangprognosen', 'AR & 3D', 'Community'] },
  { id: 'elite', name: 'Ultimate', price: 36, features: ['Alles in Pro', 'Live-Bissanzeiger', 'CatchCam', 'Priorisierte KI'] },
  { id: 'premium_24h', name: '24 Stunden Premium', price: 4.99, duration_hours: 24, features: ['24 Stunden Ultimate-Zugriff', 'Premium-KI', 'Premium Voice', 'Werbefrei'] },
  { id: 'friends', name: 'Freundschaft', price: 150, yearly: true, features: ['Alles in Ultimate (12 Monate)', 'Freundes-Einladungen', 'Geteilte Spot-Gruppen', 'Gruppen-Ranking'] },
];

router.get('/premium/products', async (req, res) => {
  return res.json(PRODUCTS);
});

// Öffentlich (kein Auth): Das Frontend muss VOR dem Kauf wissen, ob der Server
// den jeweiligen Zahlungsweg überhaupt verifizieren kann. Fehlt das Secret,
// bezahlt der Nutzer sonst erst und bekommt danach einen 501 zurück — Geld
// abgebucht, kein Plan. Mit dieser Info kann die Kauf-Schaltfläche vorher
// gesperrt werden. Es werden ausschließlich Boolean-Flags veröffentlicht,
// niemals die Secrets selbst.
router.get('/premium/config', (req, res) => {
  return res.json({
    ok: true,
    plans: Object.fromEntries(Object.keys(BILLING_PLANS).map(id => [id, { stripe: stripeReady(id), google_play: GOOGLE_PLAY_VERIFICATION_CONFIGURED && Boolean(BILLING_PLANS[id].playProduct) }])),
    payment_methods: {
      google_play: GOOGLE_PLAY_VERIFICATION_CONFIGURED,
      stripe: ['basic','pro','elite','friends','premium_24h'].some(stripeReady),
    },
  });
});

// Mindest-Plan je Feature-Key, abgeleitet aus den Produktbeschreibungen oben
// (fangbuch/spots/wetter = Basic; ki_assistent/community = Pro; offline/
// premium_support = Elite). check-feature wird vom Frontend aktuell NICHT
// aufgerufen (die client-seitige PlanGuard/PlanContext-Komponente prueft den
// Plan direkt) — die Haerte hier ist Vorbereitung fuer zukuenftige serverseitige
// Durchsetzung, nicht Ersatz fuer PlanGuard. Unbekannte/neue Feature-Keys
// werden bewusst gesperrt (fail-closed), damit ein Tippfehler oder neuer
// Premium-Key niemals versehentlich Zugriff freischaltet.
const FEATURE_MIN_PLAN = {
  fangbuch: 'basic',
  spots: 'basic',
  wetter: 'basic',
  ki_assistent: 'pro',
  community: 'pro',
  offline: 'elite',
  premium_support: 'elite',
};

router.post('/premium/check-feature', requireAuth, async (req, res) => {
  const { feature } = req.body || {};
  const { effectiveId } = resolvePlan(req.user);

  const requiredPlan = feature ? FEATURE_MIN_PLAN[feature] : null;
  const allowed = Boolean(requiredPlan) && PLAN_RANK[effectiveId] >= PLAN_RANK[requiredPlan];

  return res.json({ ok: true, allowed, plan: effectiveId, required_plan: requiredPlan || null });
});

// Browser return and signed webhook use exactly the same atomic fulfillment.
export async function stripeWebhookHandler(req, res) {
  let event;
  try { event = constructStripeWebhookEvent(req.body, req.headers['stripe-signature']); }
  catch { return res.status(400).json({ error: 'Ungültiger Stripe-Webhook' }); }
  try { return res.json(await processStripeEvent(event)); }
  catch (error) {
    console.error('[premium] Webhook-Verarbeitung fehlgeschlagen', { type: event.type, id: event.id });
    return res.status(503).json({ error: 'Zahlung wird erneut verarbeitet' });
  }
}

router.post('/premium/checkout', requireAuth, async (req, res) => {
  if (!STRIPE_PAYMENT_VERIFICATION_CONFIGURED) return res.status(501).json({ error: 'Stripe nicht konfiguriert' });
  try { return res.json(await openStripeCheckout(req.user, req.body?.plan_id)); }
  catch (error) { return res.status(error.status || 502).json({ error: error.status ? error.message : 'Checkout konnte nicht gestartet werden' }); }
});
router.post('/premium/portal', requireAuth, async (req, res) => {
  if (!STRIPE_PAYMENT_VERIFICATION_CONFIGURED) return res.status(501).json({ error: 'Stripe nicht konfiguriert' });
  try { return res.json(await openBillingPortal(req.user)); }
  catch (error) { return res.status(error.status || 502).json({ error: error.status ? error.message : 'Abo-Verwaltung nicht erreichbar' }); }
});

router.post('/premium/activate', requireAuth, async (req, res) => {
  const { purchase_token, product_id, transaction_id } = req.body || {};
  const planId = canonicalPlanId(req.body?.plan_id);
  const plan = BILLING_PLANS[planId];
  if (!plan) return res.status(400).json({ error: 'Unbekannte oder fehlende plan_id' });
  if (!purchase_token && !transaction_id) return res.status(400).json({ error: 'Zahlungsnachweis erforderlich' });
  if (!(purchase_token ? GOOGLE_PLAY_VERIFICATION_CONFIGURED : STRIPE_PAYMENT_VERIFICATION_CONFIGURED)) {
    return res.status(501).json({ error: 'Kaufverifikation nicht konfiguriert' });
  }
  try {
    let result;
    if (!purchase_token) {
      result = await fulfillStripeSession(transaction_id, req.user.id, planId);
    } else {
      if (typeof purchase_token !== 'string' || PLAY_PRODUCT_PLANS[product_id] !== planId) {
        return res.status(400).json({ error: 'Google-Play-Produkt passt nicht zum Tarif' });
      }
      const observedAt = new Date().toISOString();
      const verified = await verifyGooglePlayPurchase({ productId: product_id, purchaseToken: purchase_token });
      if (!verified.valid) return res.status(402).json({ error: 'Google Play hat den Kauf nicht bestätigt' });
      const raw = verified.raw || {};
      const start = Number(raw.startTimeMillis || raw.purchaseTimeMillis);
      const end = plan.durationHours ? start + plan.durationHours * 3600000 : Number(raw.expiryTimeMillis);
      if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end) || end <= Date.now()) {
        return res.status(402).json({ error: 'Kauf-Laufzeit fehlt oder ist abgelaufen' });
      }
      result = await applyPayment({ userId: req.user.id, provider: 'google_play', reference: purchase_token,
        planId, startsAt: new Date(start).toISOString(), expiresAt: new Date(end).toISOString(), observedAt });
    }
    if (planId === 'basic') await grantReferralBasicReward(req.user);
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Kauf konnte noch nicht synchronisiert werden' });
  }
});

export default router;
