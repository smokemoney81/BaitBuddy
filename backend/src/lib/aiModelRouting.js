// Modellrouting + Feature-Klassifizierung für das Credit-System.
//
// Jede kostenpflichtige KI-Route nennt ein `feature` (wie bisher bei
// meterAiTokens). `classifyFeature` bildet es auf
//   (a) eine Kostenkategorie aus creditConfig.CREDIT_COSTS und
//   (b) eine Routing-Stufe (low/medium/high/vision/voice) ab.
// Die Stufe wählt über AI_MODEL_ROUTES das Anthropic-Modell.
//
// Modelle: nur IDs, die das Projekt bereits nennt (llm.js-Default
// claude-haiku-4-5; CLAUDE.md nennt claude-opus-4-8 als ANTHROPIC_MODEL-Beispiel).
// Ohne Env-Konfiguration laufen alle Stufen auf demselben Modell wie bisher
// (ANTHROPIC_MODEL bzw. claude-haiku-4-5) — das Routing ändert das Verhalten
// also erst, wenn ANTHROPIC_MODEL_HIGH oder AI_MODEL_ROUTES_JSON gesetzt ist.
import { getCreditCosts, computeVoiceCredits } from './creditConfig.js';

const DEFAULT_MODEL = 'claude-haiku-4-5';

export const ROUTE_TIERS = Object.freeze(['low', 'medium', 'high', 'vision', 'voice']);

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`[aiModelRouting] ${name} ist kein gültiges JSON — Standardwerte aktiv`);
    return {};
  }
}

/**
 * Modell je Routing-Stufe. `voice` hat kein Anthropic-Modell (TTS/Realtime
 * laufen über eigene Anbieter) und ist deshalb null.
 */
export function getModelRoutes() {
  const base = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const defaults = {
    low: base,
    medium: base,
    high: process.env.ANTHROPIC_MODEL_HIGH || base,
    vision: process.env.ANTHROPIC_MODEL_VISION || base,
    voice: null,
  };
  const overrides = parseJsonEnv('AI_MODEL_ROUTES_JSON');
  const routes = {};
  for (const tier of ROUTE_TIERS) {
    const o = overrides[tier];
    routes[tier] = typeof o === 'string' && o.trim() ? o.trim() : defaults[tier];
  }
  return routes;
}

export function modelForTier(tier) {
  return getModelRoutes()[tier] ?? null;
}

// Grobe, begründete Heuristik für den Buddy-Chat — dieselben Signale, mit denen
// buildChatPrompt (routes/ai.js) den App-Kontext lädt:
//   persönliche Daten (Fangbuch/Spots/Trips)      → buddy_personal_data
//   lange/mehrteilige Frage oder Anleitung        → buddy_complex
//   sonst                                         → buddy_simple_text
const PERSONAL_PATTERN = /fang|fänge|gefangen|fangbuch|logbuch|spot|angelplatz|trip|ausflug|tour|planung|packliste|ausrüstung|ausruestung|meine[nmrs]?\b/i;
const COMPLEX_PATTERN = /wie (montiere|baue|führe|fuehre|binde|benutze)|schritt für schritt|schritt fuer schritt|erklär|erklaer|vergleich|unterschied|warum/i;
const COMPLEX_LENGTH = 280;

export function lastUserMessage(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role !== 'assistant' && typeof m.content === 'string') return m.content;
  }
  return '';
}

export function classifyChat(message) {
  const text = typeof message === 'string' ? message : '';
  if (text.length > COMPLEX_LENGTH || COMPLEX_PATTERN.test(text)) {
    return { category: 'buddy_complex', tier: 'medium' };
  }
  if (PERSONAL_PATTERN.test(text)) return { category: 'buddy_personal_data', tier: 'low' };
  return { category: 'buddy_simple_text', tier: 'low' };
}

// Zeichen → Sekunden für Vorlesen. Deutsche Sprachausgabe liegt bei rund
// 14–15 Zeichen/s; 14 ist bewusst leicht konservativ (eher etwas mehr Sekunden).
export const TTS_CHARS_PER_SECOND = 14;

export function estimateTtsSeconds(textLength) {
  const n = Number(textLength);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.ceil(n / TTS_CHARS_PER_SECOND));
}

