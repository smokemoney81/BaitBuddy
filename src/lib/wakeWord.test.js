import { describe, it, expect } from 'vitest';
import { detectWakeWord, normalizeTranscript } from './wakeWord';

describe('detectWakeWord', () => {
  it.each([
    ['Hey Buddy', ''],
    ['hey buddy wie ist das Wetter', 'wie ist das wetter'],
    ['Hei Baddy, speichere diesen Spot!', 'speichere diesen spot'],
    ['okay Buddy trag einen Barsch ein', 'trag einen barsch ein'],
    ['also hallo buddy welcher Köder', 'welcher köder'],
  ])('erkennt "%s"', (text, command) => {
    expect(detectWakeWord(text)).toEqual({ detected: true, command });
  });

  it.each([
    'Wie ist das Wetter',
    'mein buddy hat angerufen',
    'heybuddy',
    '',
  ])('ignoriert "%s"', (text) => {
    expect(detectWakeWord(text).detected).toBe(false);
  });

  it('normalisiert Satzzeichen und Leerraum', () => {
    expect(normalizeTranscript('  Hey,   „Buddy“!  ')).toBe('hey buddy');
  });
});
