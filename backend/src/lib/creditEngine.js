// Credit-Engine: JS-Wrapper um die atomaren RPCs aus
// supabase/migrations/20260926130000_credit_system_foundation.sql.
//
// Ablauf je kostenpflichtigem KI-Aufruf:
//   reserveCredits  → Anbieter-Aufruf → finalizeCredits (Erfolg)
//                                     → rollbackCredits (Fehler)
//
// BEWUSSTE ABWEICHUNG vom alten System (aiTokenQuota.js ist fail-open):
// reserveCredits ist FAIL-CLOSED. Scheitert die DB/RPC, wird der Aufruf nicht
// erlaubt ({ ok:false, reason:'credit_system_unavailable' }), weil hier echte
// Anbieterkosten gedeckelt werden. Fachliche Ablehnungen (insufficient_credits,
// cost_limit_exceeded, duplicate_request …) werden als Ergebnis durchgereicht,
// nie als Exception.
import { supabase } from './supabase.js';

export const UNAVAILABLE_REASON = 'credit_system_unavailable';

async function callRpc(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error(`${name}: leere Antwort`);
    return { data, error: null };
  } catch (e) {
    console.error(`[creditEngine] ${name} fehlgeschlagen:`, e?.message || e);
    return { data: null, error: e };
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function unavailable(error) {
  return { ok: false, reason: UNAVAILABLE_REASON, error: error?.message || String(error) };
}

export async function reserveCredits({ userId, requestId, feature, credits, estimatedCostEur, provider, model }) {
  const { data, error } = await callRpc('reserve_ai_credits', {
    p_user_id: userId,
    p_request_id: requestId,
    p_feature: feature,
    p_credits: credits,
    p_estimated_cost_eur: estimatedCostEur,
    p_provider: provider ?? null,
    p_model: model ?? null,
  });
  if (error) return unavailable(error);
  if (data.ok !== true) return { ...data, ok: false, reason: data.reason || 'rejected' };
  return {
    ok: true,
    duplicate: data.duplicate === true,
    reservationId: data.reservation_id ?? null,
    walletRemaining: num(data.wallet_remaining),
    costRemainingEur: num(data.cost_remaining_eur),
  };
}

export async function finalizeCredits({
  requestId, userId, actualCostEur, creditsCharged,
  inputTokens = null, outputTokens = null, cachedTokens = null, voiceSeconds = null, images = null,
}) {
  const { data, error } = await callRpc('finalize_ai_credits', {
    p_request_id: requestId,
    p_user_id: userId,
    p_actual_cost_eur: actualCostEur,
    p_credits_charged: creditsCharged,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cached_tokens: cachedTokens,
    p_voice_seconds: voiceSeconds,
    p_images: images,
  });
  if (error) return unavailable(error);
  if (data.cost_limit_exceeded) {
    console.warn(`[creditEngine] Kostendeckel nach finalize überschritten (user ${userId}, request ${requestId})`);
  }
  return data;
}

export async function rollbackCredits({ requestId, userId, reason = null }) {
  const { data, error } = await callRpc('rollback_ai_credits', {
    p_request_id: requestId,
    p_user_id: userId,
    p_reason: reason,
  });
  if (error) return unavailable(error);
  return data;
}

export async function grantMonthlyCredits({ userId, planCode, includedCredits, periodStart, periodEnd, costLimitEur }) {
  const iso = (d) => (d instanceof Date ? d.toISOString() : d);
  const { data, error } = await callRpc('grant_monthly_credits', {
    p_user_id: userId,
    p_plan_code: planCode,
    p_included_credits: includedCredits,
    p_period_start: iso(periodStart),
    p_period_end: iso(periodEnd),
    p_cost_limit_eur: costLimitEur,
  });
  if (error) return unavailable(error);
  return data;
}

export async function addTopupCredits({ userId, credits, requestId }) {
  const { data, error } = await callRpc('add_topup_credits', {
    p_user_id: userId,
    p_credits: credits,
    p_request_id: requestId,
  });
  if (error) return unavailable(error);
  return data;
}

/**
 * Aktuelle Wallet + Kostenperiode. Liefert `null`, wenn keine Periode läuft.
 * Wirft bei DB-Fehlern (Aufrufer entscheidet über die Anzeige).
 */
export async function getCurrentWallet(userId, now = new Date()) {
  const nowIso = now.toISOString();
  const { data: wallet, error } = await supabase
    .from('credit_wallets')
    .select('*')
    .eq('user_id', userId)
    .lte('billing_period_start', nowIso)
    .gt('billing_period_end', nowIso)
    .order('billing_period_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!wallet) return null;

  const { data: cost, error: costError } = await supabase
    .from('provider_cost_periods')
    .select('cost_eur, cost_limit_eur, period_end')
    .eq('user_id', userId)
    .eq('period_start', wallet.billing_period_start)
    .maybeSingle();
  if (costError) throw costError;

  const included = num(wallet.included_credits) ?? 0;
  const bonus = num(wallet.bonus_credits) ?? 0;
  const purchased = num(wallet.purchased_credits) ?? 0;
  const used = num(wallet.used_credits) ?? 0;
  const total = included + bonus + purchased;
  const remaining = Math.max(total - used, 0);

  return {
    periodStart: wallet.billing_period_start,
    periodEnd: wallet.billing_period_end,
    includedCredits: included,
    bonusCredits: bonus,
    purchasedCredits: purchased,
    usedCredits: used,
    totalCredits: total,
    remaining,
    percentRemaining: total > 0 ? Math.round((remaining / total) * 1000) / 10 : 0,
    costEur: cost ? num(cost.cost_eur) ?? 0 : null,
    costLimitEur: cost ? num(cost.cost_limit_eur) : null,
  };
}
