// Abrechnungsperioden + Wallet-Bereitstellung für das Credit-System.
//
// Periodenanker (resolveBillingPeriod):
//   - Bezahlter Plan (Abo): app_metadata.premium_activated_at. Das Feld wird bei
//     JEDER Aktivierung neu gesetzt (auch bei Play-Verlängerungen), es gibt kein
//     separates „ursprüngliches Abo-Startdatum“. Für die Abrechnung passt das:
//     eine Aktivierung = Beginn einer bezahlten Laufzeit.
//   - Pass/Testphase: premium_pass_started_at bzw. trial_started_at.
//   - Free: user.created_at (Kontoerstellung).
//   Fehlt der Anker, gilt `now` (erster Credit-Kontakt).
// Ab dem Anker rollierend in 30-Tage-Schritten bis zur Periode, die `now`
// enthält. Bei bezahlten Plänen endet die Periode spätestens mit dem Planende
// (expiresAt), damit ein 7-Tage-Pass nicht 30 Tage Premium-Credits liefert.
import { resolvePlan } from './planResolver.js';
import { mapPlanCodeToCreditPlan } from './planCreditMapping.js';
import { getCreditPlans } from './creditConfig.js';
import { getCurrentWallet, grantMonthlyCredits } from './creditEngine.js';
import { supabase } from './supabase.js';

export const BILLING_PERIOD_DAYS = 30;
const PERIOD_MS = BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000;

function toMs(value) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Credit-Plan eines Nutzers aus dem bestehenden
 * resolvePlan. Der Admin-Schalter „Alle Tools kostenlos“ hebt die
 * Funktionsfreigabe an, aber nicht das externe KI-Kostenbudget.
 */
export function resolveCreditPlan(user, now = new Date()) {
  const plan = resolvePlan(user, now);
  let creditPlan = mapPlanCodeToCreditPlan(plan.effectiveId);
  if (plan.isPass || plan.isTrial) creditPlan = 'pass';
  return { plan, creditPlan };
}

/**
 * @param {object} user  Supabase-User (app_metadata, created_at)
 * @param {Date} now
 * @returns {{ start: Date, end: Date, anchor: Date, anchorSource: string }}
 */
export function resolveBillingPeriod(user, now = new Date()) {
  const nowMs = toMs(now) ?? Date.now();
  const meta = user?.app_metadata || {};
  const plan = resolvePlan(user, new Date(nowMs));

  let anchorMs = null;
  let anchorSource = 'now';
  const pick = (value, source) => {
    const ms = toMs(value);
    if (anchorMs == null && ms != null && ms <= nowMs) { anchorMs = ms; anchorSource = source; }
  };

  if (plan.isPass) pick(meta.premium_pass_started_at, 'premium_pass_started_at');
  else if (plan.isTrial) pick(meta.trial_started_at, 'trial_started_at');
  else if (plan.effectiveId !== 'free') pick(meta.premium_activated_at, 'premium_activated_at');
  pick(user?.created_at, 'created_at');
  if (anchorMs == null) anchorMs = nowMs;

  const steps = Math.floor((nowMs - anchorMs) / PERIOD_MS);
  const startMs = anchorMs + steps * PERIOD_MS;
  let endMs = startMs + PERIOD_MS;

  const planEndMs = plan.effectiveId !== 'free' ? toMs(plan.expiresAt) : null;
  if (planEndMs != null && planEndMs > nowMs && planEndMs < endMs) endMs = planEndMs;

  return { start: new Date(startMs), end: new Date(endMs), anchor: new Date(anchorMs), anchorSource };
}

