import { describe, it, expect } from 'vitest';
import { normalizeFishing, DEFAULT_FISHING_PREFERENCES, normalizeAngler, DEFAULT_ANGLER, EXPERIENCE_OPTIONS } from './buddyPreferences';

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

describe('normalizeAngler', () => {
  it('liefert den Standard fuer unbrauchbare Eingaben', () => {
    expect(normalizeAngler(null)).toEqual(DEFAULT_ANGLER);
    expect(normalizeAngler('kaputt')).toEqual(DEFAULT_ANGLER);
    expect(normalizeAngler([])).toEqual(DEFAULT_ANGLER);
  });

  it('akzeptiert nur bekannte Erfahrungsstufen', () => {
    for (const option of EXPERIENCE_OPTIONS) {
      expect(normalizeAngler({ experience: option.id }).experience).toBe(option.id);
    }
    expect(normalizeAngler({ experience: 'profi' }).experience).toBeNull();
  });

  it('akzeptiert nur zweistellige Bundesland-Kennungen', () => {
    expect(normalizeAngler({ region: 'nw' }).region).toBe('nw');
    expect(normalizeAngler({ region: 'Nordrhein-Westfalen' }).region).toBeNull();
    expect(normalizeAngler({ region: 'NW' }).region).toBeNull();
    expect(normalizeAngler({ region: 42 }).region).toBeNull();
  });

  it('entfernt Duplikate und begrenzt die Ziele', () => {
    const goals = normalizeAngler({ goals: ['Entspannung', 'Entspannung', 'A', 'B', 'C', 'D', 'E', 'F'] }).goals;
    expect(goals).toHaveLength(6);
    expect(new Set(goals).size).toBe(6);
  });

  it('ignoriert Ziele, die keine Zeichenketten sind', () => {
    expect(normalizeAngler({ goals: [1, null, { a: 1 }, 'Entspannung'] }).goals).toEqual(['Entspannung']);
  });
});
