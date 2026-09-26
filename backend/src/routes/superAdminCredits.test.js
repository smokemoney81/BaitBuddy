import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const SUPERUSER = { id: 'su-1', email: 'Kaisaschnitt99@gmail.com', user_metadata: {} };

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const configMocks = vi.hoisted(() => ({ isCreditSystemEnabled: vi.fn(() => true) }));
vi.mock('../lib/creditConfig.js', () => ({
  ...configMocks,
  TOPUP_PACKAGES: [{ credits: 2500, priceCents: 249 }, { credits: 7500, priceCents: 499 }],
  getCreditCosts: vi.fn(() => ({})),
  computeVoiceCredits: vi.fn(() => 0),
}));

let app;

async function boot({ fromResults = {}, adminUsers = [] } = {}) {
  vi.resetModules();
  configMocks.isCreditSystemEnabled.mockReturnValue(true);
  supabaseMock.current = createSupabaseMock({ authUser: SUPERUSER, fromResults, adminUsers });
  ({ default: app } = await import('../server.js'));
}

const auth = (req) => req.set('Authorization', 'Bearer token');

describe('GET /api/superadmin/credits/users', () => {
  it('liefert 404 wenn das Credit-System deaktiviert ist', async () => {
    await boot();
    configMocks.isCreditSystemEnabled.mockReturnValue(false);
    const res = await auth(request(app).get('/api/superadmin/credits/users'));
    expect(res.status).toBe(404);
  });

  it('aggregiert Wallet, Kosten und Nutzungszahlen je Nutzer', async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString();
    await boot({
      adminUsers: [
        { id: 'u1', email: 'user1@test.de', app_metadata: {}, user_metadata: {}, last_sign_in_at: now.toISOString() },
      ],
      fromResults: {
        credit_wallets: {
          data: [{
            user_id: 'u1', billing_period_start: periodStart, billing_period_end: periodEnd,
            included_credits: 2500, bonus_credits: 0, purchased_credits: 0, used_credits: 400,
          }],
          error: null,
        },
        provider_cost_periods: {
          data: [{ user_id: 'u1', period_start: periodStart, period_end: periodEnd, cost_eur: 0.45, cost_limit_eur: 0.5 }],
          error: null,
        },
        ai_usage: {
          data: [
            { user_id: 'u1', feature: 'chat', voice_seconds: null, created_at: now.toISOString(), status: 'finalized' },
            { user_id: 'u1', feature: 'satellite-analysis', voice_seconds: null, created_at: now.toISOString(), status: 'finalized' },
            { user_id: 'u1', feature: 'tts', voice_seconds: 120, created_at: now.toISOString(), status: 'finalized' },
          ],
          error: null,
        },
      },
    });

    const res = await auth(request(app).get('/api/superadmin/credits/users'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const u = res.body.users[0];
    expect(u.credits_total).toBe(2500);
    expect(u.credits_used).toBe(400);
    expect(u.credits_remaining).toBe(2100);
    expect(u.provider_cost_eur).toBeCloseTo(0.45);
    expect(u.ai_requests).toBe(3);
    expect(u.satellite_analyses).toBe(1);
    expect(u.voice_minutes).toBe(2);
  });
});

describe('GET /api/superadmin/credits/stats', () => {
  it('liefert 404 wenn das Credit-System deaktiviert ist', async () => {
    await boot();
    configMocks.isCreditSystemEnabled.mockReturnValue(false);
    const res = await auth(request(app).get('/api/superadmin/credits/stats'));
    expect(res.status).toBe(404);
  });

  it('aggregiert Kosten, Warnungen und Topup-Umsatz', async () => {
    const now = new Date();
    await boot({
      fromResults: {
        ai_usage: {
          data: [
            { feature: 'chat', actual_cost_eur: 0.01, estimated_cost_eur: 0.01, created_at: now.toISOString(), status: 'finalized' },
            { feature: 'satellite-analysis', actual_cost_eur: 0.2, estimated_cost_eur: 0.2, created_at: now.toISOString(), status: 'finalized' },
          ],
          error: null,
        },
        credit_transactions: {
          data: [
            { type: 'topup', amount: 2500, created_at: now.toISOString() },
            { type: 'usage', amount: -500, created_at: now.toISOString() },
          ],
          error: null,
        },
        provider_cost_periods: {
          data: [{ user_id: 'u1', cost_eur: 0.46, cost_limit_eur: 0.5 }],
          error: null,
        },
      },
    });

    const res = await auth(request(app).get('/api/superadmin/credits/stats'));
    expect(res.status).toBe(200);
    expect(res.body.credits_sold).toBe(2500);
    expect(res.body.credits_used).toBe(500);
    expect(res.body.topup_revenue_eur).toBeCloseTo(2.49);
    expect(res.body.warnings.over_90_percent).toBe(1);
    expect(res.body.cost_by_feature_eur.find((f) => f.feature === 'satellite-analysis').cost_eur).toBeCloseTo(0.2);
  });
});
