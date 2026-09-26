import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { classifyConfidenceBand, runVisionConfidenceShadow, resolveActiveConfidenceBand } from './jevVisionConfidence.js';

describe('classifyConfidenceBand', () => {
  it('klassifiziert nach denselben Schwellen wie FishRecognitionResult.jsx', () => {
    expect(classifyConfidenceBand(0.9)).toBe('sicher');
    expect(classifyConfidenceBand(0.75)).toBe('sicher');
    expect(classifyConfidenceBand(0.6)).toBe('zweite_analyse');
    expect(classifyConfidenceBand(0.45)).toBe('zweite_analyse');
    expect(classifyConfidenceBand(0.2)).toBe('nutzer_fragen');
  });

  it('liefert null fuer fehlende/ungueltige Werte', () => {
    expect(classifyConfidenceBand(null)).toBeNull();
    expect(classifyConfidenceBand(undefined)).toBeNull();
    expect(classifyConfidenceBand(NaN)).toBeNull();
  });
});

describe('jevVisionConfidence', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe('resolveActiveConfidenceBand', () => {
    it('gibt die deterministische Stufe zurueck, wenn Jev deaktiviert ist', async () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await resolveActiveConfidenceBand({ confidence: 0.9, species: 'Hecht' });
      expect(result).toBe('sicher');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('gibt null zurueck, wenn keine gueltige confidence vorliegt (kein Jev-Aufruf)', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await resolveActiveConfidenceBand({ confidence: null, species: null });
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uebernimmt Jevs Band bei eindeutiger Antwort', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { band: { choice: 'zweite_analyse' } } }),
      }));
      const result = await resolveActiveConfidenceBand({ confidence: 0.9, species: 'Hecht' });
      expect(result).toBe('zweite_analyse');
    });

    it('faellt auf die deterministische Stufe zurueck, wenn Jev unbekannt antwortet', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { band: { choice: 'unbekannt' } } }),
      }));
      const result = await resolveActiveConfidenceBand({ confidence: 0.9, species: 'Hecht' });
      expect(result).toBe('sicher');
    });

    it('faellt zurueck, wenn der Jev-Aufruf fehlschlaegt', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const result = await resolveActiveConfidenceBand({ confidence: 0.2, species: 'Karpfen' });
      expect(result).toBe('nutzer_fragen');
    });
  });

  describe('runVisionConfidenceShadow', () => {
    it('ruft fetch nicht auf, wenn Jev deaktiviert ist', () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      runVisionConfidenceShadow({ confidence: 0.9, species: 'Hecht' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ruft fetch nicht auf, wenn keine gueltige confidence vorliegt', () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      runVisionConfidenceShadow({ confidence: null, species: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('wirft nicht, wenn der Aufruf fehlschlaegt', () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      expect(() => runVisionConfidenceShadow({ confidence: 0.9, species: 'Hecht' })).not.toThrow();
    });

    it('loggt den Vergleich bei Erfolg', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { band: { choice: 'nutzer_fragen' } } }),
      }));
      runVisionConfidenceShadow({ confidence: 0.9, species: 'Hecht' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(logSpy).toHaveBeenCalledWith(
        '[jev-shadow] vision-confidence',
        expect.objectContaining({ deterministic: 'sicher', jev: 'nutzer_fragen', mismatch: true })
      );
    });
  });
});
