import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { parseContextAnswers, resolveActiveContextFlags, logShadowComparison } from './jevBuddyContext.js';

describe('jevBuddyContext', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe('parseContextAnswers', () => {
    it('wandelt noul-Wahrscheinlichkeiten in Booleans um', () => {
      const flags = parseContextAnswers({
        needs_catches: { probability: 0.9 },
        needs_rules: { probability: 0.2 },
        needs_spots: { probability: 0.5 },
        needs_weather: { probability: 0.49 },
        needs_planning: { probability: 0.5 },
      });
      expect(flags).toEqual({
        catches: true,
        rules: false,
        spots: true,
        weather: false,
        planning: true,
      });
    });

    it('liefert null für fehlende/ungueltige Antworten', () => {
      const flags = parseContextAnswers({ needs_catches: {}, needs_rules: null });
      expect(flags.catches).toBeNull();
      expect(flags.rules).toBeNull();
      expect(flags.spots).toBeNull();
    });

    it('kommt mit undefined answers zurecht', () => {
      const flags = parseContextAnswers(undefined);
      expect(flags).toEqual({ catches: null, rules: null, spots: null, weather: null, planning: null });
    });
  });

  describe('resolveActiveContextFlags', () => {
    const ruleBasedFlags = { catches: false, rules: false, spots: false, weather: false, planning: true };

    it('faellt vollstaendig auf ruleBasedFlags zurueck, wenn Jev deaktiviert ist', async () => {
      delete process.env.JEV_ENABLED;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await resolveActiveContextFlags({ lastMsg: 'Was hab ich gefangen?', ruleBasedFlags });
      expect(result).toEqual(ruleBasedFlags);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uebernimmt Jevs Flags, wenn sie eindeutig sind', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answers: {
            needs_catches: { probability: 0.9 },
            needs_rules: { probability: 0.1 },
            needs_spots: { probability: 0.1 },
            needs_weather: { probability: 0.9 },
            needs_planning: { probability: 0.1 },
          },
        }),
      }));
      const result = await resolveActiveContextFlags({ lastMsg: 'Was hab ich gefangen?', ruleBasedFlags });
      expect(result).toEqual({ catches: true, rules: false, spots: false, weather: true, planning: false });
    });

    it('faellt pro Flag auf ruleBasedFlags zurueck, wenn Jev diese Frage nicht eindeutig beantwortet', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answers: {
            needs_catches: { probability: 0.9 },
            // needs_rules fehlt komplett -> fail-open auf ruleBasedFlags.rules
          },
        }),
      }));
      const result = await resolveActiveContextFlags({ lastMsg: 'Was hab ich gefangen?', ruleBasedFlags });
      expect(result.catches).toBe(true);
      expect(result.rules).toBe(ruleBasedFlags.rules);
      expect(result.spots).toBe(ruleBasedFlags.spots);
    });

    it('faellt komplett auf ruleBasedFlags zurueck, wenn der Jev-Aufruf fehlschlaegt', async () => {
      process.env.JEV_ENABLED = 'true';
      process.env.TYPESAFE_API_KEY = 'ts-test-key';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const result = await resolveActiveContextFlags({ lastMsg: 'Was hab ich gefangen?', ruleBasedFlags });
      expect(result).toEqual(ruleBasedFlags);
    });
  });

  describe('logShadowComparison', () => {
    it('loggt Mismatches korrekt', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logShadowComparison(
        { catches: true, rules: false, spots: false, weather: false, planning: false },
        { needs_catches: { probability: 0.1 }, needs_rules: { probability: 0.9 } }
      );
      expect(logSpy).toHaveBeenCalledWith(
        '[jev-shadow] buddy-context',
        expect.objectContaining({ mismatches: expect.arrayContaining(['catches', 'rules']) })
      );
    });
  });
});