// Live-Voice: der Server mintet nur ein Token (expires_after 600 s); die
// Gesprächsminuten laufen am Server vorbei. Reserviert wird deshalb eine feste
// Sitzungsdauer (Env REALTIME_SESSION_BILLED_SECONDS, Default 60 s).
export function realtimeBilledSeconds() {
  const n = Number(process.env.REALTIME_SESSION_BILLED_SECONDS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

/**
 * @param {string} feature  Routen-Feature (chat, vision, analyze-catch, …)
 * @param {{ body?: object, message?: string }} context
 * @returns {{ feature, category, tier, model, credits, voiceSeconds?, images? }}
 */
export function classifyFeature(feature, context = {}) {
  const costs = getCreditCosts();
  const body = context.body || {};
  let result;

  switch (feature) {
    case 'chat': {
      const message = typeof context.message === 'string' ? context.message : lastUserMessage(body);
      result = classifyChat(message);
      break;
    }
    case 'analyze-catch':
    case 'analyze-photo':
    case 'vision':
      result = { category: 'fish_image_analysis', tier: 'vision', images: 1 };
      break;
    case 'recognize-gear':
      result = { category: 'gear_image_analysis', tier: 'vision', images: 1 };
      break;
    case 'evaluate-catch':
    case 'generate-catch-report':
      result = { category: 'catch_analysis', tier: 'medium' };
      break;
    case 'fishing-recommendation':
      // Kombiniert Wetter + Fangbuch zu Köder-/Zeitempfehlungen.
      result = { category: 'lure_recommendation', tier: 'low' };
      break;
    case 'fish-behavior-analysis':
      result = { category: 'weather_ai_analysis', tier: 'low' };
      break;
    case 'fish-recipes':
    case 'gear-maintenance-tips':
      result = { category: 'buddy_simple_text', tier: 'low' };
      break;
    case 'satellite-analysis':
      // Nur Standard: die Route hat keinen „Tiefen“-Modus (eine LLM-Auswertung
      // von Open-Meteo-Daten). satellite_deep ist für eine spätere Variante.
      result = { category: 'satellite_standard', tier: 'high' };
      break;
    case 'tts': {
      const len = typeof body.text === 'string' ? body.text.length : 0;
      const seconds = estimateTtsSeconds(len);
      return { feature, category: 'voice_minute', tier: 'voice', model: null,
        credits: computeVoiceCredits(seconds, costs), voiceSeconds: seconds };
    }
    case 'realtime-session': {
      const seconds = realtimeBilledSeconds();
      return { feature, category: 'voice_minute', tier: 'voice', model: null,
        credits: computeVoiceCredits(seconds, costs), voiceSeconds: seconds };
    }
    default:
      // Unbekanntes Feature: kleinste Textkategorie statt 0 (nie gratis).
      result = { category: 'buddy_simple_text', tier: 'low' };
  }

  return {
    feature,
    ...result,
    model: modelForTier(result.tier),
    credits: costs[result.category] ?? costs.buddy_simple_text,
  };
}

// ── Anbieter-Kostenschätzung (EUR) ──────────────────────────────────────────
// Listenpreise in USD je 1 Mio. Token (Anthropic-Preisliste). Per
// AI_MODEL_PRICING_JSON überschreibbar ({"model":{"input":x,"output":y}}),
// Wechselkurs per AI_USD_TO_EUR (Default 0.92). Unbekannte Modelle werden mit
// dem teuersten bekannten Satz geschätzt (lieber zu hoch als zu niedrig).
export const DEFAULT_MODEL_PRICING_USD = Object.freeze({
  'claude-haiku-4-5': Object.freeze({ input: 1, output: 5 }),
  'claude-opus-4-8': Object.freeze({ input: 5, output: 25 }),
});

function modelPricing(model) {
  const overrides = parseJsonEnv('AI_MODEL_PRICING_JSON');
  const table = { ...DEFAULT_MODEL_PRICING_USD, ...overrides };
  const p = table[model];
  if (p && Number.isFinite(Number(p.input)) && Number.isFinite(Number(p.output))) {
    return { input: Number(p.input), output: Number(p.output) };
  }
  let worst = { input: 0, output: 0 };
  for (const v of Object.values(table)) {
    if (Number(v?.output) > worst.output) worst = { input: Number(v.input), output: Number(v.output) };
  }
  return worst;
}

function usdToEur() {
  const n = Number(process.env.AI_USD_TO_EUR);
  return Number.isFinite(n) && n > 0 ? n : 0.92;
}

// Typische Tokenmengen je Stufe für die VORAB-Reservierung. Der Chat-Prompt
// enthält Wissensbasis + FAQ-Auszüge (~6–8k Token); Bilder kosten ~1,5k Token.
const TOKEN_ESTIMATES = {
  low: { input: 8000, output: 800 },
  medium: { input: 8000, output: 1600 },
  high: { input: 4000, output: 1500 },
  vision: { input: 2500, output: 800 },
};

export function estimateTokenCostEur(model, inputTokens, outputTokens) {
  const p = modelPricing(model);
  const usd = ((Number(inputTokens) || 0) * p.input + (Number(outputTokens) || 0) * p.output) / 1_000_000;
  return Math.round(usd * usdToEur() * 1e6) / 1e6;
}

// Voice-Kosten sind anbieterabhängig (OpenAI/ElevenLabs/Google, siehe
// multiProviderTTS.buildProviderChain) und nicht in Token messbar. Näherung per
// Env: AI_VOICE_COST_EUR_PER_MINUTE (Default 0.06).
export function estimateVoiceCostEur(seconds) {
  const perMin = Number(process.env.AI_VOICE_COST_EUR_PER_MINUTE);
  const rate = Number.isFinite(perMin) && perMin >= 0 ? perMin : 0.06;
  return Math.round(((Number(seconds) || 0) / 60) * rate * 1e6) / 1e6;
}

export function estimateCostEur(classification) {
  if (classification.tier === 'voice') return estimateVoiceCostEur(classification.voiceSeconds);
  const t = TOKEN_ESTIMATES[classification.tier] || TOKEN_ESTIMATES.low;
  return estimateTokenCostEur(classification.model, t.input, t.output);
}
