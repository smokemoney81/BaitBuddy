import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, entities, auth, integrations, computeRetryDelay, RETRYABLE_STATUS } from './frontendClient';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400, headers = {} } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => headers[name] ?? headers[name?.toLowerCase?.()] ?? null },
    json: async () => body,
  };
}

describe('ApiClient.request', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sendet keinen Authorization-Header ohne gespeichertes Token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/health');

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it('haengt das gespeicherte Token als Bearer-Header an', async () => {
    api.setToken('token-123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/health');

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer token-123');
  });

  it('erneuert das Token bei 401 einmalig und wiederholt die Anfrage', async () => {
    api.setToken('expired-token');
    api.setRefreshToken('refresh-token');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Ungueltiger Token' }, { ok: false, status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'fresh-token', refresh_token: 'fresh-refresh' }))
      .mockResolvedValueOnce(jsonResponse({ id: 1, name: 'Erfolg' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get('/api/catches/1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ id: 1, name: 'Erfolg' });
    expect(api.getToken()).toBe('fresh-token');
    expect(api.getRefreshToken()).toBe('fresh-refresh');
  });

  it('raeumt Tokens auf, wenn der Refresh-Versuch fehlschlaegt', async () => {
    api.setToken('expired-token');
    api.setRefreshToken('refresh-token');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Ungueltiger Token' }, { ok: false, status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Refresh ungueltig' }, { ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/api/catches/1')).rejects.toThrow();

    expect(api.getToken()).toBeNull();
    expect(api.getRefreshToken()).toBeNull();
  });

  it('versucht bei /api/auth/login keinen Refresh, auch bei 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Falsche Zugangsdaten' }, { ok: false, status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.post('/api/auth/login', { email: 'a@b.de', password: 'x' })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('entities (frontendClient)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Diese Tests beschreiben den angemeldeten Pfad. Ohne Token übernimmt für
    // Catch und Spot der lokale Gast-Speicher (siehe eigener Block unten).
    api.setToken('token-123');
  });

  it('list() liefert ein leeres Array, wenn der Server einen Fehler meldet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Serverfehler' }, { ok: false, status: 500 })
    ));

    const result = await entities.Catch.list();
    expect(result).toEqual([]);
  });

  it('list() liefert die Server-Liste bei Erfolg', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }, { id: 2 }])));

    const result = await entities.Catch.list();
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('create() wirft bei einem Serverfehler statt ein Fake-Objekt zu liefern', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Ungueltige Daten' }, { ok: false, status: 400 })
    ));

    await expect(entities.Catch.create({ species: 'Hecht' })).rejects.toThrow('Ungueltige Daten');
  });

  it('get() liefert null bei einem Fehler statt zu werfen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Nicht gefunden' }, { ok: false, status: 404 })
    ));

    const result = await entities.Catch.get('123');
    expect(result).toBeNull();
  });

  it('update() wirft bei einem Serverfehler statt ein Fake-Objekt zurueckzugeben', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Nicht autorisiert' }, { ok: false, status: 403 })
    ));

    await expect(entities.Catch.update('123', { species: 'Zander' })).rejects.toThrow('Nicht autorisiert');
  });

  it('delete() wirft bei einem Serverfehler statt {ok:true} vorzutaeuschen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Nicht gefunden' }, { ok: false, status: 404 })
    ));

    await expect(entities.Catch.delete('123')).rejects.toThrow('Nicht gefunden');
  });

  it('bulkCreate() wirft bei einem Serverfehler statt [] zurueckzugeben', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Ungueltige Daten' }, { ok: false, status: 400 })
    ));

    await expect(entities.Catch.bulkCreate([{ species: 'Aal' }])).rejects.toThrow('Ungueltige Daten');
  });
});

describe('entities im Gastmodus (ohne Token)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('speichert einen Fang lokal, statt in einen 401 zu laufen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const saved = await entities.Catch.create({ species: 'Hecht' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(saved.id).toMatch(/^guest_/);
    expect(await entities.Catch.list()).toHaveLength(1);
  });

  it('liest, ändert und löscht lokal — ohne Netzaufruf', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const saved = await entities.Spot.create({ name: 'Buhne 12' });

    expect((await entities.Spot.get(saved.id)).name).toBe('Buhne 12');
    expect(await entities.Spot.filter({ name: 'Buhne 12' })).toHaveLength(1);

    await entities.Spot.update(saved.id, { name: 'Buhne 13' });
    expect((await entities.Spot.get(saved.id)).name).toBe('Buhne 13');

    await entities.Spot.delete(saved.id);
    expect(await entities.Spot.list()).toHaveLength(0);
  });

  it('lässt Entities ohne Gast-Unterstützung weiterhin ans Backend gehen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }]));
    vi.stubGlobal('fetch', fetchMock);

    await entities.Post.list();

    expect(fetchMock).toHaveBeenCalled();
  });

  it('greift nach der Anmeldung wieder auf das Backend zu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }]));
    vi.stubGlobal('fetch', fetchMock);
    api.setToken('token-123');

    expect(await entities.Catch.list()).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('auth (Offline-Toleranz)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('me() spiegelt das Profil in den Cache und liefert es offline zurueck', async () => {
    api.setToken('gueltig');
    const profile = { id: 'u1', email: 'a@b.de', full_name: 'Test' };

    // 1) Online: Profil kommt vom Server und wird gecacht
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(profile)));
    await expect(auth.me()).resolves.toEqual(profile);
    expect(auth.getCachedUser()).toEqual(profile);

    // 2) Offline: fetch wirft ohne HTTP-Status -> gecachtes Profil als Fallback
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(auth.me()).resolves.toEqual(profile);
  });

  it('me() reicht einen 401 durch und nutzt NICHT den Cache', async () => {
    api.setToken('abgelaufen');
    auth.getCachedUser(); // leer
    localStorage.setItem('bb_user', JSON.stringify({ id: 'u1' }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Ungueltiger Token' }, { ok: false, status: 401 })
    ));

    await expect(auth.me()).rejects.toThrow('Ungueltiger Token');
  });

  it('isAuthenticated() gilt offline mit Token und gecachtem Profil als angemeldet', async () => {
    api.setToken('gueltig');
    localStorage.setItem('bb_user', JSON.stringify({ id: 'u1' }));

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(auth.isAuthenticated()).resolves.toBe(true);
  });

  it('isAuthenticated() ist offline OHNE gecachtes Profil nicht angemeldet', async () => {
    api.setToken('gueltig');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(auth.isAuthenticated()).resolves.toBe(false);
  });

  it('login() cacht das mitgelieferte Profil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ token: 't', refresh_token: 'r', user: { id: 'u1', email: 'a@b.de' } })
    ));

    await auth.login('a@b.de', 'pw');
    expect(auth.getCachedUser()).toEqual({ id: 'u1', email: 'a@b.de' });
  });

  it('logout() entfernt das gecachte Profil', () => {
    localStorage.setItem('bb_user', JSON.stringify({ id: 'u1' }));
    auth.clearCachedUser();
    expect(auth.getCachedUser()).toBeNull();
  });
});

