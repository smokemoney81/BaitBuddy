import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { runSpotRankingShadow, resolveActiveRanking } from './jevSpotRanking.js';

function rankedFixture() {
  return [
    { spot: { name: 'Rheinufer' }, breakdown: { species: 0.5, season: 0.5, weather: 0.5 }, score: 0.5 },
    { spot: { name: 'Baggersee' }, breakdown: { species: 1, season: 1, weather: 1 }, score: 1 },
    { spot: { name: 'Kanal' }, breakdown: { species: 0, season: 0.5, weather: 0.5 }, score: 0.35 },
  ];
}

describe('jevSpotRanking', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe('resolveActiveRanking', () => {
    it('gibt die deterministische Reihenfolge zurueck, wenn Jev deaktiviert ist', async () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const ranked = rankedFixture();
      const result = await resolveActiveRanking({ ranked, targetSpecies: null });
      expect(result).toEqual(ranked);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('bringt Jevs Wahl an die erste Stelle', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { best_spot_index: { choice: '2' } } }),
      }));
      const ranked = rankedFixture();
      const result = await resolveActiveRanking({ ranked, targetSpecies: null });
      expect(result[0].spot.name).toBe('Kanal');
      expect(result).toHaveLength(3);
    });

    it('faellt auf die deterministische Reihenfolge zurueck, wenn Jevs Index ungueltig ist', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { best_spot_index: { choice: '99' } } }),
      }));
      const ranked = rankedFixture();
      const result = await resolveActiveRanking({ ranked, targetSpecies: null });
      expect(result).toEqual(ranked);
    });

    it('faellt zurueck, wenn der Jev-Aufruf fehlschlaegt', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const ranked = rankedFixture();
      const result = await resolveActiveRanking({ ranked, targetSpecies: null });
      expect(result).toEqual(ranked);
    });

    it('gibt eine leere Liste unveraendert zurueck', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await resolveActiveRanking({ ranked: [], targetSpecies: null });
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('runSpotRankingShadow', () => {
    it('ruft fetch nicht auf, wenn Jev deaktiviert ist', () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      runSpotRankingShadow({ ranked: rankedFixture(), targetSpecies: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('wirft nicht, wenn der Aufruf fehlschlaegt', () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      expect(() => runSpotRankingShadow({ ranked: rankedFixture(), targetSpecies: null })).not.toThrow();
    });

    it('loggt den Vergleich bei Erfolg', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { best_spot_index: { choice: '1' } } }),
      }));
      runSpotRankingShadow({ ranked: rankedFixture(), targetSpecies: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(logSpy).toHaveBeenCalledWith(
        '[jev-shadow] spot-ranking',
        expect.objectContaining({ deterministicTop: 'Rheinufer', jevTop: 'Baggersee', mismatch: true })
      );
    });
  });
});
