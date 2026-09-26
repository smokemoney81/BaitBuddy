import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock, settingsMock } = vi.hoisted(() => ({
  supabaseMock: { current: null },
  settingsMock: { allFree: false },
}));

vi.mock('./supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));
vi.mock('./appSettings.js', () => ({
  isAllToolsFree: async () => settingsMock.allFree,
}));

const {
  quotaForPlan, costFor, currentPeriod, periodResetsAt, getTokenQuotas, getTokenCosts,
  getTokenUsage, recordTokenUsage, meterAiTokens, QUOTA_EXCEEDED_CODE, DEFAULT_TOKEN_QUOTAS,
} = await import('./aiTokenQuota.js');

const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const userWithPlan = (planId, email = 'angler@example.de') => ({
  id: 'u1',
  email,
  app_metadata: planId === 'free' ? {} : { premium_plan_id: planId, premium_expires_at: future },
});

function balance(used) {
  return createSupabaseMock({
    fromResults: { ai_token_balances: { data: used === null ? null : { used }, error: null } },
    rpcResults: { record_ai_token_usage: { data: (used || 0) + 2, error: null } },
  });
}

beforeEach(() => {
  settingsMock.allFree = false;
  supabaseMock.current = balance(0);
});

afterEach(() => {
  delete process.env.AI_TOKEN_QUOTAS;
  delete process.env.AI_TOKEN_COSTS;
});

describe('Frontend-Spiegel', () => {
  it('nutzt denselben Fehlercode wie src/lib/aiQuota.js', async () => {
    const { AI_QUOTA_EXCEEDED_CODE } = await import('../../../src/lib/aiQuota.js');
    expect(AI_QUOTA_EXCEEDED_CODE).toBe(QUOTA_EXCEEDED_CODE);
  });
});

describe('Volumen je Plan', () => {
  it('steigt mit dem Plan-Rang und behandelt Aliase wie ihre Stufe', () => {
    const q = getTokenQuotas();
    expect(quotaForPlan('free', q)).toBe(q.free);
    expect(quotaForPlan('basic', q)).toBe(q.basic);
    expect(quotaForPlan('pro', q)).toBe(q.pro);
    for (const alias of ['elite', 'ultimate', 'friends_monthly', 'trial_10_10']) {
      expect(quotaForPlan(alias, q)).toBe(q.elite);
    }
    expect(quotaForPlan('friends', q)).toBe(q.friends);
    expect(quotaForPlan('unbekannt', q)).toBe(q.free);
    expect(q.free).toBeLessThan(q.basic);
    expect(q.basic).toBeLessThan(q.pro);
    expect(q.pro).toBeLessThan(q.elite);
    expect(q.elite).toBeLessThan(q.friends);
  });

  it('übernimmt gültige Env-Overrides und ignoriert kaputtes JSON', () => {
    process.env.AI_TOKEN_QUOTAS = '{"basic":42,"pro":-5}';
    const q = getTokenQuotas();
    expect(q.basic).toBe(42);
    expect(q.pro).toBe(DEFAULT_TOKEN_QUOTAS.pro);
    process.env.AI_TOKEN_QUOTAS = '{kaputt';
    expect(getTokenQuotas()).toEqual({ ...DEFAULT_TOKEN_QUOTAS });
  });
});

describe('Kosten', () => {
  it('rechnet TTS je angefangenem Zeichenblock ab', () => {
    const c = getTokenCosts();
    expect(costFor('tts', { textLength: 1 }, c)).toBe(c.tts);
    expect(costFor('tts', { textLength: c.tts_chars }, c)).toBe(c.tts);
    expect(costFor('tts', { textLength: c.tts_chars + 1 }, c)).toBe(2 * c.tts);
    expect(costFor('tts', { textLength: 0 }, c)).toBe(c.tts);
  });

  it('fällt für unbekannte Werkzeuge auf den Tool-Preis zurück', () => {
    const c = getTokenCosts();
    expect(costFor('chat', {}, c)).toBe(c.chat);
    expect(costFor('realtime', {}, c)).toBe(c.realtime);
    expect(costFor('irgendwas', {}, c)).toBe(c.tool);
  });
});

describe('Zeitraum', () => {
  it('ist der UTC-Kalendermonat und wird am Monatsersten erneuert', () => {
    const now = new Date('2026-12-31T23:30:00Z');
    expect(currentPeriod(now)).toBe('2026-12');
    expect(periodResetsAt(now)).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('getTokenUsage', () => {
  it('liefert Stand, Rest und Plan', async () => {
    supabaseMock.current = balance(120);
    const usage = await getTokenUsage(userWithPlan('basic'));
    expect(usage.plan_id).toBe('basic');
    expect(usage.limit).toBe(getTokenQuotas().basic);
    expect(usage.used).toBe(120);
    expect(usage.remaining).toBe(usage.limit - 120);
    expect(usage.tracking).toBe(true);
  });

  it('gibt im Modus „alle Tools kostenlos“ mindestens das Ultimate-Volumen', async () => {
    settingsMock.allFree = true;
    const usage = await getTokenUsage(userWithPlan('free'));
    expect(usage.limit).toBe(getTokenQuotas().elite);
  });

  it('ist für den Superuser unbegrenzt', async () => {
    const usage = await getTokenUsage(userWithPlan('free', 'kaisaschnitt99@gmail.com'));
    expect(usage.limit).toBeNull();
    expect(usage.remaining).toBeNull();
  });

  it('bleibt bei Lesefehlern offen (fail-open)', async () => {
    supabaseMock.current = createSupabaseMock({
      fromResults: { ai_token_balances: { data: null, error: { message: 'relation does not exist' } } },
    });
    const usage = await getTokenUsage(userWithPlan('free'));
    expect(usage.used).toBe(0);
    expect(usage.tracking).toBe(false);
  });
});

describe('recordTokenUsage', () => {
  it('bucht über die RPC und liefert den neuen Stand', async () => {
    supabaseMock.current = balance(10);
    const used = await recordTokenUsage('u1', 'chat', 2, { inputTokens: 900, outputTokens: 120, now: new Date('2026-09-26T10:00:00Z') });
    expect(used).toBe(12);
    expect(supabaseMock.current.rpc).toHaveBeenCalledWith('record_ai_token_usage', {
      p_user_id: 'u1', p_period: '2026-09', p_feature: 'chat', p_tokens: 2, p_input_tokens: 900, p_output_tokens: 120,
    });
  });

  it('bucht nichts bei 0 Tokens oder ungültigem Feature', async () => {
    expect(await recordTokenUsage('u1', 'chat', 0)).toBeNull();
    expect(await recordTokenUsage('u1', 'DROP TABLE', 2)).toBeNull();
    expect(supabaseMock.current.rpc).not.toHaveBeenCalled();
  });

  it('wirft nicht, wenn die Funktion fehlt', async () => {
    supabaseMock.current = createSupabaseMock();
    await expect(recordTokenUsage('u1', 'chat', 2)).resolves.toBeNull();
  });
});

describe('meterAiTokens', () => {
  function run(middleware, req) {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    const next = vi.fn();
    return middleware(req, res, next).then(() => ({ res, next }));
  }

  it('sperrt mit 429, wenn das Volumen nicht reicht', async () => {
    const limit = getTokenQuotas().free;
    supabaseMock.current = balance(limit - 1);
    const { res, next } = await run(meterAiTokens('vision'), { user: userWithPlan('free'), body: {} });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe(QUOTA_EXCEEDED_CODE);
    expect(res.body.usage.remaining).toBe(1);
    expect(res.body.error).toMatch(/KI-Volumen/);
  });

  it('bucht nach einer erfolgreichen Antwort genau einmal', async () => {
    const req = { user: userWithPlan('pro'), body: {} };
    const { res, next } = await run(meterAiTokens('chat'), req);
    expect(next).toHaveBeenCalled();
    req.aiTokens.setUsage({ input_tokens: 1000, output_tokens: 50 });
    res.json({ ok: true });
    await vi.waitFor(() => expect(res.body).toEqual({ ok: true }));
    res.json({ ok: true });
    expect(supabaseMock.current.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.current.rpc.mock.calls[0][1]).toMatchObject({ p_feature: 'chat', p_input_tokens: 1000, p_output_tokens: 50 });
  });

  it('bucht bei Fehlerantworten nichts', async () => {
    const req = { user: userWithPlan('pro'), body: {} };
    const { res } = await run(meterAiTokens('tool'), req);
    res.status(502).json({ error: 'kaputt' });
    expect(supabaseMock.current.rpc).not.toHaveBeenCalled();
  });

  it('nutzt eine dynamische Kostenfunktion', async () => {
    const req = { user: userWithPlan('basic'), body: { text: 'x'.repeat(450) } };
    await run(meterAiTokens('tts', { cost: (r) => costFor('tts', { textLength: r.body.text.length }) }), req);
    expect(req.aiTokens.cost).toBe(3 * getTokenCosts().tts);
  });

  it('verlangt eine Anmeldung', async () => {
    const { res, next } = await run(meterAiTokens('chat'), { body: {} });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
