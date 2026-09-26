// Nutzer-seitige Credit-Endpunkte (neues Abo/Credit-System, Teilauftrag 3).
//
// Getrennt von backend/src/routes/ai.js gehalten, weil das hier reine
// Anzeige-/Konfigurationsdaten für das Frontend sind (Profil-Seite,
// Kostenanzeige vor teuren KI-Tools) statt Abrechnungslogik. Nur aktiv mit
// AI_CREDIT_SYSTEM_ENABLED=true — sonst 404, damit bestehende Deployments
// ohne das Flag optisch unverändert bleiben (siehe Auftrag Abschnitt 3).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendDbError } from '../lib/errorResponse.js';
import { isCreditSystemEnabled, getCreditCosts, TOPUP_PACKAGES } from '../lib/creditConfig.js';
import { getCurrentWallet } from '../lib/creditEngine.js';
import { ensureCurrentWallet, resolveCreditPlan } from '../lib/walletProvisioning.js';

const router = Router();

const PLAN_DISPLAY_NAMES = Object.freeze({
  free: 'Free',
  basic: 'Basic',
  premium: 'Premium',
});

function euro(cents) {
  return Math.round(cents) / 100;
}

function serializeTopupPackages() {
  return TOPUP_PACKAGES.map((pkg, index) => ({
    index,
    credits: pkg.credits,
    price_eur: euro(pkg.priceCents),
  }));
}

// GET /api/credits/wallet — Guthabenstand für die Profil-Seite.
// Legt bei Bedarf die aktuelle Abrechnungsperiode an (Lazy-Provisioning),
// damit die Anzeige nicht erst nach dem ersten KI-Aufruf stimmt.
router.get('/credits/wallet', requireAuth, async (req, res) => {
  if (!isCreditSystemEnabled()) {
    return res.status(404).json({ enabled: false, error: 'Credit-System nicht aktiv' });
  }
  try {
    await ensureCurrentWallet(req.user);
    const wallet = await getCurrentWallet(req.user.id);
    const { creditPlan } = resolveCreditPlan(req.user);

    if (!wallet) {
      // Sollte nach ensureCurrentWallet nicht passieren; fail-closed statt
      // erfundener Zahlen, wenn die DB gerade nicht mitspielt.
      return res.status(503).json({
        enabled: true,
        error: 'Guthabenstand ist gerade nicht verfügbar. Bitte versuche es gleich noch einmal.',
      });
    }

    const costLimitReached = wallet.costLimitEur != null && wallet.costEur != null
      ? wallet.costEur >= wallet.costLimitEur
      : false;

    return res.json({
      enabled: true,
      plan: creditPlan,
      plan_name: PLAN_DISPLAY_NAMES[creditPlan] || creditPlan,
      included_credits: wallet.includedCredits,
      bonus_credits: wallet.bonusCredits,
      purchased_credits: wallet.purchasedCredits,
      used_credits: wallet.usedCredits,
      total_credits: wallet.totalCredits,
      remaining: wallet.remaining,
      percent_remaining: wallet.percentRemaining,
      billing_period_start: wallet.periodStart,
      billing_period_end: wallet.periodEnd,
      next_renewal: wallet.periodEnd,
      cost_limit_reached: costLimitReached,
      topup_packages: serializeTopupPackages(),
    });
  } catch (e) {
    return sendDbError(res, e);
  }
});

// GET /api/credits/feature-costs — reine Preisinformation (keine Businesslogik,
// kein Sicherheitsrisiko): wird vom Frontend genutzt, um vor teuren Aktionen
// (z. B. Satellitenanalyse) den Credit-Preis anzuzeigen, ohne die Kosten im
// Client zu berechnen.
router.get('/credits/feature-costs', requireAuth, async (req, res) => {
  if (!isCreditSystemEnabled()) {
    return res.status(404).json({ enabled: false, error: 'Credit-System nicht aktiv' });
  }
  return res.json({ enabled: true, costs: getCreditCosts() });
});

export default router;
