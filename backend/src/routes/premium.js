import { Router } from 'express';
import { requireAuth, getFreshUser, invalidateCachedUser } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { verifyGooglePlayPurchase, verifyStripePayment, createStripeCheckoutSession, constructStripeWebhookEvent } from '../lib/purchaseVerification.js';
import { sendDbError } from '../lib/errorResponse.js';
import { resolvePlan, PLAN_RANK } from '../lib/planResolver.js';
import { isAllToolsFree } from '../lib/appSettings.js';

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
const ULTIMATE_MIN_CHECKOUT_CENTS = 999;

// Laufzeit je Plan in Tagen, wenn der Zahlungsanbieter kein eigenes Ablaufdatum
// liefert (Stripe-Einmalzahlung, Play-Einmalprodukt). Google-Play-ABOS bringen
// ihr echtes Ablaufdatum mit — das hat immer Vorrang, siehe verifiedExpiryFrom().
const PLAN_DURATION_DAYS = {
  trial_10_10: 10, // Einmalprodukt: 10 Tage Vollzugriff
  friends: 365,    // Jahresabo (friends_monthly bleibt monatlich)
};
const DEFAULT_PLAN_DURATION_DAYS = 30;

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

// Google-Play-Abos tragen ihr echtes Ablaufdatum (expiryTimeMillis). Das ist die
// einzige Wahrheit über die Laufzeit: Play verlängert automatisch weiter, ohne
// dass sich der purchaseToken ändert. Würde der Server stattdessen stur
// +30 Tage rechnen, verlöre ein zahlender Abonnent nach einem Monat den Zugang,
// obwohl Play weiter abbucht.
function verifiedExpiryFrom(verification) {
  const ms = Number(verification?.raw?.expiryTimeMillis);
  if (!Number.isFinite(ms) || ms <= Date.now()) return null;
  return new Date(ms).toISOString();
}

// Ein Ultimate-Pass (24h-Kauf, Referral-Bonus) verlängert eine noch laufende
// Pass-Laufzeit, statt sie zu überschreiben — sonst verfielen bereits
// erworbene Bonus-Tage mit dem nächsten Kauf.
function extendPassExpiry(current, durationMs, nowMs = Date.now()) {
  const existing = current?.premium_pass_expires_at
    ? new Date(current.premium_pass_expires_at).getTime()
    : 0;
  const base = Number.isFinite(existing) && existing > nowMs ? existing : nowMs;
  return new Date(base + durationMs).toISOString();
}

// Replay-Schutz über ALLE bisher verbuchten Zahlungen, nicht nur die letzte:
// Wurde nur `premium_transaction_id` verglichen, ließ sich eine ältere, bereits
// verbuchte Stripe-Session nach einem neueren Kauf erneut einreichen und
// verlängerte die Laufzeit ein weiteres Mal. Die Liste ist gedeckelt, damit
// app_metadata (Teil jedes JWT) klein bleibt.
const PROCESSED_TRANSACTIONS_LIMIT = 50;

function processedTransactions(meta = {}) {
  const list = Array.isArray(meta.premium_processed_transactions) ? meta.premium_processed_transactions : [];
  return new Set([...list, meta.premium_transaction_id, meta.premium_purchase_token].filter(Boolean));
}

function rememberTransaction(meta = {}, id) {
  const list = Array.isArray(meta.premium_processed_transactions) ? meta.premium_processed_transactions : [];
  if (!id) return list;
  return [...list.filter((x) => x !== id), id].slice(-PROCESSED_TRANSACTIONS_LIMIT);
}

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
    invalidateCachedUser(row.referrer_user_id);

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
      ultimate_discount_cents: readDiscountCents(req.user)
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
    payment_methods: {
      google_play: GOOGLE_PLAY_VERIFICATION_CONFIGURED,
      stripe: STRIPE_PAYMENT_VERIFICATION_CONFIGURED,
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
  const allowed = Boolean(requiredPlan)
    && (PLAN_RANK[effectiveId] >= PLAN_RANK[requiredPlan] || await isAllToolsFree());

  return res.json({ ok: true, allowed, plan: effectiveId, required_plan: requiredPlan || null });
});

// Preise serverseitig als Source of Truth — der Client sendet nur die plan_id,
// niemals den Preis. Muss mit der Plan-Anzeige in src/pages/PremiumPlans.jsx
// übereinstimmen.
const CHECKOUT_PLANS = {
  basic:           { name: 'Basic', amountCents: 899 },
  pro:             { name: 'Pro', amountCents: 1800 },
  elite:           { name: 'Ultimate', amountCents: 3600 },
  premium_24h:     { name: '24 Stunden Premium', amountCents: 499, durationHours: 24, grantsPlan: 'elite' },
  friends:         { name: 'Freundschaft (Jahresabo)', amountCents: 15000 },
  // friends_monthly wird nicht mehr aktiv beworben (Freundschaftsplan ist ein
  // reines Jahresabo), bleibt aber für Bestandskäufe/Google-Play-Restore gültig.
  friends_monthly: { name: 'Freundschaft Monatlich', amountCents: 3600 },
};

