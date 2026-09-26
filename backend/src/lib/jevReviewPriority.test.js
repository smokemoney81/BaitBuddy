import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { runReviewPriorityShadow, resolveActivePriorities } from './jevReviewPriority.js';

function fixture() {
  return [
    { id: 'sub1', plausibility: [{ id: 'photo', ok: false, severity: 'review' }], review_priority: 'medium' },
    { id: 'sub2', plausibility: [], review_priority: 'low' },
  ];
}

describe('jevReviewPriority', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe('resolveActivePriorities', () => {
    it('gibt die deterministischen Prioritaeten zurueck, wenn Jev deaktiviert ist', async () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const input = fixture();
      const result = await resolveActivePriorities(input);
      expect(result).toEqual(input);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uebernimmt Jevs Prioritaet pro Einreichung', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { priority_sub1: { choice: 'high' } } }),
      }));
      const result = await resolveActivePriorities(fixture());
      expect(result.find((s) => s.id === 'sub1').review_priority).toBe('high');
      expect(result.find((s) => s.id === 'sub2').review_priority).toBe('low');
    });

    it('faellt komplett zurueck, wenn der Jev-Aufruf fehlschlaegt', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const input = fixture();
      const result = await resolveActivePriorities(input);
      expect(result).toEqual(input);
    });

    it('gibt eine leere Liste unveraendert zurueck', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await resolveActivePriorities([]);
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('runReviewPriorityShadow', () => {
    it('ruft fetch nicht auf, wenn Jev deaktiviert ist', () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      runReviewPriorityShadow(fixture());
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('wirft nicht, wenn der Aufruf fehlschlaegt', () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      expect(() => runReviewPriorityShadow(fixture())).not.toThrow();
    });

    it('loggt den Vergleich bei Erfolg', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: { priority_sub1: { choice: 'high' } } }),
      }));
      runReviewPriorityShadow(fixture());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(logSpy).toHaveBeenCalledWith(
        '[jev-shadow] review-priority',
        expect.objectContaining({
          mismatches: [{ id: 'sub1', deterministic: 'medium', jev: 'high' }],
        })
      );
    });
  });
});
