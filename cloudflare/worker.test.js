import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { backendTarget } from './worker.js';

const OLD = 'https://bait-buddy.vercel.app';
const NEW = 'https://bait-buddy-ssbedburg-2361s-projects.vercel.app';

afterEach(() => vi.unstubAllGlobals());

describe('backendTarget', () => {
  it('bleibt ohne Bypass-Secret beim bisherigen Backend', () => {
    expect(backendTarget({ BACKEND_URL: OLD, VERCEL_BACKEND_URL: NEW })).toEqual({ base: OLD, headers: {} });
  });

  it('wechselt mit Bypass-Secret auf das neue Vercel-Projekt', () => {
    expect(backendTarget({ BACKEND_URL: OLD, VERCEL_BACKEND_URL: `${NEW}/`, VERCEL_PROTECTION_BYPASS: ' abc ' }))
      .toEqual({ base: NEW, headers: { 'x-vercel-protection-bypass': 'abc' } });
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
      headers: { 'x-vercel-protection-bypass': 'geheim', Authorization: 'Bearer c' },
    });
  });
});
