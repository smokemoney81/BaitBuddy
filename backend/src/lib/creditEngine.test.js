import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

// Die Atomizität (Row-Locks, eine Transaktion) liegt in den SQL-Funktionen;
// hier wird nur der JS-Wrapper gegen einen gemockten RPC-Client geprüft.
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('./supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const {
  reserveCredits, finalizeCredits, rollbackCredits, grantMonthlyCredits,
  addTopupCredits, getCurrentWallet, UNAVAILABLE_REASON,
} = await import('./creditEngine.js');

const reserveArgs = {
  userId: 'u1', requestId: 'req-1', feature: 'buddy_simple_text',
  credits: 10, estimatedCostEur: 0.002, provider: 'anthropic', model: 'claude-haiku-4-5',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('reserveCredits', () => {
  it('ruft die RPC mit allen Parametern auf und meldet Erfolg', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      reserve_ai_credits: { data: { ok: true, reservation_id: 'r1', wallet_remaining: 290, cost_remaining_eur: 0.048 }, error: null },
    } });
    const res = await reserveCredits(reserveArgs);
    expect(supabaseMock.current.rpc).toHaveBeenCalledWith('reserve_ai_credits', {
      p_user_id: 'u1', p_request_id: 'req-1', p_feature: 'buddy_simple_text', p_credits: 10,
      p_estimated_cost_eur: 0.002, p_provider: 'anthropic', p_model: 'claude-haiku-4-5',
    });
    expect(res).toEqual({ ok: true, duplicate: false, reservationId: 'r1', walletRemaining: 290, costRemainingEur: 0.048 });
  });

  it('reicht insufficient_credits durch', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      reserve_ai_credits: { data: { ok: false, reason: 'insufficient_credits', wallet_remaining: 3 }, error: null },
    } });
    expect(await reserveCredits(reserveArgs)).toMatchObject({ ok: false, reason: 'insufficient_credits' });
  });

  it('behandelt duplicate_request nicht als Erfolg', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      reserve_ai_credits: { data: { ok: false, reason: 'duplicate_request', status: 'finalized' }, error: null },
    } });
    expect(await reserveCredits(reserveArgs)).toMatchObject({ ok: false, reason: 'duplicate_request' });
  });

  it('reicht cost_limit_exceeded durch', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      reserve_ai_credits: { data: { ok: false, reason: 'cost_limit_exceeded' }, error: null },
    } });
    expect(await reserveCredits(reserveArgs)).toMatchObject({ ok: false, reason: 'cost_limit_exceeded' });
  });

  it('ist fail-closed bei DB-Fehler (wirft nicht)', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      reserve_ai_credits: { data: null, error: { message: 'connection refused' } },
    } });
    expect(await reserveCredits(reserveArgs)).toMatchObject({ ok: false, reason: UNAVAILABLE_REASON });
  });

  it('ist fail-closed, wenn die RPC wirft oder fehlt', async () => {
    supabaseMock.current = createSupabaseMock();
    supabaseMock.current.rpc.mockRejectedValueOnce(new Error('network'));
    expect(await reserveCredits(reserveArgs)).toMatchObject({ ok: false, reason: UNAVAILABLE_REASON });
    // Unbekannte Funktion (Migration fehlt) → ebenfalls gesperrt
    expect(await reserveCredits(reserveArgs)).toMatchObject({ ok: false, reason: UNAVAILABLE_REASON });
  });
});

describe('finalizeCredits', () => {
  it('übergibt tatsächliche Credits/Kosten für die Erstattung an die RPC', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      finalize_ai_credits: { data: { ok: true, credits_diff: -15, wallet_remaining: 275 }, error: null },
    } });
    const res = await finalizeCredits({
      requestId: 'req-1', userId: 'u1', actualCostEur: 0.001, creditsCharged: 10,
      inputTokens: 1200, outputTokens: 300, cachedTokens: 800,
    });
    expect(supabaseMock.current.rpc).toHaveBeenCalledWith('finalize_ai_credits', {
      p_request_id: 'req-1', p_user_id: 'u1', p_actual_cost_eur: 0.001, p_credits_charged: 10,
      p_input_tokens: 1200, p_output_tokens: 300, p_cached_tokens: 800, p_voice_seconds: null, p_images: null,
    });
    expect(res).toEqual({ ok: true, credits_diff: -15, wallet_remaining: 275 });
  });

  it('reicht Doppel-Finalize als klare Ablehnung durch', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      finalize_ai_credits: { data: { ok: false, reason: 'not_reserved', status: 'finalized' }, error: null },
    } });
    expect(await finalizeCredits({ requestId: 'r', userId: 'u1', actualCostEur: 0, creditsCharged: 0 }))
      .toMatchObject({ ok: false, reason: 'not_reserved' });
  });
});

describe('rollbackCredits', () => {
  it('ruft die RPC mit Grund auf', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      rollback_ai_credits: { data: { ok: true, refunded_credits: 10 }, error: null },
    } });
    const res = await rollbackCredits({ requestId: 'req-1', userId: 'u1', reason: 'provider_error' });
    expect(supabaseMock.current.rpc).toHaveBeenCalledWith('rollback_ai_credits', {
      p_request_id: 'req-1', p_user_id: 'u1', p_reason: 'provider_error',
    });
    expect(res.refunded_credits).toBe(10);
  });
});

describe('grantMonthlyCredits / addTopupCredits', () => {
  it('wandelt Datumswerte in ISO um und reicht Topup-Duplikate durch', async () => {
    supabaseMock.current = createSupabaseMock({ rpcResults: {
      grant_monthly_credits: { data: { ok: true, already_granted: false }, error: null },
      add_topup_credits: { data: { ok: true, duplicate: true }, error: null },
    } });
    await grantMonthlyCredits({
      userId: 'u1', planCode: 'basic', includedCredits: 2500,
      periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-11-01T00:00:00Z'), costLimitEur: 0.5,
    });
    expect(supabaseMock.current.rpc).toHaveBeenCalledWith('grant_monthly_credits', {
      p_user_id: 'u1', p_plan_code: 'basic', p_included_credits: 2500,
      p_period_start: '2026-10-01T00:00:00.000Z', p_period_end: '2026-11-01T00:00:00.000Z', p_cost_limit_eur: 0.5,
    });
    expect(await addTopupCredits({ userId: 'u1', credits: 2500, requestId: 'pi_1' })).toEqual({ ok: true, duplicate: true });
  });
});

describe('getCurrentWallet', () => {
  it('berechnet Rest und Prozent', async () => {
    supabaseMock.current = createSupabaseMock({ fromResults: {
      credit_wallets: { data: {
        billing_period_start: '2026-09-01T00:00:00Z', billing_period_end: '2026-10-01T00:00:00Z',
        included_credits: 2500, bonus_credits: 500, purchased_credits: 1000, used_credits: 1000,
      }, error: null },
      provider_cost_periods: { data: { cost_eur: '0.1200', cost_limit_eur: '0.5000' }, error: null },
    } });
    const w = await getCurrentWallet('u1', new Date('2026-09-26T00:00:00Z'));
    expect(w).toMatchObject({ totalCredits: 4000, remaining: 3000, percentRemaining: 75, costEur: 0.12, costLimitEur: 0.5 });
  });

  it('liefert null ohne laufende Periode', async () => {
    supabaseMock.current = createSupabaseMock({ fromResults: { credit_wallets: { data: null, error: null } } });
    expect(await getCurrentWallet('u1')).toBeNull();
  });
});
