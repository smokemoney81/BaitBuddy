import { describe, it, expect } from 'vitest';
import {
  parseLatitude,
  parseLongitude,
  parseCoordinates,
  parseOptionalCoordinates,
} from './coordinates.js';

// Regressionstests zu "Koordinaten-Manipulation verhindern" (Meilenstein 2).
// Die Routen liessen zuvor Werte ausserhalb des gueltigen Bereichs durch; sie
// landeten in der Datenbank oder in Upstream-URLs.
describe('parseLatitude / parseLongitude', () => {
  it('akzeptiert gueltige Zahlen', () => {
    expect(parseLatitude(53.55)).toBe(53.55);
    expect(parseLongitude(9.99)).toBe(9.99);
  });

  it('akzeptiert die Bereichsgrenzen', () => {
    expect(parseLatitude(-90)).toBe(-90);
    expect(parseLatitude(90)).toBe(90);
    expect(parseLongitude(-180)).toBe(-180);
    expect(parseLongitude(180)).toBe(180);
  });

  it('lehnt Werte ausserhalb des Bereichs ab', () => {
    expect(parseLatitude(90.1)).toBeNull();
    expect(parseLatitude(999)).toBeNull();
    expect(parseLongitude(-180.5)).toBeNull();
    expect(parseLongitude(99999)).toBeNull();
  });

  it('lehnt NaN und Infinity ab (typeof === "number" liess beide durch)', () => {
    expect(parseLatitude(NaN)).toBeNull();
    expect(parseLatitude(Infinity)).toBeNull();
    expect(parseLongitude(-Infinity)).toBeNull();
  });

  it('lehnt Nicht-Zahlen ab', () => {
    expect(parseLatitude('abc')).toBeNull();
    expect(parseLatitude(null)).toBeNull();
    expect(parseLatitude(undefined)).toBeNull();
    expect(parseLatitude('')).toBeNull();
    expect(parseLatitude({})).toBeNull();
    expect(parseLatitude([1, 2])).toBeNull();
  });

  it('lehnt Booleans ab, obwohl Number(true) === 1 gilt', () => {
    expect(parseLatitude(true)).toBeNull();
    expect(parseLatitude(false)).toBeNull();
  });

  it('schneidet angehaengten Text nicht still ab', () => {
    // `parseFloat('52.5&extra=1')` waere 52.5 — der Rest koennte sonst in eine
    // Upstream-URL geraten.
    expect(parseLatitude('52.5&extra=1')).toBeNull();
    expect(parseLatitude('52.5abc')).toBeNull();
  });

  it('nimmt saubere Zahl-Strings an', () => {
    expect(parseLatitude('53.55')).toBe(53.55);
    expect(parseLongitude('-9.5')).toBe(-9.5);
  });
});

describe('parseCoordinates', () => {
  it('liefert das geprüfte Paar', () => {
    expect(parseCoordinates(53.55, 9.99)).toEqual({
      ok: true,
      latitude: 53.55,
      longitude: 9.99,
    });
  });

  it('meldet einen Fehler, sobald ein Wert ungueltig ist', () => {
    expect(parseCoordinates(999, 9.99).ok).toBe(false);
    expect(parseCoordinates(53.55, 999).ok).toBe(false);
    expect(parseCoordinates(undefined, undefined).ok).toBe(false);
  });

  it('nennt den gueltigen Bereich in der Fehlermeldung', () => {
    const result = parseCoordinates(999, 999);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/-90/);
    expect(result.error).toMatch(/-180/);
  });
});

describe('parseOptionalCoordinates', () => {
  it('erlaubt, dass beide fehlen', () => {
    expect(parseOptionalCoordinates(null, null)).toEqual({
      ok: true,
      latitude: null,
      longitude: null,
    });
    expect(parseOptionalCoordinates(undefined, undefined).ok).toBe(true);
  });

  it('lehnt eine halbe Position ab', () => {
    expect(parseOptionalCoordinates(53.55, null).ok).toBe(false);
    expect(parseOptionalCoordinates(null, 9.99).ok).toBe(false);
  });

  it('prueft vorhandene Werte weiterhin auf den Bereich', () => {
    expect(parseOptionalCoordinates(999, 9.99).ok).toBe(false);
    expect(parseOptionalCoordinates(53.55, 9.99).ok).toBe(true);
  });
});
