import { describe, it, expect } from 'vitest';
import { contextBudget, sentenceRange, TIERS } from '../../backend/src/lib/personalizationEngine.js';
import { TIER_BUDGET, TIER_SENTENCES, PLAN_TIERS, capabilityRows } from './planAiCapabilities.js';

describe('planAiCapabilities – Spiegel der Backend-Tarifstufen', () => {
  it('kennt dieselben Stufen wie das Backend', () => {
    expect(PLAN_TIERS.map(p => p.tier)).toEqual(TIERS);
  });

  it.each(TIERS)('Kontext-Budget für %s stimmt mit contextBudget überein', (tier) => {
    expect(TIER_BUDGET[tier]).toEqual(contextBudget(tier));
  });

  it.each(TIERS)('Satzspanne für %s stimmt mit sentenceRange(normal) überein', (tier) => {
    expect(TIER_SENTENCES[tier]).toEqual(sentenceRange(tier, 'normal'));
  });

  it('liefert pro Zeile genau eine Zelle je Tarif', () => {
    for (const row of capabilityRows({ voiceRequiredPlanRank: 1 })) {
      expect(row.cells).toHaveLength(PLAN_TIERS.length);
    }
  });

  it('sperrt Voice unterhalb des geforderten Tarifs', () => {
    const voice = capabilityRows({ voiceRequiredPlanRank: 1 }).find(r => r.id === 'voice');
    expect(voice.cells.map(c => c.text)).toEqual(['Nicht verfügbar', 'Verfügbar', 'Verfügbar', 'Verfügbar']);
  });
});
