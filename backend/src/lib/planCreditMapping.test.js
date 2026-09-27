import { describe, it, expect } from 'vitest';
import { mapPlanCodeToCreditPlan } from './planCreditMapping.js';

describe('mapPlanCodeToCreditPlan', () => {
  it('bildet basic auf basic ab', () => {
    expect(mapPlanCodeToCreditPlan('basic')).toBe('basic');
  });
  it('erhält die Stufen und bildet alte Aliase ab', () => {
    expect(mapPlanCodeToCreditPlan('premium')).toBe('pro');
    expect(mapPlanCodeToCreditPlan('pro')).toBe('pro');
    expect(mapPlanCodeToCreditPlan('ELITE')).toBe('ultimate');
    expect(mapPlanCodeToCreditPlan('trial_10_10')).toBe('ultimate');
    expect(mapPlanCodeToCreditPlan('friends_monthly')).toBe('friends');
  });
  it('fällt bei free, unbekannt und leeren Werten auf free zurück', () => {
    for (const code of ['free', 'gold', '', null, undefined, 42, {}]) {
      expect(mapPlanCodeToCreditPlan(code)).toBe('free');
    }
  });
});
