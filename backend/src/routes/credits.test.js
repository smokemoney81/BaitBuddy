import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const configMocks = vi.hoisted(() => ({
  isCreditSystemEnabled: vi.fn(() => true),
  areCreditTopupsEnabled: vi.fn(() => false),
  getCreditCosts: vi.fn(() => ({ buddy_simple_text: 10, satellite_standard: 250 })),
  TOPUP_PACKAGES: [
    { credits: 2500, priceCents: 249 },
    { credits: 7500, priceCents: 499 },
  ],
  computeVoiceCredits: vi.fn(() => 0),
  DEFAULT_CREDIT_PLANS: {},
  DEFAULT_CREDIT_COSTS: {},
  getCreditPlans: vi.fn(() => ({ free: { includedCredits: 300 }, basic: { includedCredits: 2500 }, pro: { includedCredits: 10000 }, ultimate: { includedCredits: 30000 } })),
}));
vi.mock('../lib/creditConfig.js', () => configMocks);

const engineMocks = vi.hoisted(() => ({
  getCurrentWallet: vi.fn(),
}));
vi.mock('../lib/creditEngine.js', () => engineMocks);

const walletMocks = vi.hoisted(() => ({
  ensureCurrentWallet: vi.fn(async () => ({ ok: true })),
  resolveCreditPlan: vi.fn(() => ({ creditPlan: 'basic' })),
}));
vi.mock('../lib/walletProvisioning.js', () => walletMocks);

let app;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  configMocks.isCreditSystemEnabled.mockReturnValue(true);
  walletMocks.ensureCurrentWallet.mockResolvedValue({ ok: true });
  walletMocks.resolveCreditPlan.mockReturnValue({ creditPlan: 'basic' });
  supabaseMock.current = createSupabaseMock({ authUser: { id: 'u1', email: 'a@b.de' } });
  ({ default: app } = await import('../server.js'));
});

describe('GET /api/credits/wallet', () => {
  it('lehnt Zugriff ohne Token ab (401)', async () => {
    const res = await request(app).get('/api/credits/wallet');
    expect(res.status).toBe(401);
  });

  it('liefert 404 wenn das Credit-System deaktiviert ist', async () => {
    configMocks.isCreditSystemEnabled.mockReturnValue(false);
    const res = await request(app).get('/api/credits/wallet').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
    expect(res.body.enabled).toBe(false);
  });

  it('liefert den Guthabenstand ohne rohe Providerkosten', async () => {
    engineMocks.getCurrentWallet.mockResolvedValue({
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z',
      includedCredits: 2500,
      bonusCredits: 0,
      purchasedCredits: 0,
      usedCredits: 500,
      totalCredits: 2500,
      remaining: 2000,
      percentRemaining: 80,
      costEur: 0.1,
      costLimitEur: 0.5,
    });

    const res = await request(app).get('/api/credits/wallet').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.plan).toBe('basic');
    expect(res.body.remaining).toBe(2000);
    expect(res.body.percent_remaining).toBe(80);
    expect(res.body.next_renewal).toBe('2026-10-01T00:00:00.000Z');
    expect(res.body.topup_packages).toEqual([]);
    expect(res.body.plan_quotas.elite).toBe(30000);
    expect(res.body.recent).toEqual([]);
    // Keine rohen Providerkosten im Response
    expect(res.body.cost_eur).toBeUndefined();
    expect(res.body.provider_cost_eur).toBeUndefined();
    expect(res.body.cost_limit_reached).toBe(false);
  });

  it('liefert 503, wenn keine Wallet ermittelt werden kann', async () => {
    engineMocks.getCurrentWallet.mockResolvedValue(null);
    const res = await request(app).get('/api/credits/wallet').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(503);
  });
});

describe('GET /api/credits/feature-costs', () => {
  it('liefert 404 wenn das Credit-System deaktiviert ist', async () => {
    configMocks.isCreditSystemEnabled.mockReturnValue(false);
    const res = await request(app).get('/api/credits/feature-costs').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
  });

  it('liefert die Feature-Kosten (nur Preisinformation)', async () => {
    const res = await request(app).get('/api/credits/feature-costs').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.costs.satellite_standard).toBe(250);
  });
});
