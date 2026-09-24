import { describe, it, expect } from 'vitest';
import {
  getRulesForSpeciesAndState,
  getSpeciesListForState,
  getSupportedStates,
} from './fishingRules.js';

describe('getRulesForSpeciesAndState', () => {
  it('returns NRW rules for Hecht', () => {
    const r = getRulesForSpeciesAndState('Hecht', 'NRW');
    expect(r.found).toBe(true);
    expect(r.species).toBe('Hecht');
    expect(r.state).toBe('NRW');
    expect(r.closedFrom).toBe('02-01');
    expect(r.closedTo).toBe('05-15');
    expect(r.minSizeCm).toBe(60);
  });

  it('accepts lowercase species and state aliases', () => {
    const r = getRulesForSpeciesAndState('hecht', 'nordrhein-westfalen');
    expect(r.found).toBe(true);
    expect(r.state).toBe('NRW');
  });

  it('resolves english species aliases', () => {
    const r = getRulesForSpeciesAndState('pike', 'NRW');
    expect(r.found).toBe(true);
    expect(r.species).toBe('Hecht');
  });

  it('returns found:false for unknown species', () => {
    const r = getRulesForSpeciesAndState('Unbekannt', 'NRW');
    expect(r.found).toBe(false);
    expect(r.closedFrom).toBeNull();
    expect(r.minSizeCm).toBeNull();
  });

  it('returns found:false for unknown state', () => {
    const r = getRulesForSpeciesAndState('Hecht', 'Testland');
    expect(r.found).toBe(false);
  });

  it('returns rules with no closedSeason for Barsch', () => {
    const r = getRulesForSpeciesAndState('Barsch', 'NRW');
    expect(r.found).toBe(true);
    expect(r.closedFrom).toBeNull();
    expect(r.closedTo).toBeNull();
    expect(r.minSizeCm).toBe(20);
  });

  it('returns found:false for null inputs', () => {
    expect(getRulesForSpeciesAndState(null, 'NRW').found).toBe(false);
    expect(getRulesForSpeciesAndState('Hecht', null).found).toBe(false);
  });
});

describe('getSpeciesListForState', () => {
  it('returns list for NRW', () => {
    const list = getSpeciesListForState('NRW');
    expect(list).toContain('Hecht');
    expect(list).toContain('Zander');
    expect(list).toContain('Forelle');
    expect(list.length).toBeGreaterThan(5);
  });

  it('returns empty for unknown state', () => {
    expect(getSpeciesListForState('Atlantis')).toEqual([]);
  });
});

describe('getSupportedStates', () => {
  it('includes NRW', () => {
    expect(getSupportedStates()).toContain('NRW');
  });
});
