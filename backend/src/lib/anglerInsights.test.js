import { describe, it, expect } from 'vitest';
import { deriveCatchPatterns, MIN_SAMPLE } from './anglerInsights.js';

function catchRow(overrides = {}) {
  return {
    species: 'Hecht',
    bait_used: 'Gummifisch',
    water_body: 'Rhein',
    catch_time: '2026-05-14T07:30:00.000Z',
    weight_kg: 3,
    ...overrides,
  };
}

function byId(result, id) {
  return result.patterns.find((p) => p.id === id);
}

describe('deriveCatchPatterns', () => {
  it('leitet unterhalb der Mindest-Stichprobe nichts ab', () => {
    const result = deriveCatchPatterns([catchRow(), catchRow()]);
    expect(result.enoughData).toBe(false);
    expect(result.patterns).toEqual([]);
    expect(result.total).toBe(2);
  });

  it('kommt mit fehlender oder unbrauchbarer Eingabe zurecht', () => {
    expect(deriveCatchPatterns()).toEqual({ enoughData: false, total: 0, patterns: [] });
    expect(deriveCatchPatterns(null).enoughData).toBe(false);
    expect(deriveCatchPatterns('kaputt').total).toBe(0);
  });

  it('nennt die meistgefangene Art mit ihrer Stichprobe', () => {
    const rows = [
      ...Array.from({ length: 4 }, () => catchRow({ species: 'Zander' })),
      catchRow({ species: 'Hecht' }),
    ];
    const species = byId(deriveCatchPatterns(rows), 'top_species');
    expect(species.value).toBe('Zander');
    expect(species.detail).toBe('4 von 5 Fängen (80 %)');
  });

  it('leitet kein Muster ab, wenn kein Wert die Mindest-Stichprobe erreicht', () => {
    const rows = [
      catchRow({ species: 'Hecht' }),
      catchRow({ species: 'Zander' }),
      catchRow({ species: 'Barsch' }),
      catchRow({ species: 'Aal' }),
    ];
    expect(byId(deriveCatchPatterns(rows), 'top_species')).toBeUndefined();
  });

  it('ignoriert leere und fehlende Werte, statt sie mitzuzaehlen', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => catchRow({ bait_used: 'Wobbler' })),
      catchRow({ bait_used: '   ' }),
      catchRow({ bait_used: null }),
    ];
    const bait = byId(deriveCatchPatterns(rows), 'top_bait');
    expect(bait.value).toBe('Wobbler');
    // Gezaehlt werden 3 Treffer, die Gesamtmenge bleiben alle 5 Faenge — leere
    // Werte verschwinden aus dem Zaehler, nicht aus der Bezugsgroesse.
    expect(bait.detail).toBe('3 von 5 Fängen (60 %)');
  });

  it('faellt beim Gewaesser auf den Spot-Namen zurueck', () => {
    const rows = Array.from({ length: 3 }, () => catchRow({ water_body: null, spot_name: 'Buhne 12' }));
    expect(byId(deriveCatchPatterns(rows), 'top_water').value).toBe('Buhne 12');
  });

  it('ordnet die erfolgreichste Tageszeit zu', () => {
    // 07:30 lokal ist Morgen; die Testumgebung laeuft in UTC.
    const rows = Array.from({ length: 3 }, () => catchRow({ catch_time: '2026-05-14T07:30:00.000Z' }));
    expect(byId(deriveCatchPatterns(rows), 'top_daypart').value).toBe('Morgen');
  });

  it('zaehlt fuer die Tageszeit nur Faenge mit gueltiger Zeitangabe', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => catchRow({ catch_time: '2026-05-14T07:30:00.000Z' })),
      catchRow({ catch_time: null }),
      catchRow({ catch_time: 'kein Datum' }),
    ];
    const daypart = byId(deriveCatchPatterns(rows), 'top_daypart');
    expect(daypart.detail).toContain('3 von 3 Fängen mit Zeitangabe');
  });

  it('nennt den schwersten Fang nur bei genug Gewichtsangaben', () => {
    const withWeights = Array.from({ length: 3 }, (_, i) => catchRow({ weight_kg: i + 1 }));
    expect(byId(deriveCatchPatterns(withWeights), 'personal_best').value).toBe('3.00 kg');

    const withoutWeights = Array.from({ length: 3 }, () => catchRow({ weight_kg: null }));
    expect(byId(deriveCatchPatterns(withoutWeights), 'personal_best')).toBeUndefined();
  });

  it('haengt an jedes Muster eine nachvollziehbare Stichprobe', () => {
    const rows = Array.from({ length: MIN_SAMPLE }, () => catchRow());
    for (const pattern of deriveCatchPatterns(rows).patterns) {
      expect(pattern.detail).toBeTruthy();
      expect(pattern.value).toBeTruthy();
      expect(pattern.label).toBeTruthy();
    }
  });
});
