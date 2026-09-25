import { describe, it, expect, beforeEach } from 'vitest';
import { recordTripEvent, tripEventsSince, distanceMeters, bearingWord } from './tripLog';
import { beaufort, compassDirection, fishingMoment, weatherKind } from './anglerMode';

describe('tripLog', () => {
  beforeEach(() => localStorage.clear());

  it('liefert nur Ereignisse seit Trip-Start', () => {
    const start = Date.now() - 60000;
    recordTripEvent('bite', { source: 'Schnur' }, start - 1000);
    recordTripEvent('bite', { source: 'Rutenspitze' }, start + 1000);
    expect(tripEventsSince(start).map(e => e.source)).toEqual(['Rutenspitze']);
  });

  it('verwirft Einträge älter als drei Tage', () => {
    recordTripEvent('move', {}, Date.now() - 4 * 86400000);
    recordTripEvent('move', {}, Date.now());
    expect(tripEventsSince(0)).toHaveLength(1);
  });

  it('misst Entfernung und Richtung', () => {
    const a = { lat: 51.49, lon: 8.06 };
    const b = { lat: 51.4889, lon: 8.06 };
    expect(Math.round(distanceMeters(a, b))).toBe(122);
    expect(bearingWord(a, b)).toBe('südlich');
  });
});

describe('Anglermodus-Helfer', () => {
  it.each([[0, 0], [5, 1], [14, 3], [30, 5], [120, 12]])('%i km/h = %i Bft', (kmh, bft) => {
    expect(beaufort(kmh)).toBe(bft);
  });

  it('übersetzt Windrichtungen', () => {
    expect(compassDirection(270)).toBe('W');
    expect(compassDirection(-45)).toBe('NW');
    expect(compassDirection(null)).toBeNull();
  });

  it('bewertet die Angelzeit nach Bissindex', () => {
    expect(fishingMoment(78)).toBe('Perfekte Zeit zum Angeln!');
    expect(fishingMoment(null)).toMatch(/Standort/);
  });

  it('ordnet Wettercodes zu', () => {
    expect(weatherKind(2, true)).toBe('partly-night');
    expect(weatherKind(63)).toBe('rain');
    expect(weatherKind(96)).toBe('storm');
  });
});