const PLAY_PRODUCTS = {
  baitbuddy_basic_monthly: 'basic',
  baitbuddy_pro_monthly: 'pro',
  baitbuddy_ultimate_monthly: 'elite',
  baitbuddy_friends_yearly: 'friends',
  baitbuddy_friends_monthly: 'friends_monthly',
  baitbuddy_trial_10_10: 'trial_10_10',
};

// Stripe's signed webhook is the authoritative fulfillment path. The browser
// success URL is only a confirmation screen and cannot grant access itself.
export async function stripeWebhookHandler(req, res) {
  let event;
  try {
    event = constructStripeWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (error) {
    return res.status(400).json({ error: 'Ungültiger Stripe-Webhook' });
  }

  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  if (session.payment_status !== 'paid') return res.status(200).json({ received: true });
  const userId = session.client_reference_id || session.metadata?.user_id;
  const planId = session.metadata?.plan_id;
  const checkoutPlan = planId ? CHECKOUT_PLANS[planId] : null;
  if (!userId || !checkoutPlan) {
    console.error('[stripe] checkout session has invalid BaitBuddy metadata', { sessionId: session.id });
    return res.status(200).json({ received: true });
  }

  const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userResult?.user) throw new Error('BaitBuddy user not found for Stripe session');
  const fulfilledUser = userResult.user;
  const current = fulfilledUser.app_metadata || {};
  if (processedTransactions(current).has(session.id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  const isPremiumPass = planId === 'premium_24h';
  const expiresAt = isPremiumPass
    ? extendPassExpiry(current, checkoutPlan.durationHours * 60 * 60 * 1000)
    : new Date(Date.now() + (PLAN_DURATION_DAYS[planId] ?? DEFAULT_PLAN_DURATION_DAYS) * 24 * 60 * 60 * 1000).toISOString();
  const storedPlanId = checkoutPlan.grantsPlan || planId;
  // Webhook und /premium/activate müssen dieselben Nebenwirkungen haben: Der
  // Webhook kommt in der Regel zuerst, danach ist /activate ein Replay-No-op.
  // Ohne diese Felder blieb der Referral-Rabatt nach einem Ultimate-Kauf
  // bestehen und war beliebig oft einlösbar.
  const isUltimateTier = !isPremiumPass && (PLAN_RANK[storedPlanId] ?? 0) >= PLAN_RANK.elite;
  const merged = {
    ...current,
    premium_plan_id: isPremiumPass ? current.premium_plan_id || 'free' : storedPlanId,
    premium_expires_at: isPremiumPass ? current.premium_expires_at || null : expiresAt,
    ...(isPremiumPass ? { premium_pass_started_at: new Date().toISOString(), premium_pass_expires_at: expiresAt } : {}),
    ...(isPremiumPass ? {} : { premium_trial: false }),
    premium_payment_method: 'stripe',
    premium_transaction_id: session.id,
    premium_processed_transactions: rememberTransaction(current, session.id),
    premium_activated_at: new Date().toISOString(),
    premium_activation_version: (current.premium_activation_version || 0) + 1,
    ...(isUltimateTier ? { ultimate_discount_cents: 0 } : {}),
  };
  const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: merged });
  if (error) throw error;
  invalidateCachedUser(userId);

  if (planId === 'basic') {
    await grantReferralBasicReward({ ...fulfilledUser, app_metadata: merged });
  }
  return res.status(200).json({ received: true, fulfilled: true });
}

