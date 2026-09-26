// KI-Volumen pro Plan („Buddy-Tokens“).
//
// Jede Cloud-KI-Nutzung (Text-Chat, Voice-Chat, Vorlesen, Foto-Analyse und die
// übrigen KI-Werkzeuge) verbraucht Buddy-Tokens aus einem Monatsvolumen, das
// am Plan hängt. Abgerechnet wird ausschließlich serverseitig:
//   1. vor dem Aufruf: reicht das Restvolumen für die Kosten? Sonst 429 mit
//      code 'ai_token_quota_exceeded' — der teure Anbieter-Aufruf entfällt.
//   2. nach erfolgreichem Aufruf: Verbrauch atomar verbuchen
//      (RPC record_ai_token_usage, Migration 20260926120000_ai_token_usage.sql).
// Fehlgeschlagene Aufrufe kosten nichts. Die KI auf dem Gerät läuft nicht über
// den Server und verbraucht deshalb kein Volumen.
//
// Fail-open: Fehlt die Tabelle (Migration noch nicht eingespielt) oder scheitert
// das Lesen/Schreiben, wird nicht gesperrt — ein DB-Problem darf zahlenden
// Nutzern den Buddy nicht abschalten. Gleichzeitige Anfragen können das Limit
// deshalb um höchstens eine Anfrage überschreiten (Prüfung vor, Buchung nach
// dem Aufruf).
import { supabase } from './supabase.js';
import { resolvePlan, planRank, PLAN_RANK } from './planResolver.js';
import { isAllToolsFree } from './appSettings.js';
import { isSuperuserEmail } from '../middleware/auth.js';

// Monatsvolumen je Plan-Rang (planResolver.PLAN_RANK). Über die Env-Variable
// AI_TOKEN_QUOTAS (JSON, Schlüssel = Plan-ID) je Plan überschreibbar.
export const DEFAULT_TOKEN_QUOTAS = Object.freeze({
  free: 500,
  basic: 5000,
  pro: 12000,
  elite: 30000,
  friends: 40000,
});

// Kosten je Werkzeug in Buddy-Tokens. Über AI_TOKEN_COSTS (JSON) überschreibbar.
//   chat      — eine Buddy-Antwort (Text-Chat, gestreamt oder nicht, Hands-free)
//   tts       — Vorlesen, je angefangene `tts_chars` Zeichen
//   realtime  — Start einer Live-Voice-Sitzung (OpenAI Realtime)
//   vision    — Bildanalyse (Fangfoto, Ausrüstung, Kamera)
//   tool      — übrige KI-Werkzeuge (Prognose, Rezepte, Berichte, Analysen)
export const DEFAULT_TOKEN_COSTS = Object.freeze({
  chat: 2,
  tts: 1,
  tts_chars: 200,
  realtime: 150,
  vision: 5,
  tool: 3,
});

export const QUOTA_EXCEEDED_CODE = 'ai_token_quota_exceeded';

const FEATURE_PATTERN = /^[a-z0-9_:-]{1,64}$/;

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`[aiTokenQuota] ${name} ist kein gültiges JSON — Standardwerte aktiv`);
    return {};
  }
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function getTokenQuotas() {
  const overrides = parseJsonEnv('AI_TOKEN_QUOTAS');
  const quotas = {};
  for (const [planId, fallback] of Object.entries(DEFAULT_TOKEN_QUOTAS)) {
    quotas[planId] = positiveInt(overrides[planId], fallback);
  }
  return quotas;
}

export function getTokenCosts() {
  const overrides = parseJsonEnv('AI_TOKEN_COSTS');
  const costs = {};
  for (const [key, fallback] of Object.entries(DEFAULT_TOKEN_COSTS)) {
    costs[key] = positiveInt(overrides[key], fallback);
  }
  costs.tts_chars = Math.max(1, costs.tts_chars);
  return costs;
}

// Plan-ID → Volumen über den Rang, damit Aliase (ultimate, friends_monthly,
// trial_10_10) automatisch das Volumen ihrer Stufe bekommen.
export function quotaForPlan(planId, quotas = getTokenQuotas()) {
  const rank = planRank(planId);
  if (rank >= PLAN_RANK.friends) return quotas.friends;
  if (rank >= PLAN_RANK.elite) return quotas.elite;
  if (rank >= PLAN_RANK.pro) return quotas.pro;
  if (rank >= PLAN_RANK.basic) return quotas.basic;
  return quotas.free;
}

// Kosten eines Aufrufs. TTS wird nach Textlänge abgerechnet, damit die
// satzweise Vorlese-Queue (ein Aufruf je Satz) fair zählt.
export function costFor(feature, { textLength = 0 } = {}, costs = getTokenCosts()) {
  if (feature === 'tts') {
    const chunks = Math.max(1, Math.ceil(Math.max(0, textLength) / costs.tts_chars));
    return chunks * costs.tts;
  }
  return costs[feature] ?? costs.tool;
}

