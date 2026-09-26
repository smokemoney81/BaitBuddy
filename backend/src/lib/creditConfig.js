// Zentrale Zahlen des Credit-Systems (Tarife, Credit-Kosten je Funktion,
// Aufladepakete). Alle Werte per Env überschreibbar (JSON), Muster wie
// AI_TOKEN_QUOTAS/AI_TOKEN_COSTS in aiTokenQuota.js. Ungültiges JSON fällt
// sauber auf die Standardwerte zurück.

export const DEFAULT_CREDIT_PLANS = Object.freeze({
  free: Object.freeze({ includedCredits: 300, costLimitEur: 0.05, adsEnabled: true }),
  basic: Object.freeze({ includedCredits: 2500, costLimitEur: 0.5, adsEnabled: true }),
  premium: Object.freeze({ includedCredits: 10000, costLimitEur: 2.0, adsEnabled: false }),
});

export const DEFAULT_CREDIT_COSTS = Object.freeze({
  buddy_simple_text: 10,
  buddy_personal_data: 25,
  buddy_complex: 50,
  buddy_deep_reasoning: 150,
  buddy_research: 500,
  weather_ai_analysis: 10,
  lure_recommendation: 20,
  catch_analysis: 50,
  fish_image_analysis: 100,
  gear_image_analysis: 100,
  trip_ai_planning: 150,
  spot_ai_analysis: 150,
  satellite_standard: 250,
  satellite_deep: 500,
  deep_research_min: 500,
  deep_research_max: 1000,
  voice_minute: 300,
});

export const TOPUP_PACKAGES = Object.freeze([
  Object.freeze({ credits: 2500, priceCents: 249 }),
  Object.freeze({ credits: 7500, priceCents: 499 }),
  Object.freeze({ credits: 15000, priceCents: 899 }),
  Object.freeze({ credits: 30000, priceCents: 1499 }),
]);

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`[creditConfig] ${name} ist kein gültiges JSON — Standardwerte aktiv`);
    return {};
  }
}

function nonNegative(value, fallback, { integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return integer ? Math.floor(n) : n;
}

export function getCreditPlans() {
  const overrides = parseJsonEnv('CREDIT_PLANS_JSON');
  const plans = {};
  for (const [code, def] of Object.entries(DEFAULT_CREDIT_PLANS)) {
    const o = overrides[code] && typeof overrides[code] === 'object' ? overrides[code] : {};
    plans[code] = {
      includedCredits: nonNegative(o.includedCredits, def.includedCredits, { integer: true }),
      costLimitEur: nonNegative(o.costLimitEur, def.costLimitEur),
      adsEnabled: typeof o.adsEnabled === 'boolean' ? o.adsEnabled : def.adsEnabled,
    };
  }
  return plans;
}

export function getCreditCosts() {
  const overrides = parseJsonEnv('CREDIT_COSTS_JSON');
  const costs = {};
  for (const [key, fallback] of Object.entries(DEFAULT_CREDIT_COSTS)) {
    costs[key] = nonNegative(overrides[key], fallback, { integer: true });
  }
  return costs;
}

// Sekundengenaue Voice-Abrechnung: 61 s bei 300/min → 305 Credits.
export function computeVoiceCredits(seconds, costs = getCreditCosts()) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.ceil((s / 60) * costs.voice_minute);
}

export function isCreditSystemEnabled() {
  return process.env.AI_CREDIT_SYSTEM_ENABLED === 'true';
}
