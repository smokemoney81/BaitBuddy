import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { backendTarget, isVercelAuthRedirect, _resetVercelRejection } from './worker.js';

const OLD = 'https://bait-buddy.vercel.app';
const NEW = 'https://bait-buddy-ssbedburg-2361s-projects.vercel.app';

afterEach(() => {
  vi.unstubAllGlobals();
  _resetVercelRejection();
});

const ssoRedirect = () => new Response(null, {
  status: 302,
  headers: { location: 'https://vercel.com/sso-api?url=https%3A%2F%2Fx.vercel.app%2Fapi%2Fhealth' },
});

describe('backendTarget', () => {
  it('bleibt ohne Bypass-Secret beim bisherigen Backend', () => {
    expect(backendTarget({ BACKEND_URL: OLD, VERCEL_BACKEND_URL: NEW })).toEqual({ base: OLD, headers: {}, canFallback: false });
  });

  it('wechselt mit Bypass-Secret auf das neue Vercel-Projekt', () => {
    expect(backendTarget({ BACKEND_URL: OLD, VERCEL_BACKEND_URL: `${NEW}/`, VERCEL_PROTECTION_BYPASS: ' abc ' }))
      .toEqual({ base: NEW, headers: { 'x-vercel-protection-bypass': 'abc' }, canFallback: true });
  });

  it('ignoriert das Secret, solange keine neue Adresse gesetzt ist', () => {
    expect(backendTarget({ BACKEND_URL: OLD, VERCEL_PROTECTION_BYPASS: 'abc' }).base).toBe(OLD);
  });

  it('wirft ohne jede Backend-Adresse', () => {
    expect(() => backendTarget({})).toThrow('BACKEND_URL is not configured');
  });
});

describe('fetch-Proxy', () => {
  it('reicht /api mit Bypass-Header an das neue Backend weiter und verwirft Client-Header', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const env = { BACKEND_URL: OLD, VERCEL_BACKEND_URL: NEW, VERCEL_PROTECTION_BYPASS: 'geheim' };
    await worker.fetch(new Request('https://catchgbt.com/api/auth/me?x=1', {
      headers: { 'x-vercel-protection-bypass': 'vom-client', authorization: 'Bearer t' },
    }), env);
    const sent = fetchMock.mock.calls[0][0];
    expect(sent.url).toBe(`${NEW}/api/auth/me?x=1`);
    expect(sent.headers.get('x-vercel-protection-bypass')).toBe('geheim');
    expect(sent.headers.get('authorization')).toBe('Bearer t');
    expect(sent.headers.get('x-forwarded-host')).toBe('catchgbt.com');
  });

  it('schickt ohne Secret keinen Bypass-Header mit', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await worker.fetch(new Request('https://catchgbt.com/api/health', {
      headers: { 'x-vercel-protection-bypass': 'vom-client' },
    }), { BACKEND_URL: OLD, VERCEL_BACKEND_URL: NEW });
    const sent = fetchMock.mock.calls[0][0];
    expect(sent.url).toBe(`${OLD}/api/health`);
    expect(sent.headers.has('x-vercel-protection-bypass')).toBe(false);
  });
});

describe('Cron', () => {
  it('ruft den Admin-Pfad mit CRON_SECRET und Bypass-Header auf', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const env = { BACKEND_URL: OLD, VERCEL_BACKEND_URL: NEW, VERCEL_PROTECTION_BYPASS: 'geheim', CRON_SECRET: 'c' };
    await worker.scheduled({ cron: '0 2 * * *' }, env, { waitUntil: () => {} });
    expect(fetchMock).toHaveBeenCalledWith(`${NEW}/api/admin/events/auto-archive`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'x-vercel-protection-bypass': 'geheim', Authorization: 'Bearer c' },
    });
  });

  it('weicht auf BACKEND_URL aus, wenn Vercel den Bypass abweist', async () => {
    const fetchMock = vi.fn(async (url) => (url.startsWith(NEW) ? ssoRedirect() : new Response('ok')));
    vi.stubGlobal('fetch', fetchMock);
    const env = { BACKEND_URL: OLD, VERCEL_BACKEND_URL: NEW, VERCEL_PROTECTION_BYPASS: 'falsch', CRON_SECRET: 'c' };
    await worker.scheduled({ cron: '0 2 * * *' }, env, { waitUntil: () => {} });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `${NEW}/api/admin/events/auto-archive`,
      `${OLD}/api/admin/events/auto-archive`,
    ]);
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer c' });
  });
});

describe('Rückfall bei abgewiesenem Bypass', () => {
  const env = { BACKEND_URL: OLD, VERCEL_BACKEND_URL: NEW, VERCEL_PROTECTION_BYPASS: 'falsch' };

  it('erkennt die Vercel-Anmeldung, aber keine Antworten der App', () => {
    expect(isVercelAuthRedirect(ssoRedirect())).toBe(true);
    expect(isVercelAuthRedirect(new Response('<html>', { status: 401, headers: { server: 'Vercel', 'content-type': 'text/html' } }))).toBe(true);
    expect(isVercelAuthRedirect(new Response('{"error":"Kein Token"}', { status: 401, headers: { server: 'Vercel', 'content-type': 'application/json' } }))).toBe(false);
    expect(isVercelAuthRedirect(new Response(null, { status: 302, headers: { location: 'https://catchgbt.com/Dashboard' } }))).toBe(false);
    expect(isVercelAuthRedirect(new Response('{}'))).toBe(false);
  });

  it('beantwortet die Anfrage über BACKEND_URL (inkl. Body) statt die Vercel-Anmeldung durchzureichen', async () => {
    const seen = [];
    vi.stubGlobal('fetch', vi.fn(async (req) => {
      seen.push({ url: req.url, body: await req.text(), bypass: req.headers.get('x-vercel-protection-bypass') });
      return req.url.startsWith(NEW) ? ssoRedirect() : new Response('{"ok":true}', { status: 200 });
    }));
    const res = await worker.fetch(new Request('https://catchgbt.com/api/auth/login', {
      method: 'POST', body: '{"email":"a@b.test"}', headers: { 'content-type': 'application/json' },
    }), env);
    expect(res.status).toBe(200);
    expect(seen).toEqual([
      { url: `${NEW}/api/auth/login`, body: '{"email":"a@b.test"}', bypass: 'falsch' },
      { url: `${OLD}/api/auth/login`, body: '{"email":"a@b.test"}', bypass: null },
    ]);
  });

  it('versucht es danach eine Weile gar nicht mehr bei Vercel', async () => {
    const fetchMock = vi.fn(async (req) => (req.url.startsWith(NEW) ? ssoRedirect() : new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    await worker.fetch(new Request('https://catchgbt.com/api/health'), env);
    await worker.fetch(new Request('https://catchgbt.com/api/health'), env);
    expect(fetchMock.mock.calls.map((c) => c[0].url)).toEqual([
      `${NEW}/api/health`, `${OLD}/api/health`, `${OLD}/api/health`,
    ]);
  });

  it('reicht echte App-Antworten des neuen Backends unverändert durch', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"Kein Token"}', { status: 401, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(new Request('https://catchgbt.com/api/auth/me'), env);
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