// Abrechnungszeitraum = Kalendermonat in UTC.
export function currentPeriod(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodResetsAt(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

async function readUsed(userId, period) {
  try {
    const { data, error } = await supabase
      .from('ai_token_balances')
      .select('used')
      .eq('user_id', userId)
      .eq('period', period)
      .maybeSingle();
    if (error) throw error;
    const used = Number(data?.used);
    return { used: Number.isFinite(used) && used > 0 ? used : 0, available: true };
  } catch (e) {
    console.warn('[aiTokenQuota] Verbrauch nicht lesbar (fail-open):', e?.message || e);
    return { used: 0, available: false };
  }
}

/**
 * Aktueller Volumen-Stand eines Nutzers.
 * `limit === null` bedeutet unbegrenzt (Superuser).
 */
export async function getTokenUsage(user, now = new Date()) {
  const period = currentPeriod(now);
  const quotas = getTokenQuotas();
  const { effectiveId } = resolvePlan(user, now);
  let limit = quotaForPlan(effectiveId, quotas);
  // „Alle Tools kostenlos“ (Admin-Schalter) gibt jedem mindestens das
  // Ultimate-Volumen — der gespeicherte Plan bleibt unverändert.
  if (await isAllToolsFree()) limit = Math.max(limit, quotas.elite);
  if (isSuperuserEmail(user?.email)) limit = null;

  const { used, available } = await readUsed(user.id, period);
  return {
    period,
    plan_id: effectiveId,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    resets_at: periodResetsAt(now),
    tracking: available,
  };
}

/**
 * Verbucht Verbrauch atomar. Liefert den neuen Monatsstand oder null, wenn die
 * Buchung nicht möglich war (fail-open, wird geloggt).
 */
export async function recordTokenUsage(userId, feature, tokens, { inputTokens = null, outputTokens = null, now = new Date() } = {}) {
  const amount = positiveInt(tokens, 0);
  if (!userId || amount <= 0 || !FEATURE_PATTERN.test(String(feature))) return null;
  try {
    const { data, error } = await supabase.rpc('record_ai_token_usage', {
      p_user_id: userId,
      p_period: currentPeriod(now),
      p_feature: feature,
      p_tokens: amount,
      p_input_tokens: Number.isFinite(inputTokens) ? Math.floor(inputTokens) : null,
      p_output_tokens: Number.isFinite(outputTokens) ? Math.floor(outputTokens) : null,
    });
    if (error) throw error;
    const used = Number(data);
    return Number.isFinite(used) ? used : null;
  } catch (e) {
    console.warn(`[aiTokenQuota] Verbrauch ${feature} (${amount}) nicht verbucht:`, e?.message || e);
    return null;
  }
}

export function quotaExceededMessage(usage) {
  const reset = new Date(usage.resets_at);
  const resetLabel = `${String(reset.getUTCDate()).padStart(2, '0')}.${String(reset.getUTCMonth() + 1).padStart(2, '0')}.`;
  return `Dein KI-Volumen für diesen Monat ist aufgebraucht (${usage.used}/${usage.limit} Buddy-Tokens). `
    + `Es wird am ${resetLabel} erneuert — mit einem höheren Plan bekommst du mehr Volumen.`;
}

/**
 * Express-Middleware: prüft das Restvolumen vor dem Aufruf und verbucht die
 * Kosten, bevor eine erfolgreiche JSON-Antwort (Status < 400) rausgeht.
 *
 * Routen, die trotz Status 200 scheitern können (SSE-Stream), setzen
 * `req.aiTokens.deferred = true` und rufen `await req.aiTokens.charge()` vor
 * `res.end()` selbst auf.
 * `req.aiTokens.setUsage({ input_tokens, output_tokens })` hängt die echten
 * Anbieter-Token an die Buchung (Kostenkontrolle im Ledger).
 */
export function meterAiTokens(feature, { cost } = {}) {
  return async function aiTokenMeter(req, res, next) {
    if (!req.user?.id) return res.status(401).json({ error: 'Auth erforderlich' });

    const amount = typeof cost === 'function' ? cost(req) : costFor(feature);
    let usage;
    try {
      usage = await getTokenUsage(req.user);
    } catch (e) {
      console.warn('[aiTokenQuota] Volumen-Prüfung fehlgeschlagen (fail-open):', e?.message || e);
      return next();
    }

    if (usage.limit !== null && usage.used + amount > usage.limit) {
      const message = quotaExceededMessage(usage);
      return res.status(429).json({
        ok: false,
        code: QUOTA_EXCEEDED_CODE,
        error: message,
        reply: message,
        message,
        usage: { ...usage, cost: amount },
      });
    }

    let charged = false;
    let providerUsage = null;
    const charge = () => {
      if (charged) return Promise.resolve(null);
      charged = true;
      return recordTokenUsage(req.user.id, feature, amount, {
        inputTokens: providerUsage?.input_tokens,
        outputTokens: providerUsage?.output_tokens,
      });
    };
    req.aiTokens = {
      feature,
      cost: amount,
      usage,
      deferred: false,
      charge,
      setUsage(u) { providerUsage = u || null; },
    };
    // Vor dem Senden buchen statt auf 'finish' zu warten: Serverless-Laufzeiten
    // (Vercel) frieren die Funktion nach dem Antwortende ein, eine danach
    // gestartete Buchung ginge verloren.
    const sendJson = res.json.bind(res);
    res.json = (body) => {
      if (req.aiTokens.deferred || charged || res.statusCode >= 400) return sendJson(body);
      charge().finally(() => sendJson(body));
      return res;
    };
    return next();
  };
}
