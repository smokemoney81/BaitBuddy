import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { askJev, isJevEnabled, getJevApiKey } from './jevClient.js';

describe('jevClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('ist deaktiviert ohne JEV_ENABLED', () => {
    delete process.env.JEV_ENABLED;
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    expect(isJevEnabled()).toBe(false);
  });

  it('ist deaktiviert ohne API-Key, selbst wenn JEV_ENABLED gesetzt ist', () => {
    process.env.JEV_ENABLED = 'true';
    delete process.env.TYPESAFE_API_KEY;
    expect(isJevEnabled()).toBe(false);
  });

  it('ist aktiv, wenn beide Bedingungen erfüllt sind', () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    expect(isJevEnabled()).toBe(true);
  });

  it('bereinigt Anführungszeichen/Whitespace im Key', () => {
    process.env.TYPESAFE_API_KEY = '  "ts-test-key"  ';
    expect(getJevApiKey()).toBe('ts-test-key');
  });

  it('askJev liefert null, wenn Jev deaktiviert ist — ohne Netzwerkaufruf', async () => {
    delete process.env.JEV_ENABLED;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await askJev({ state: {}, questions: {} });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('askJev liefert die answers bei Erfolg', async () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answers: { intent: { choice: 'general_fishing' } } }),
    }));
    const result = await askJev({ state: {}, questions: {} });
    expect(result).toEqual({ intent: { choice: 'general_fishing' } });
  });

  it('askJev liefert null bei Upstream-Fehler (fail-open)', async () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await askJev({ state: {}, questions: {} });
    expect(result).toBeNull();
  });

  it('askJev liefert null bei Timeout (fail-open)', async () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    vi.stubGlobal('fetch', vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })));
    const result = await askJev({ state: {}, questions: {} });
    expect(result).toBeNull();
  });

  it('askJev liefert null bei Netzwerkfehler (fail-open)', async () => {
    process.env.JEV_ENABLED = 'true';
    process.env.TYPESAFE_API_KEY = 'ts-test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await askJev({ state: {}, questions: {} });
    expect(result).toBeNull();
  });
});
