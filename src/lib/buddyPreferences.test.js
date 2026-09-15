import { describe, it, expect } from 'vitest';
import { normalizeFishing, DEFAULT_FISHING_PREFERENCES } from './buddyPreferences';

describe('normalizeFishing', () => {
  it('returns empty defaults for missing or invalid input', () => {
    expect(normalizeFishing()).toEqual(DEFAULT_FISHING_PREFERENCES);
    expect(normalizeFishing(null)).toEqual(DEFAULT_FISHING_PREFERENCES);
    expect(normalizeFishing('nope')).toEqual(DEFAULT_FISHING_PREFERENCES);
    expect(normalizeFishing([])).toEqual(DEFAULT_FISHING_PREFERENCES);
  });

  it('trims, dedupes and drops non-strings in the string lists', () => {
    const result = normalizeFishing({
      targetSpecies: ['Hecht', ' Hecht ', 'Zander', 42, null, ''],
      methods: ['Spinnfischen'],
      waterTypes: ['See', 'See'],
      favoriteLures: ['Gummifisch', 'Wobbler'],
    });
    expect(result.targetSpecies).toEqual(['Hecht', 'Zander']);
    expect(result.methods).toEqual(['Spinnfischen']);
    expect(result.waterTypes).toEqual(['See']);
    expect(result.favoriteLures).toEqual(['Gummifisch', 'Wobbler']);
  });

  it('caps each list at 12 entries', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Art${i}`);
    expect(normalizeFishing({ targetSpecies: many }).targetSpecies).toHaveLength(12);
  });

  it('accepts only a valid HH:MM time window', () => {
    expect(normalizeFishing({ preferredTime: { start: '05:30', end: '10:00' } }).preferredTime)
      .toEqual({ start: '05:30', end: '10:00' });
    expect(normalizeFishing({ preferredTime: { start: '5:30', end: '10:00' } }).preferredTime).toBeNull();
    expect(normalizeFishing({ preferredTime: { start: '25:00', end: '10:00' } }).preferredTime).toBeNull();
    expect(normalizeFishing({ preferredTime: { start: '05:30' } }).preferredTime).toBeNull();
    expect(normalizeFishing({ preferredTime: 'morgens' }).preferredTime).toBeNull();
  });
});