async function lastWalletEnd(userId) {
  const { data, error } = await supabase
    .from('credit_wallets')
    .select('billing_period_end')
    .eq('user_id', userId)
    .order('billing_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return toMs(data?.billing_period_end);
}

function grantArgs(userId, creditPlan, start, end) {
  const plans = getCreditPlans();
  const def = plans[creditPlan] || plans.free;
  return {
    userId,
    planCode: creditPlan,
    includedCredits: def.includedCredits,
    periodStart: start,
    periodEnd: end,
    costLimitEur: def.costLimitEur,
  };
}

/**
 * Stellt sicher, dass eine aktuelle Wallet existiert. Läuft bereits eine
 * Periode, bleibt sie unverändert (Planwechsel mitten in der Periode laufen
 * über grantForPlanChange). Sonst wird die nächste Periode vergeben — nie
 * überlappend mit der letzten Wallet (Start frühestens an deren Ende).
 *
 * @returns {Promise<{ ok: boolean, created?: boolean, reason?: string, periodStart?, periodEnd?, creditPlan? }>}
 */
export async function ensureCurrentWallet(user, now = new Date()) {
  if (!user?.id) return { ok: false, reason: 'no_user' };
  try {
    const existing = await getCurrentWallet(user.id, now);
    if (existing) return { ok: true, created: false, periodStart: existing.periodStart, periodEnd: existing.periodEnd };

    const { creditPlan } = resolveCreditPlan(user, now);
    const period = resolveBillingPeriod(user, now);
    let start = period.start.getTime();
    let end = period.end.getTime();
    const prevEnd = await lastWalletEnd(user.id);
    if (prevEnd != null && prevEnd > start) {
      start = prevEnd;
      if (end <= start) end = start + PERIOD_MS;
    }
    const result = await grantMonthlyCredits(grantArgs(user.id, creditPlan, new Date(start), new Date(end)));
    if (!result?.ok) return { ok: false, reason: result?.reason || 'grant_failed' };
    return { ok: true, created: result.already_granted !== true, periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(), creditPlan };
  } catch (e) {
    console.error('[walletProvisioning] ensureCurrentWallet fehlgeschlagen:', e?.message || e);
    return { ok: false, reason: 'credit_system_unavailable' };
  }
}

/**
 * Planwechsel nach Zahlung (Stripe-Webhook, /premium/activate).
 *
 * Entscheidung (bewusst einfach, keine Proratierung): Eine Aktivierung startet
 * sofort eine NEUE Periode ab jetzt mit dem vollen Kontingent des neuen Plans.
 * Gekaufte und Bonus-Credits werden von grant_monthly_credits übertragen; der
 * ungenutzte Rest des alten Monatskontingents verfällt. Das passt zur
 * Laufzeitlogik in premium.js, die bei jeder Aktivierung ebenfalls ab jetzt
 * neu rechnet (premium_activated_at = jetzt, +30 Tage).
 * Ein Pass/Kauf, der den Credit-Plan NICHT anhebt (z. B. Basic-Kauf während
 * eines laufenden Ultimate-Passes), lässt die laufende Periode unverändert.
 */
export async function grantForPlanChange(user, now = new Date()) {
  if (!user?.id) return { ok: false, reason: 'no_user' };
  try {
    const { plan, creditPlan } = resolveCreditPlan(user, now);
    if (creditPlan === 'free') return ensureCurrentWallet(user, now);

    const existing = await getCurrentWallet(user.id, now);
    const plans = getCreditPlans();
    if (existing && existing.includedCredits >= (plans[creditPlan]?.includedCredits ?? 0)) {
      return { ok: true, created: false, unchanged: true, creditPlan };
    }

    const start = toMs(now) ?? Date.now();
    let end = start + PERIOD_MS;
    const planEnd = toMs(plan.expiresAt);
    if (planEnd != null && planEnd > start && planEnd < end) end = planEnd;
    const result = await grantMonthlyCredits(grantArgs(user.id, creditPlan, new Date(start), new Date(end)));
    if (!result?.ok) return { ok: false, reason: result?.reason || 'grant_failed' };
    return { ok: true, created: true, creditPlan, periodStart: new Date(start).toISOString(), periodEnd: new Date(end).toISOString() };
  } catch (e) {
    console.error('[walletProvisioning] grantForPlanChange fehlgeschlagen:', e?.message || e);
    return { ok: false, reason: 'credit_system_unavailable' };
  }
}