router.post('/premium/checkout', requireAuth, async (req, res) => {
  if (!STRIPE_PAYMENT_VERIFICATION_CONFIGURED) {
    return res.status(501).json({ error: 'Stripe checkout nicht konfiguriert' });
  }

  const { plan_id } = req.body || {};
  const plan = plan_id ? CHECKOUT_PLANS[plan_id] : null;
  if (!plan) {
    return res.status(400).json({ error: 'Unbekannte oder fehlende plan_id' });
  }

  // Rücksprung-Ziel nach der Zahlung: konfigurierte Basis-URL bevorzugen,
  // sonst Origin des Requests (Frontend und API laufen auf derselben
  // Vercel-Domain). {CHECKOUT_SESSION_ID} ersetzt Stripe beim Redirect.
  const origin = process.env.APP_BASE_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`;
  const successUrl = `${origin}/PremiumPlans?checkout=success&plan_id=${encodeURIComponent(plan_id)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/PremiumPlans?checkout=cancelled`;

  // Referral-Rabatt nur auf den Ultimate-Plan anwenden (elite). Betrag wird auf
  // einen Mindestpreis begrenzt und beim Aktivieren verbraucht.
  // Der Mindestpreis begrenzt nur den RABATT — er ist kein Preisaufschlag.
  // Vorher galt Math.max(…, 999) für jeden Plan, wodurch Basic (8,99 €) und
  // der 24h-Pass (4,99 €) mit 9,99 € abgerechnet wurden.
  const isUltimate = plan_id === 'elite' || plan_id === 'ultimate';
  const discountCents = isUltimate ? readDiscountCents(await getFreshUser(req.user)) : 0;
  const amountCents = discountCents > 0
    ? Math.max(plan.amountCents - discountCents, Math.min(ULTIMATE_MIN_CHECKOUT_CENTS, plan.amountCents))
    : plan.amountCents;
  const appliedDiscountCents = plan.amountCents - amountCents;

  const session = await createStripeCheckoutSession({
    planId: plan_id,
    planName: appliedDiscountCents > 0 ? `${plan.name} (Freundschafts-Rabatt)` : plan.name,
    amountCents,
    userId: req.user.id,
    userEmail: req.user.email,
    successUrl,
    cancelUrl,
  });
  if (!session.ok) {
    return res.status(502).json({ error: `Checkout-Session konnte nicht erstellt werden: ${session.reason}` });
  }

  return res.json({ ok: true, checkout_url: session.url, session_id: session.id });
});

router.post('/premium/activate-demo', requireAuth, async (req, res) => {
  return res.json({ ok: true, message: 'Demo-Modus aktiviert' });
});

// Aktiviert einen gekauften Plan nach Zahlungsverifikation.
// Verlangt purchase_token (Google Play) oder transaction_id (sonstige) zur Validierung.
// Speichert Transaktionsdaten für Audit/Verifizierung.
// Schützt vor Race Conditions durch Versionierung.
router.post('/premium/activate', requireAuth, async (req, res) => {
  const { plan_id, purchase_token, product_id, transaction_id, payment_method } = req.body || {};

  if (!plan_id) {
    return res.status(400).json({ error: 'plan_id erforderlich' });
  }
  if (!CHECKOUT_PLANS[plan_id] && plan_id !== 'trial_10_10') {
    return res.status(400).json({ error: 'Unbekannte plan_id' });
  }
  if (!purchase_token && !transaction_id) {
    return res.status(400).json({
      error: 'purchase_token (Google Play) oder transaction_id erforderlich — keine Zahlung verifiziert'
    });
  }
  const verificationConfigured = purchase_token
    ? GOOGLE_PLAY_VERIFICATION_CONFIGURED
    : STRIPE_PAYMENT_VERIFICATION_CONFIGURED;
  if (!verificationConfigured) {
    return res.status(501).json({
      error: 'Kaufverifikation ist serverseitig noch nicht konfiguriert — Premium kann derzeit nicht aktiviert werden'
    });
  }
  if (purchase_token && PLAY_PRODUCTS[product_id] !== plan_id) {
    return res.status(400).json({ error: 'Google-Play-Produkt gehört nicht zum angeforderten Plan' });
  }

  // Echte Verifikation beim jeweiligen Anbieter — siehe purchaseVerification.js
  // (WICHTIG: dort als ungetestet gegen echte APIs markiert).
  const verification = purchase_token
    ? await verifyGooglePlayPurchase({ productId: product_id, purchaseToken: purchase_token })
    : await verifyStripePayment({ sessionId: transaction_id });
  if (!verification.valid) {
    return res.status(402).json({ error: `Zahlung konnte nicht verifiziert werden: ${verification.reason}` });
  }

  // Stripe: Die Session muss zu diesem Nutzer und Plan gehören (Metadata aus
  // /premium/checkout) — verhindert, dass eine fremde oder für einen
  // günstigeren Plan bezahlte Session einen höheren Plan freischaltet.
  if (!purchase_token) {
    const session = verification.raw || {};
    if (session.client_reference_id !== req.user.id || (session.metadata?.user_id && session.metadata.user_id !== req.user.id)) {
      return res.status(403).json({ error: 'Zahlung gehört zu einem anderen Konto' });
    }
    if (session.metadata?.plan_id !== plan_id) {
      return res.status(400).json({ error: 'Zahlung gehört zu einem anderen Plan' });
    }
  }

  // Frischer Stand statt req.user (Token-Cache, bis 60 s alt): Hat der
  // Stripe-Webhook die Transaktion inzwischen verbucht, muss der Replay-Schutz
  // das sehen, und ein Merge auf altem Stand würde dessen Felder zurückdrehen.
  const freshUser = await getFreshUser(req.user);
  const current = freshUser.app_metadata || {};

  // Ablaufdatum: Bei Google-Play-Abos gilt das von Play gelieferte
  // expiryTimeMillis, sonst rechnet der Server die Laufzeit selbst.
  const verifiedExpiresAt = verifiedExpiryFrom(verification);
  const checkoutPlan = CHECKOUT_PLANS[plan_id] || {};
  const durationDays = PLAN_DURATION_DAYS[plan_id] ?? DEFAULT_PLAN_DURATION_DAYS;
  const expiresAt = verifiedExpiresAt
    || (checkoutPlan.durationHours
      ? extendPassExpiry(current, checkoutPlan.durationHours * 60 * 60 * 1000)
      : null)
    || new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  // Play verlängert Abos automatisch und behält dabei denselben purchaseToken
  // bei — nur das Ablaufdatum wandert nach vorne. Ein reiner Replay-Schutz über
  // den Token würde die Verlängerung deshalb verschlucken und den Nutzer nach
  // einem Monat aussperren, obwohl er weiter zahlt. Ein erneuter Aufruf darf die
  // Laufzeit also genau dann fortschreiben, wenn der Anbieter selbst ein
  // späteres Ablaufdatum bestätigt hat.
  const extendsRuntime = !!verifiedExpiresAt && (
    !current.premium_expires_at ||
    new Date(verifiedExpiresAt).getTime() > new Date(current.premium_expires_at).getTime()
  );

  // Replay-Schutz: Dieselbe Transaktion darf die Laufzeit nicht mehrfach
  // verlängern (z.B. wiederholtes Aufrufen der Stripe-Success-URL oder
  // "Käufe wiederherstellen" mit einem bereits verarbeiteten Play-Token).
  // Kein Plan-Vergleich mehr: Beim 24h-Pass bleibt premium_plan_id der
  // Basisplan, der Vergleich schlug also immer fehl — jede Wiederholung
  // derselben Session hätte erneut Laufzeit gutgeschrieben.
  const alreadyProcessed = processedTransactions(current).has(transaction_id || purchase_token);
  if (alreadyProcessed && !extendsRuntime) {
    return res.json({
      ok: true,
      plan_id,
      expires_at: current.premium_expires_at,
      updated: false,
      note: 'Transaktion bereits verarbeitet'
    });
  }
  const storedPlanId = checkoutPlan.grantsPlan || plan_id;
  const isPremiumPass = plan_id === 'premium_24h';
  const isUltimateTier = (PLAN_RANK[storedPlanId] ?? 0) >= PLAN_RANK.elite;

  const merged = {
    ...current,
    premium_plan_id: isPremiumPass ? current.premium_plan_id || 'free' : storedPlanId,
    premium_expires_at: isPremiumPass ? current.premium_expires_at || null : expiresAt,
    ...(isPremiumPass ? {
      premium_pass_started_at: new Date().toISOString(),
      premium_pass_expires_at: expiresAt,
    } : {}),
    premium_trial: false,
    premium_payment_method: payment_method || 'unknown',
    premium_product_id: product_id,
    premium_purchase_token: purchase_token,
    premium_transaction_id: transaction_id,
    premium_processed_transactions: rememberTransaction(current, transaction_id || purchase_token),
    premium_activated_at: new Date().toISOString(),
    premium_activation_version: (current.premium_activation_version || 0) + 1,
    // Angesammelten Referral-Rabatt beim Ultimate-Kauf verbrauchen.
    ...(isUltimateTier ? { ultimate_discount_cents: 0 } : {}),
  };

  const { error } = await supabase.auth.admin.updateUserById(req.user.id, {
    app_metadata: merged,
  });
  if (error) return sendDbError(res, error);
  invalidateCachedUser(req.user.id);

  // Referral-Belohnung: Aktiviert ein eingeladener Nutzer erstmals Basic,
  // bekommt sein Referrer 10 € Ultimate-Rabatt gutgeschrieben (best-effort).
  if (plan_id === 'basic') {
    await grantReferralBasicReward({ id: req.user.id, user_metadata: freshUser.user_metadata || {}, app_metadata: merged });
  }

  return res.json({
    ok: true,
    plan_id,
    expires_at: isPremiumPass ? merged.premium_pass_expires_at : merged.premium_expires_at,
    // `updated` unterscheidet eine echte Änderung von einem no-op (Replay).
    // Der Client stößt nur bei einer echten Änderung ein Plan-Reload an.
    updated: true,
    note: 'Plan aktiviert mit Transaktionsdaten gespeichert für Audit'
  });
});

export default router;
