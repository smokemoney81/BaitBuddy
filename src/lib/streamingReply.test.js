import { describe, it, expect } from 'vitest';
import { stripActionMarker } from './streamingReply';

describe('stripActionMarker – Aktions-Block-Filterung', () => {
  it('gibt leeren String bei leerer Eingabe zurück', () => {
    expect(stripActionMarker('')).toBe('');
    expect(stripActionMarker(null)).toBe('');
    expect(stripActionMarker(undefined)).toBe('');
  });

  it('gibt Volltext zurück, wenn kein Aktions-Block vorhanden', () => {
    const text = 'Das ist eine normale KI-Antwort ohne Aktionen.';
    expect(stripActionMarker(text)).toBe(text);
  });

  it('entfernt Aktions-Block mit <<ACTION>> Marker', () => {
    const text = 'Erste Sätze<<ACTION>>{"type":"suggest"}<<END>>';
    expect(stripActionMarker(text)).toBe('Erste Sätze');
  });

  it('entfernt nackten JSON-Aktions-Block ohne Marker', () => {
    const text = 'Text{"type":"action"}';
    expect(stripActionMarker(text)).toBe('Text');
  });

  it('entfernt JSON mit Whitespace', () => {
    const text = 'Antwort {  "type"  : "suggest" }';
    expect(stripActionMarker(text)).toBe('Antwort ');
  });

  it('handles mehrere potenzielle Aktions-Positionen', () => {
    // Nur die erste Position wird geschnitten
    const text = 'Text1<<ACTION>>Block1 Text2{"type":"block2"}';
    expect(stripActionMarker(text)).toBe('Text1');
  });

  it('behält Text vor Aktions-Block, entfernt Block selbst', () => {
    const text = 'Das ist ein Satz. Und noch einer.<<ACTION>>{"action":"suggest"}';
    expect(stripActionMarker(text)).toBe('Das ist ein Satz. Und noch einer.');
  });

  it('handhabt angeschnittene Marker am Text-Ende', () => {
    // Wenn der Text mit "<" endet, könnte das Anfang eines "<<ACTION>>" sein
    const text = 'Text endend mit <';
    expect(stripActionMarker(text)).toBe('Text endend mit ');
  });

  it('handhabt "<<" am Text-Ende (erkennt das als Anfang von <<ACTION>>)', () => {
    const text = 'Text endend mit <<';
    // lastIndexOf findet die LETZTE <. tail="<" (ab der letzten <).
    // ACTION_MARKER.startsWith("<") = true, also wird das letzte < abgeschnitten
    expect(stripActionMarker(text)).toBe('Text endend mit <');
  });

  it('handhabt "<<AC" am Text-Ende (erkennt es NICHT als Präfix)', () => {
    const text = 'Text endend mit <<AC';
    // lastIndexOf("<") findet die zweite <. tail="<AC".
    // ACTION_MARKER.startsWith("<AC") = false, also wird nichts abgeschnitten
    expect(stripActionMarker(text)).toBe('Text endend mit <<AC');
  });

  it('entfernt nichts, wenn "<" kein Marker-Präfix ist', () => {
    const text = 'Text mit <tag> aber kein Aktions-Anfang';
    expect(stripActionMarker(text)).toBe('Text mit <tag> aber kein Aktions-Anfang');
  });

  it('schneidet beim ERSTEN Aktions-Block ab, nicht später', () => {
    const text = 'Satz 1<<ACTION>>{"type":"a"}<<END>> mehr text';
    expect(stripActionMarker(text)).toBe('Satz 1');
  });
});
