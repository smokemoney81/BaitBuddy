import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function mockVoice(name, lang, localService = true) {
  return { name, lang, localService };
}

async function freshModule() {
  vi.resetModules();
  return await import('./browserTTS');
}

describe('browserTTS – Stimmwahl (Regressionstests)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      speechSynthesis: { getVoices: vi.fn(() => []), speak: vi.fn(), cancel: vi.fn() },
      SpeechSynthesisUtterance: function SpeechSynthesisUtterance(text) { this.text = text; },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('pinnt keine Stimme, solange getVoices() leer ist', async () => {
    const { speakBrowser, isBrowserTTSAvailable } = await freshModule();
    expect(isBrowserTTSAvailable()).toBe(true);
    const handle = speakBrowser('Hallo');
    expect(handle).toBeTruthy();
    // window.speechSynthesis.speak() erhielt eine Utterance ohne .voice (kein
    // Fehlgriff dauerhaft gecacht, solange noch keine Stimmen geladen waren).
    const utterance = window.speechSynthesis.speak.mock.calls[0][0];
    expect(utterance.voice).toBeUndefined();
  });

  it('bevorzugt eine namentlich weibliche deutsche Stimme', async () => {
    window.speechSynthesis.getVoices = vi.fn(() => [
      mockVoice('Google Deutsch', 'de-DE'),
      mockVoice('Yannick', 'de-DE'),
    ]);
    const { speakBrowser } = await freshModule();
    speakBrowser('Hallo');
    const utterance = window.speechSynthesis.speak.mock.calls[0][0];
    expect(utterance.voice.name).toBe('Google Deutsch');
  });

  it('pinnt die einmal aufgelöste Stimme für die restliche Session (keine erneute getVoices-Auswertung)', async () => {
    window.speechSynthesis.getVoices = vi.fn(() => [
      mockVoice('Google Deutsch', 'de-DE'),
      mockVoice('Yannick', 'de-DE'),
    ]);
    const { speakBrowser } = await freshModule();
    speakBrowser('Erster Satz');
    // Stimmenliste ändert sich (z.B. Sprachpaket nachgeladen) — die Auswahl
    // darf sich innerhalb der Session trotzdem nicht mehr ändern.
    window.speechSynthesis.getVoices = vi.fn(() => [mockVoice('Yannick', 'de-DE')]);
    speakBrowser('Zweiter Satz');
    const secondUtterance = window.speechSynthesis.speak.mock.calls[1][0];
    expect(secondUtterance.voice.name).toBe('Google Deutsch');
  });

  it('fällt ohne weibliche Stimme auf die erste lokale deutsche Stimme zurück', async () => {
    window.speechSynthesis.getVoices = vi.fn(() => [
      mockVoice('Yannick', 'de-DE', false),
      mockVoice('Markus', 'de-DE', true),
    ]);
    const { speakBrowser } = await freshModule();
    speakBrowser('Hallo');
    const utterance = window.speechSynthesis.speak.mock.calls[0][0];
    expect(utterance.voice.name).toBe('Markus');
  });
});
