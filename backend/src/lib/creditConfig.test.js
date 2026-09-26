import { describe, it, expect, afterEach } from 'vitest';
import {
  getCreditPlans, getCreditCosts, computeVoiceCredits, isCreditSystemEnabled,
  DEFAULT_CREDIT_PLANS, DEFAULT_CREDIT_COSTS, TOPUP_PACKAGES,
} from './creditConfig.js';

afterEach(() => {
  delete process.env.CREDIT_PLANS_JSON;
  delete process.env.CREDIT_COSTS_JSON;
  delete process.env.AI_CREDIT_SYSTEM_ENABLED;
});

const defaultPlans = () => Object.fromEntries(
  Object.entries(DEFAULT_CREDIT_PLANS).map(([k, v]) => [k, { ...v }]),
);

describe('Standardwerte', () => {
  it('liefert die Tarife der Spezifikation', () => {
    expect(getCreditPlans()).toEqual({
      free: { includedCredits: 300, costLimitEur: 0.05, adsEnabled: true },
      basic: { includedCredits: 2500, costLimitEur: 0.5, adsEnabled: true },
      premium: { includedCredits: 10000, costLimitEur: 2, adsEnabled: false },
    });
  });
  it('liefert die Credit-Kosten und Aufladepakete', () => {
    const c = getCreditCosts();
    expect(c).toEqual({ ...DEFAULT_CREDIT_COSTS });
    expect(c.voice_minute).toBe(300);
    expect(c.buddy_research).toBe(500);
    expect(TOPUP_PACKAGES.map((p) => [p.credits, p.priceCents]))
      .toEqual([[2500, 249], [7500, 499], [15000, 899], [30000, 1499]]);
  });
});

describe('Env-Overrides', () => {
  it('übernimmt gültige JSON-Werte', () => {
    process.env.CREDIT_PLANS_JSON = JSON.stringify({ basic: { includedCredits: 3000, adsEnabled: false } });
    process.env.CREDIT_COSTS_JSON = JSON.stringify({ voice_minute: 120 });
    expect(getCreditPlans().basic).toEqual({ includedCredits: 3000, costLimitEur: 0.5, adsEnabled: false });
    expect(getCreditPlans().free).toEqual({ ...DEFAULT_CREDIT_PLANS.free });
    expect(getCreditCosts().voice_minute).toBe(120);
    expect(computeVoiceCredits(60)).toBe(120);
  });
  it('fällt bei ungültigem JSON und ungültigen Werten auf Standard zurück', () => {
    process.env.CREDIT_PLANS_JSON = '{kaputt';
    process.env.CREDIT_COSTS_JSON = JSON.stringify({ voice_minute: -5, catch_analysis: 'x' });
    expect(getCreditPlans()).toEqual(defaultPlans());
    expect(getCreditCosts().voice_minute).toBe(300);
    expect(getCreditCosts().catch_analysis).toBe(50);
    process.env.CREDIT_COSTS_JSON = '[1,2]';
    expect(getCreditCosts()).toEqual({ ...DEFAULT_CREDIT_COSTS });
  });
});

describe('computeVoiceCredits', () => {
  it('rechnet sekundengenau statt in vollen Minuten', () => {
    expect(computeVoiceCredits(61)).toBe(305);
    expect(computeVoiceCredits(60)).toBe(300);
    expect(computeVoiceCredits(59)).toBe(295);
    expect(computeVoiceCredits(119)).toBe(595);
    expect(computeVoiceCredits(1)).toBe(5);
    expect(computeVoiceCredits(0)).toBe(0);
    expect(computeVoiceCredits(-3)).toBe(0);
    expect(computeVoiceCredits(Number.NaN)).toBe(0);
  });
});

describe('isCreditSystemEnabled', () => {
  it('ist nur bei exakt "true" aktiv', () => {
    expect(isCreditSystemEnabled()).toBe(false);
    process.env.AI_CREDIT_SYSTEM_ENABLED = '1';
    expect(isCreditSystemEnabled()).toBe(false);
    process.env.AI_CREDIT_SYSTEM_ENABLED = 'true';
    expect(isCreditSystemEnabled()).toBe(true);
  });
});
