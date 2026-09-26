import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('./supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const engineMocks = vi.hoisted(() => ({
  getCurrentWallet: vi.fn(),
  grantMonthlyCredits: vi.fn(),
}));
vi.mock('./creditEngine.js', () => engineMocks);

vi.mock('./appSettings.js', () => ({ isAllToolsFree: vi.fn(async () => false) }));

const { resolveBillingPeriod, ensureCurrentWallet, grantForPlanChange, resolveCreditPlan, BILLING_PERIOD_DAYS } =
  await import('./walletProvisioning.js');

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  engineMocks.getCurrentWallet.mockReset();
  engineMocks.grantMonthlyCredits.mockReset();
  supabaseMock.current = createSupabaseMock({ fromResults: { credit_wallets: { data: null, error: null } } });
});
afterEach(() => vi.restoreAllMocks());

describe('resolveBillingPeriod', () => {
  it('nutzt user.created_at als Anker für Free-User', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const user = { app_metadata: {}, created_at: new Date(now.getTime() - 5 * DAY).toISOString() };
    const period = resolveBillingPeriod(user, now);
    expect(period.anchorSource).toBe('created_at');
    expect(period.start.getTime()).toBe(now.getTime() - 5 * DAY);
    expect(period.end.getTime()).toBe(period.start.getTime() + BILLING_PERIOD_DAYS * DAY);
  });

  it('rolliert in 30-Tage-Schritten bis zur Periode, die "now" enthält', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const anchor = new Date(now.getTime() - 65 * DAY); // 2 volle Perioden zurück
    const user = { app_metadata: {}, created_at: anchor.toISOString() };
    const period = resolveBillingPeriod(user, now);
    expect(period.start.getTime()).toBe(anchor.getTime() + 2 * BILLING_PERIOD_DAYS * DAY);
    expect(period.start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(period.end.getTime()).toBeGreaterThan(now.getTime());
  });

  it('nutzt premium_activated_at für einen bezahlten Plan', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const activatedAt = new Date(now.getTime() - 3 * DAY).toISOString();
    const user = {
      app_metadata: { premium_plan_id: 'basic', premium_expires_at: new Date(now.getTime() + 27 * DAY).toISOString(), premium_activated_at: activatedAt },
      created_at: new Date(now.getTime() - 400 * DAY).toISOString(),
    };
    const period = resolveBillingPeriod(user, now);
    expect(period.anchorSource).toBe('premium_activated_at');
  });

  it('kappt das Periodenende am Ablauf eines kurzen Passes', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const startedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 2 * DAY).toISOString();
    const user = { app_metadata: { premium_pass_started_at: startedAt, premium_pass_expires_at: expiresAt, premium_plan_id: 'free' } };
    const period = resolveBillingPeriod(user, now);
    expect(period.end.getTime()).toBe(new Date(expiresAt).getTime());
  });

  it('fällt ohne jeden Anker auf "now" zurück', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const period = resolveBillingPeriod({ app_metadata: {} }, now);
    expect(period.anchorSource).toBe('now');
    expect(period.start.getTime()).toBe(now.getTime());
  });
});

describe('resolveCreditPlan', () => {
  it('mappt free/basic/premium korrekt und respektiert "Alle Tools kostenlos"', () => {
    const user = { app_metadata: { premium_plan_id: 'free' } };
    expect(resolveCreditPlan(user).creditPlan).toBe('free');
    expect(resolveCreditPlan(user, new Date(), { allToolsFree: true }).creditPlan).toBe('premium');
  });
});

describe('ensureCurrentWallet', () => {
  it('legt keine neue Wallet an, wenn schon eine aktuelle existiert', async () => {
    engineMocks.getCurrentWallet.mockResolvedValue({ periodStart: 'a', periodEnd: 'b' });
    const result = await ensureCurrentWallet({ id: 'u1', app_metadata: {}, created_at: new Date().toISOString() });
    expect(result).toEqual({ ok: true, created: false, periodStart: 'a', periodEnd: 'b' });
    expect(engineMocks.grantMonthlyCredits).not.toHaveBeenCalled();
  });

  it('grantet die erste Periode, wenn keine Wallet existiert', async () => {
    engineMocks.getCurrentWallet.mockResolvedValue(null);
    engineMocks.grantMonthlyCredits.mockResolvedValue({ ok: true, already_granted: false });
    const result = await ensureCurrentWallet({ id: 'u1', app_metadata: {}, created_at: new Date().toISOString() });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(engineMocks.grantMonthlyCredits).toHaveBeenCalledTimes(1);
  });

  it('ist fail-closed (ok:false), wenn die Engine wirft', async () => {
    engineMocks.getCurrentWallet.mockRejectedValue(new Error('db down'));
    const result = await ensureCurrentWallet({ id: 'u1', app_metadata: {}, created_at: new Date().toISOString() });
    expect(result).toEqual({ ok: false, reason: 'credit_system_unavailable' });
  });

  it('ohne user.id liefert sofort no_user', async () => {
    expect(await ensureCurrentWallet(null)).toEqual({ ok: false, reason: 'no_user' });
  });
});

describe('grantForPlanChange', () => {
  it('startet sofort eine neue Periode für einen höheren Plan', async () => {
    engineMocks.getCurrentWallet.mockResolvedValue({ includedCredits: 0 });
    engineMocks.grantMonthlyCredits.mockResolvedValue({ ok: true });
    const user = { id: 'u1', app_metadata: { premium_plan_id: 'pro', premium_expires_at: new Date(Date.now() + 30 * DAY).toISOString() } };
    const result = await grantForPlanChange(user);
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(engineMocks.grantMonthlyCredits).toHaveBeenCalledTimes(1);
  });

  it('lässt eine laufende gleich- oder höherwertige Periode unverändert', async () => {
    engineMocks.getCurrentWallet.mockResolvedValue({ includedCredits: 1_000_000 });
    const user = { id: 'u1', app_metadata: { premium_plan_id: 'basic', premium_expires_at: new Date(Date.now() + 10 * DAY).toISOString() } };
    const result = await grantForPlanChange(user);
    expect(result.unchanged).toBe(true);
    expect(engineMocks.grantMonthlyCredits).not.toHaveBeenCalled();
  });

  it('routet Free-User an ensureCurrentWallet', async () => {
    engineMocks.getCurrentWallet.mockResolvedValue(null);
    engineMocks.grantMonthlyCredits.mockResolvedValue({ ok: true });
    const user = { id: 'u1', app_metadata: {}, created_at: new Date().toISOString() };
    const result = await grantForPlanChange(user);
    expect(result.ok).toBe(true);
  });
});
