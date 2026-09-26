import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { runBuddyContextShadow } from './jevShadow.js';

describe('jevShadow', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('ruft fetch nicht auf, wenn Jev deaktiviert ist', () => {
    delete process.env.JEV_ENABLED;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    runBuddyContextShadow({
      lastMsg: 'Welcher Köder für Zander?',
      ruleBasedFlags: { catches: false, rules: false, spots: false, weather: false, planning: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ruft fetch nicht auf, wenn JEV_SHADOW_MODE explizit deaktiviert ist', () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    process.env.JEV_SHADOW_MODE = 'false';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    runBuddyContextShadow({
      lastMsg: 'Welcher Köder für Zander?',
      ruleBasedFlags: { catches: false, rules: false, spots: false, weather: false, planning: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('wirft nicht, wenn Jev aktiviert ist und der Aufruf fehlschlägt', () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(() => runBuddyContextShadow({
      lastMsg: 'Welcher Köder für Zander?',
      ruleBasedFlags: { catches: false, rules: false, spots: false, weather: false, planning: false },
    })).not.toThrow();
  });

  it('loggt den Vergleich bei erfolgreicher Antwort, ohne den Aufrufer zu blockieren', async () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          needs_catches: { probability: 0.9 },
          needs_rules: { probability: 0.1 },
          needs_spots: { probability: 0.1 },
          needs_weather: { probability: 0.1 },
          needs_planning: { probability: 0.1 },
        },
      }),
    }));
    runBuddyContextShadow({
      lastMsg: 'Was hab ich letztens gefangen?',
      ruleBasedFlags: { catches: true, rules: false, spots: false, weather: false, planning: false },
    });
    // Fire-and-forget: auf die Microtask-Queue warten, bevor der Log geprüft wird.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logSpy).toHaveBeenCalledWith(
      '[jev-shadow] buddy-context',
      expect.objectContaining({ mismatches: [] })
    );
  });
});
