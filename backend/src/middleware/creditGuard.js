// Credit-Guard: Abrechnung der Cloud-KI über die Credit-Engine
// (reserve → Anbieter-Aufruf → finalize | rollback).
//
// Nur aktiv mit AI_CREDIT_SYSTEM_ENABLED=true (creditConfig.isCreditSystemEnabled).
// Sonst läuft über chargeAi() unverändert das alte meterAiTokens — das ist der
// Rollback-Weg per Env-Variable.
//
// Anders als meterAiTokens ist die Reservierung FAIL-CLOSED: Scheitert die DB,
// wird der teure Anbieter-Aufruf nicht ausgeführt (kontrollierte 503).
//
// Routen-Schnittstelle: creditGuard stellt dieselbe `req.aiTokens`-Form bereit
// wie meterAiTokens (setUsage, deferred, charge) plus `fail(reason)`, damit die
// Routen für beide Systeme identisch bleiben. Zusätzlich:
//   - req.creditRequestId / req.creditReservation
//   - req.aiModel  (Modell aus aiModelRouting, an invokeLLM durchreichen)
// Abschluss:
//   - automatisch über den res.json-Hook: Status < 400 → finalize, sonst rollback
//   - explizit: finalizeCreditGuard / rollbackCreditGuard (SSE-Stream)
//   - Sicherheitsnetz: Verbindung zu, ohne Abschluss → rollback
import { randomUUID } from 'node:crypto';
import { isCreditSystemEnabled, computeVoiceCredits } from '../lib/creditConfig.js';
import { reserveCredits, finalizeCredits, rollbackCredits } from '../lib/creditEngine.js';
import { mapPlanCodeToCreditPlan } from '../lib/planCreditMapping.js';
import { resolvePlan } from '../lib/planResolver.js';
import { classifyFeature, estimateCostEur, estimateTokenCostEur, estimateVoiceCostEur } from '../lib/aiModelRouting.js';
import { ensureCurrentWallet } from '../lib/walletProvisioning.js';
import { meterAiTokens } from '../lib/aiTokenQuota.js';
import { isSuperuserEmail } from './auth.js';

export const CREDIT_QUOTA_EXCEEDED_CODE = 'credit_quota_exceeded';
export const CREDIT_QUOTA_MESSAGE = 'Dein KI-Kontingent für diesen Abrechnungszeitraum ist ausgeschöpft.';
const UNAVAILABLE_MESSAGE = 'Die KI-Abrechnung ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.';

export function generateRequestId() {
  return randomUUID();
}

function providerFor(classification) {
  if (classification.tier !== 'voice') return 'anthropic';
  return classification.feature === 'realtime-session' ? 'openai_realtime' : 'tts';
}

function quotaResponse(res, reason) {
  // Gleiche neutrale Meldung für insufficient_credits und cost_limit_exceeded —
  // das interne Kostenlimit soll für Nutzer nicht unterscheidbar sein. `reason`
  // bleibt für die Frontend-Logik (z. B. Aufladen anbieten) erhalten.
  return res.status(429).json({
    ok: false,
    code: CREDIT_QUOTA_EXCEEDED_CODE,
    reason,
    error: CREDIT_QUOTA_MESSAGE,
    reply: CREDIT_QUOTA_MESSAGE,
    message: CREDIT_QUOTA_MESSAGE,
  });
}

function unavailableResponse(res, status, reason) {
  return res.status(status).json({
    ok: false,
    code: 'credit_system_error',
    reason,
    error: UNAVAILABLE_MESSAGE,
    reply: UNAVAILABLE_MESSAGE,
    message: UNAVAILABLE_MESSAGE,
  });
}

/**
 * Schließt die Reservierung mit dem echten Verbrauch ab. Wirft nie.
 * Ohne echte Werte wird die Schätzung als „actual“ übernommen (z. B. TTS, wo
 * vor und nach der Generierung keine echte Audiodauer vorliegt).
 */
export async function finalizeCreditGuard(req, {
  actualCostEur = null, creditsCharged = null, inputTokens = null, outputTokens = null,
  cachedTokens = null, voiceSeconds = null, images = null,
} = {}) {
  const r = req?.creditReservation;
  if (!r || r.settled) return null;
  r.settled = true;
  const usage = r.providerUsage || {};
  const inTok = inputTokens ?? usage.input_tokens ?? null;
  const outTok = outputTokens ?? usage.output_tokens ?? null;
  const c = r.classification;
  const seconds = voiceSeconds ?? c.voiceSeconds ?? null;

  let cost = actualCostEur;
  if (cost == null) {
    if (c.tier === 'voice') cost = estimateVoiceCostEur(seconds);
    else if (inTok != null || outTok != null) cost = estimateTokenCostEur(c.model, inTok, outTok);
    else cost = r.estimatedCostEur;
  }
  let credits = creditsCharged;
  if (credits == null) credits = c.tier === 'voice' && seconds != null ? computeVoiceCredits(seconds) : r.credits;

  const result = await finalizeCredits({
    requestId: r.requestId,
    userId: r.userId,
    actualCostEur: cost,
    creditsCharged: credits,
    inputTokens: inTok,
    outputTokens: outTok,
    cachedTokens,
    voiceSeconds: c.tier === 'voice' ? seconds : null,
    images: images ?? c.images ?? null,
  });
  if (result && result.ok === false) {
    console.error(`[creditGuard] finalize fehlgeschlagen (${r.requestId}):`, result.reason);
  }
  return result;
}

