import { describe, it, expect } from 'vitest';
import { mapPlanCodeToCreditPlan } from './planCreditMapping.js';

describe('mapPlanCodeToCreditPlan', () => {
  it('bildet basic auf basic ab', () => {
    expect(mapPlanCodeToCreditPlan('basic')).toBe('basic');
  });
  it('bildet alle Premium-Aliase auf premium ab', () => {
    for (const code of ['premium', 'pro', 'elite', 'ultimate', 'friends_monthly', 'trial_10_10', 'friends', 'ELITE']) {
      expect(mapPlanCodeToCreditPlan(code)).toBe('premium');
    }
  });
  it('fällt bei free, unbekannt und leeren Werten auf free zurück', () => {
    for (const code of ['free', 'gold', '', null, undefined, 42, {}]) {
      expect(mapPlanCodeToCreditPlan(code)).toBe('free');
    }
  });
});
