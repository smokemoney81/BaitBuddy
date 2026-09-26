import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { runFangbuchEvidenceShadow, resolveActiveEvidence } from './jevFangbuchEvidence.js';

const patterns = [
  { id: 'top_species', label: 'Meistgefangene Art', value: 'Zander', evidence: 'EARLY', sample: { count: 4, total: 5, share: 80 } },
  { id: 'personal_best', label: 'Schwerster Fang', value: '3.00 kg' }, // kein sample/evidence
];

describe('jevFangbuchEvidence', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe('resolveActiveEvidence', () => {
    it('gibt die Muster unveraendert zurueck, wenn Jev deaktiviert ist', async () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await resolveActiveEvidence(patterns);
      expect(result).toEqual(patterns);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ersetzt die Evidence-Stufe bei eindeutiger Jev-Antwort', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { evidence_top_species: { choice: 'STRONG' } } }),
      }));
      const result = await resolveActiveEvidence(patterns);
      expect(result.find((p) => p.id === 'top_species').evidence).toBe('STRONG');
      // personal_best bleibt unangetastet (kein sample/evidence)
      expect(result.find((p) => p.id === 'personal_best')).toEqual(patterns[1]);
    });

    it('faellt auf die deterministische Stufe zurueck, wenn Jev nicht eindeutig antwortet', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { evidence_top_species: { choice: 'UNBEKANNT' } } }),
      }));
      const result = await resolveActiveEvidence(patterns);
      expect(result.find((p) => p.id === 'top_species').evidence).toBe('EARLY');
    });

    it('faellt komplett zurueck, wenn der Jev-Aufruf fehlschlaegt', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const result = await resolveActiveEvidence(patterns);
      expect(result).toEqual(patterns);
    });

    it('ruft Jev nicht auf, wenn keine frequenzbasierten Muster vorhanden sind', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await resolveActiveEvidence([patterns[1]]);
      expect(result).toEqual([patterns[1]]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('runFangbuchEvidenceShadow', () => {
    it('ruft fetch nicht auf, wenn Jev deaktiviert ist', () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      runFangbuchEvidenceShadow(patterns);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('wirft nicht, wenn der Aufruf fehlschlaegt', () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      expect(() => runFangbuchEvidenceShadow(patterns)).not.toThrow();
    });

    it('loggt den Vergleich bei Erfolg', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { evidence_top_species: { choice: 'MODERATE' } } }),
      }));
      runFangbuchEvidenceShadow(patterns);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(logSpy).toHaveBeenCalledWith(
        '[jev-shadow] fangbuch-evidence',
        expect.objectContaining({
          mismatches: [{ id: 'top_species', deterministic: 'EARLY', jev: 'MODERATE' }],
        })
      );
    });
  });
});