/** Gibt die Reservierung frei (Anbieter-Fehler, Abbruch). Wirft nie. */
export async function rollbackCreditGuard(req, reason = 'provider_error') {
  const r = req?.creditReservation;
  if (!r || r.settled) return null;
  r.settled = true;
  const result = await rollbackCredits({ requestId: r.requestId, userId: r.userId, reason });
  if (result && result.ok === false) {
    console.error(`[creditGuard] rollback fehlgeschlagen (${r.requestId}):`, result.reason);
  }
  return result;
}

async function reserveFor(req, requestId, classification, estimatedCostEur) {
  return reserveCredits({
    userId: req.user.id,
    requestId,
    feature: classification.feature,
    credits: classification.credits,
    estimatedCostEur,
    provider: providerFor(classification),
    model: classification.model,
  });
}

export function creditGuard(feature) {
  return async function creditGuardMiddleware(req, res, next) {
    if (!isCreditSystemEnabled()) return next();
    if (!req.user?.id) return res.status(401).json({ error: 'Auth erforderlich' });

    const classification = classifyFeature(feature, { body: req.body });
    req.aiModel = classification.model || undefined;

    // Superuser: unbegrenzt wie im alten Volumen — keine Reservierung.
    if (isSuperuserEmail(req.user.email)) {
      req.creditReservation = null;
      req.aiTokens = { feature, deferred: false, setUsage() {}, charge: async () => null, fail: async () => null };
      return next();
    }

    const { effectiveId } = resolvePlan(req.user);
    const creditPlan = mapPlanCodeToCreditPlan(effectiveId);
    const estimatedCostEur = estimateCostEur(classification);
    const requestId = generateRequestId();
    req.creditRequestId = requestId;

    let reservation = await reserveFor(req, requestId, classification, estimatedCostEur);
    if (!reservation.ok && reservation.reason === 'no_active_wallet') {
      // Lazy-Provisioning: erste Periode bzw. nächste Periode nachholen, einmal
      // erneut versuchen.
      const provisioned = await ensureCurrentWallet(req.user);
      if (provisioned.ok) reservation = await reserveFor(req, requestId, classification, estimatedCostEur);
    }

    if (!reservation.ok) {
      const reason = reservation.reason;
      if (reason === 'insufficient_credits' || reason === 'cost_limit_exceeded') return quotaResponse(res, reason);
      console.error(`[creditGuard] Reservierung abgelehnt (${feature}, ${requestId}):`, reason);
      return unavailableResponse(res, reason === 'credit_system_unavailable' ? 503 : 500, reason);
    }

    const r = {
      requestId,
      userId: req.user.id,
      feature,
      creditPlan,
      classification,
      credits: classification.credits,
      estimatedCostEur,
      reservation,
      providerUsage: null,
      settled: false,
    };
    req.creditReservation = r;
    req.aiTokens = {
      feature,
      cost: r.credits,
      deferred: false,
      setUsage(u) { r.providerUsage = u || null; },
      charge: () => finalizeCreditGuard(req),
      fail: (reason) => rollbackCreditGuard(req, reason),
    };

    // Vor dem Senden abschließen (Serverless friert nach Antwortende ein).
    const sendJson = res.json.bind(res);
    res.json = (body) => {
      if (req.aiTokens.deferred || r.settled) return sendJson(body);
      const settle = res.statusCode >= 400
        ? rollbackCreditGuard(req, `http_${res.statusCode}`)
        : finalizeCreditGuard(req);
      settle.catch(() => null).finally(() => sendJson(body));
      return res;
    };
    // Sicherheitsnetz: Antwort ohne json (Abbruch, Exception im Stream) → frei.
    res.on('close', () => {
      if (!r.settled) rollbackCreditGuard(req, 'connection_closed').catch(() => null);
    });
    return next();
  };
}

/**
 * Wählt je nach Flag das Abrechnungssystem — zur Laufzeit, damit ein
 * Umschalten der Env-Variable (bzw. Tests) ohne Neuaufbau der Routen greift.
 * @param {string} creditFeature   Feature für classifyFeature
 * @param {string} legacyFeature   Feature des alten meterAiTokens (chat/vision/tool/tts/realtime)
 * @param {object} legacyOptions   Optionen für meterAiTokens (z. B. { cost })
 */
export function chargeAi(creditFeature, legacyFeature = creditFeature, legacyOptions = {}) {
  const credit = creditGuard(creditFeature);
  const legacy = meterAiTokens(legacyFeature, legacyOptions);
  return function chargeAiMiddleware(req, res, next) {
    return isCreditSystemEnabled() ? credit(req, res, next) : legacy(req, res, next);
  };
}