describe('integrations.Core.InvokeLLM (strukturierte Antworten)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const schema = { type: 'object', properties: { summary: { type: 'string' } } };

  it('parst eine Antwort, die direkt reines JSON ist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ reply: '{"summary": "gut"}' })
    ));
    const result = await integrations.Core.InvokeLLM({ prompt: 'x', response_json_schema: schema });
    expect(result).toEqual({ summary: 'gut' });
  });

  it('parst JSON aus einem Markdown-Codefence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ reply: 'Hier ist das Ergebnis:\n```json\n{"summary": "prima"}\n```\nDanke!' })
    ));
    const result = await integrations.Core.InvokeLLM({ prompt: 'x', response_json_schema: schema });
    expect(result).toEqual({ summary: 'prima' });
  });

  it('parst JSON mit Prosa davor UND danach (Greedy-Regex haette hier versagt)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ reply: 'Klar, hier: {"summary": "ok"} Lass es mich wissen, falls du mehr brauchst!' })
    ));
    const result = await integrations.Core.InvokeLLM({ prompt: 'x', response_json_schema: schema });
    expect(result).toEqual({ summary: 'ok' });
  });

  it('liefert ein leeres Objekt, wenn kein JSON gefunden werden kann', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ reply: 'Tut mir leid, das kann ich nicht beantworten.' })
    ));
    const result = await integrations.Core.InvokeLLM({ prompt: 'x', response_json_schema: schema });
    expect(result).toEqual({});
  });
});

describe('auth.login', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('speichert Token und Refresh-Token nach erfolgreichem Login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ token: 'tok', refresh_token: 'ref', user: { email: 'a@b.de' } })
    ));

    await auth.login('a@b.de', 'geheim');

    expect(api.getToken()).toBe('tok');
    expect(api.getRefreshToken()).toBe('ref');
  });
});

describe('computeRetryDelay (Exponential Backoff)', () => {
  it('staffelt ohne Retry-After exponentiell: 1s, 2s, 4s (+ Jitter < 250ms)', () => {
    for (const [attempt, base] of [[0, 1000], [1, 2000], [2, 4000]]) {
      const delay = computeRetryDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(base);
      expect(delay).toBeLessThan(base + 250);
    }
  });

  it('respektiert einen Retry-After-Wert des Servers (Sekunden) mit Vorrang', () => {
    expect(computeRetryDelay(0, 3)).toBe(3000);
    expect(computeRetryDelay(2, 0)).toBe(0);
  });

  it('deckelt sehr grosse Wartezeiten bei 30s', () => {
    expect(computeRetryDelay(0, 120)).toBe(30000);
    expect(computeRetryDelay(20)).toBe(30000);
  });
});

describe('ApiClient Resilienz (transiente Serverfehler)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wiederholt GET bei 503 mit Backoff und liefert schliesslich das Ergebnis', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'überlastet' }, { ok: false, status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'überlastet' }, { ok: false, status: 503 }))
      .mockResolvedValueOnce(jsonResponse([{ id: 42 }]));
    vi.stubGlobal('fetch', fetchMock);

    const promise = api.get('/api/community/posts');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([{ id: 42 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gibt nach erschöpften Wiederholungen (4 Versuche) den Fehler weiter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'überlastet' }, { ok: false, status: 503 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = api.get('/api/community/posts');
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 Wiederholungen
  });

  it('wiederholt POST (Write) NICHT bei 503 — keine Doppel-Mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'überlastet' }, { ok: false, status: 503 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const promise = api.post('/api/catches', { species: 'Hecht' });
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nutzt den Retry-After-Header des Servers bei 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'zu viele Anfragen' }, { ok: false, status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = api.get('/api/community/posts');
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1); // vor Ablauf von 2s noch kein Retry
    await vi.advanceTimersByTimeAsync(2);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wiederholt einen reinen Netzwerkfehler NICHT (Offline-Fallback bleibt sofort)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = api.get('/api/community/posts');
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('RETRYABLE_STATUS enthält die transienten Überlast-Codes', () => {
    for (const code of [408, 429, 502, 503, 504]) {
      expect(RETRYABLE_STATUS.has(code)).toBe(true);
    }
    expect(RETRYABLE_STATUS.has(400)).toBe(false);
    expect(RETRYABLE_STATUS.has(404)).toBe(false);
  });
});
