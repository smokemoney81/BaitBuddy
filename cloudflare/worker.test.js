import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { resolveBackend, CRON_ROUTES } from './worker.js';

const ok = (body = '{"ok":true}') => new Response(body, { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('resolveBackend', () => {
  it('bevorzugt das Service Binding vor BACKEND_URL', () => {
    const env = { API: { fetch: vi.fn() }, BACKEND_URL: 'https://bait-buddy.vercel.app' };
    expect(resolveBackend(env).name).toBe('service-binding');
  });

  it('nutzt BACKEND_URL ohne Binding und entfernt Schrägstriche am Ende', () => {
    expect(resolveBackend({ BACKEND_URL: 'https://bait-buddy.vercel.app//' }).name)
      .toBe('https://bait-buddy.vercel.app');
  });

  it('liefert null ohne Backend-Konfiguration', () => {
    expect(resolveBackend({})).toBeNull();
    expect(resolveBackend({ BACKEND_URL: '' })).toBeNull();
  });
});

describe('fetch', () => {
  it('reicht /api/* samt Query, Methode und Forwarded-Headern an das Binding weiter', async () => {
    const api = { fetch: vi.fn(async () => ok()) };
    const res = await worker.fetch(
      new Request('https://catchgbt.com/api/events?limit=5', {
        method: 'DELETE',
        headers: { 'cf-connecting-ip': '203.0.113.7', authorization: 'Bearer t' },
      }),
      { API: api, ASSETS: { fetch: vi.fn() } },
    );
    expect(res.status).toBe(200);
    const sent = api.fetch.mock.calls[0][0];
    expect(new URL(sent.url).pathname + new URL(sent.url).search).toBe('/api/events?limit=5');
    expect(sent.method).toBe('DELETE');
    expect(sent.headers.get('cf-connecting-ip')).toBe('203.0.113.7');
    expect(sent.headers.get('authorization')).toBe('Bearer t');
    expect(sent.headers.get('x-forwarded-host')).toBe('catchgbt.com');
    expect(sent.headers.get('x-forwarded-proto')).toBe('https');
  });

  it('proxyt ohne Binding per fetch an BACKEND_URL', async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    await worker.fetch(new Request('https://catchgbt.com/api/health'), {
      BACKEND_URL: 'https://bait-buddy.vercel.app',
      ASSETS: { fetch: vi.fn() },
    });
    expect(fetchMock.mock.calls[0][0].url).toBe('https://bait-buddy.vercel.app/api/health');
  });

  it('antwortet 503 statt abzustürzen, wenn kein Backend konfiguriert ist', async () => {
    const res = await worker.fetch(new Request('https://catchgbt.com/api/health'), { ASSETS: { fetch: vi.fn() } });
    expect(res.status).toBe(503);
  });

  it('liefert Nicht-API-Pfade aus den Assets', async () => {
    const assets = { fetch: vi.fn(async () => ok('<html>')) };
    const api = { fetch: vi.fn() };
    await worker.fetch(new Request('https://catchgbt.com/apiary'), { API: api, ASSETS: assets });
    expect(assets.fetch).toHaveBeenCalledTimes(1);
    expect(api.fetch).not.toHaveBeenCalled();
  });
});

describe('scheduled', () => {
  it('ruft den Cron-Pfad mit CRON_SECRET über das Binding auf', async () => {
    const api = { fetch: vi.fn(async () => ok()) };
    const ctx = { waitUntil: vi.fn() };
    await worker.scheduled({ cron: '0 2 * * *' }, { API: api, CRON_SECRET: 's3cret' }, ctx);
    const sent = api.fetch.mock.calls[0][0];
    expect(new URL(sent.url).pathname).toBe(CRON_ROUTES['0 2 * * *']);
    expect(sent.headers.get('authorization')).toBe('Bearer s3cret');
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('meldet einen HTTP-Fehler des Backends als fehlgeschlagenen Cron', async () => {
    const api = { fetch: vi.fn(async () => new Response('nope', { status: 401 })) };
    await expect(
      worker.scheduled({ cron: '0 3 * * *' }, { API: api, CRON_SECRET: 'x' }, { waitUntil: () => {} }),
    ).rejects.toThrow('HTTP 401');
  });
});
