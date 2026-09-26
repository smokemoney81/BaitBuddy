import { describe, it, expect, vi, beforeEach } from 'vitest';

const configMocks = vi.hoisted(() => ({
  isCreditSystemEnabled: vi.fn(() => true),
  computeVoiceCredits: vi.fn(() => 5),
}));
vi.mock('../lib/creditConfig.js', () => configMocks);

const engineMocks = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  finalizeCredits: vi.fn(async () => ({ ok: true })),
  rollbackCredits: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../lib/creditEngine.js', () => engineMocks);

vi.mock('../lib/planCreditMapping.js', () => ({ mapPlanCodeToCreditPlan: vi.fn(() => 'basic') }));
vi.mock('../lib/planResolver.js', () => ({ resolvePlan: vi.fn(() => ({ effectiveId: 'basic' })) }));

const routingMocks = vi.hoisted(() => ({
  classifyFeature: vi.fn(() => ({ feature: 'chat', category: 'buddy_simple_text', tier: 'low', model: 'claude-haiku-4-5', credits: 10 })),
  estimateCostEur: vi.fn(() => 0.001),
  estimateTokenCostEur: vi.fn(() => 0.002),
  estimateVoiceCostEur: vi.fn(() => 0.01),
}));
vi.mock('../lib/aiModelRouting.js', () => routingMocks);

const walletMocks = vi.hoisted(() => ({ ensureCurrentWallet: vi.fn(async () => ({ ok: true })) }));
vi.mock('../lib/walletProvisioning.js', () => walletMocks);

vi.mock('../lib/aiTokenQuota.js', () => ({ meterAiTokens: vi.fn(() => (req, res, next) => next()) }));
vi.mock('./auth.js', () => ({ isSuperuserEmail: vi.fn(() => false) }));

const { creditGuard, chargeAi, finalizeCreditGuard, rollbackCreditGuard } = await import('./creditGuard.js');

function mockRes() {
  const res = {
    statusCode: 200,
    status: vi.fn((code) => { res.statusCode = code; return res; }),
    json: vi.fn((body) => body),
    on: vi.fn(),
  };
  return res;
}

beforeEach(async () => {
  vi.clearAllMocks();
  configMocks.isCreditSystemEnabled.mockReturnValue(true);
  engineMocks.finalizeCredits.mockResolvedValue({ ok: true });
  engineMocks.rollbackCredits.mockResolvedValue({ ok: true });
  routingMocks.classifyFeature.mockReturnValue({ feature: 'chat', category: 'buddy_simple_text', tier: 'low', model: 'claude-haiku-4-5', credits: 10 });
  walletMocks.ensureCurrentWallet.mockResolvedValue({ ok: true });
  const authMock = await import('./auth.js');
  authMock.isSuperuserEmail.mockReturnValue(false);
});

describe('creditGuard (Flag aus)', () => {
  it('reicht sofort durch, wenn AI_CREDIT_SYSTEM_ENABLED false ist', async () => {
    configMocks.isCreditSystemEnabled.mockReturnValue(false);
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    const next = vi.fn();
    await creditGuard('chat')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(engineMocks.reserveCredits).not.toHaveBeenCalled();
  });
});

describe('creditGuard (Flag an)', () => {
  it('reserviert Credits und ruft next() bei Erfolg', async () => {
    engineMocks.reserveCredits.mockResolvedValue({ ok: true, reservationId: 'r1' });
    const req = { user: { id: 'u1', email: 'x@example.com' } };
    const res = mockRes();
    const next = vi.fn();
    await creditGuard('chat')(req, res, next);
    expect(engineMocks.reserveCredits).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalled();
    expect(req.aiTokens).toBeTruthy();
    expect(req.creditRequestId).toBeTruthy();
  });

  it('liefert 429 mit code credit_quota_exceeded bei insufficient_credits', async () => {
    engineMocks.reserveCredits.mockResolvedValue({ ok: false, reason: 'insufficient_credits' });
    const req = { user: { id: 'u1', email: 'x@example.com' } };
    const res = mockRes();
    const next = vi.fn();
    await creditGuard('chat')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('credit_quota_exceeded');
    expect(body.reason).toBe('insufficient_credits');
    expect(next).not.toHaveBeenCalled();
  });

  it('liefert dieselbe neutrale Meldung bei cost_limit_exceeded wie bei insufficient_credits', async () => {
    engineMocks.reserveCredits.mockResolvedValue({ ok: false, reason: 'cost_limit_exceeded' });
    const req1 = { user: { id: 'u1', email: 'x@example.com' } };
    const res1 = mockRes();
    await creditGuard('chat')(req1, res1, vi.fn());

    engineMocks.reserveCredits.mockResolvedValue({ ok: false, reason: 'insufficient_credits' });
    const req2 = { user: { id: 'u2', email: 'y@example.com' } };
    const res2 = mockRes();
    await creditGuard('chat')(req2, res2, vi.fn());

    expect(res1.json.mock.calls[0][0].message).toBe(res2.json.mock.calls[0][0].message);
    expect(res1.json.mock.calls[0][0].reason).not.toBe(res2.json.mock.calls[0][0].reason);
  });

  it('holt bei no_active_wallet die Wallet nach und versucht die Reservierung genau einmal erneut', async () => {
    engineMocks.reserveCredits
      .mockResolvedValueOnce({ ok: false, reason: 'no_active_wallet' })
      .mockResolvedValueOnce({ ok: true, reservationId: 'r2' });
    const req = { user: { id: 'u1', email: 'x@example.com' } };
    const res = mockRes();
    const next = vi.fn();
    await creditGuard('chat')(req, res, next);
    expect(walletMocks.ensureCurrentWallet).toHaveBeenCalledTimes(1);
    expect(engineMocks.reserveCredits).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalled();
  });

  it('bricht mit 500 ab, wenn die Nachprovisionierung ebenfalls scheitert', async () => {
    engineMocks.reserveCredits.mockResolvedValue({ ok: false, reason: 'no_active_wallet' });
    walletMocks.ensureCurrentWallet.mockResolvedValue({ ok: false, reason: 'credit_system_unavailable' });
    const req = { user: { id: 'u1', email: 'x@example.com' } };
    const res = mockRes();
    const next = vi.fn();
    await creditGuard('chat')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('umgeht die Reservierung für Superuser', async () => {
    const authMock = await import('./auth.js');
    authMock.isSuperuserEmail.mockReturnValue(true);
    const req = { user: { id: 'u1', email: 'super@example.com' } };
    const res = mockRes();
    const next = vi.fn();
    await creditGuard('chat')(req, res, next);
    expect(engineMocks.reserveCredits).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('finalisiert automatisch über den res.json-Hook bei Erfolg (Status < 400)', async () => {
    engineMocks.reserveCredits.mockResolvedValue({ ok: true, reservationId: 'r1' });
    const req = { user: { id: 'u1', email: 'x@example.com' } };
    const res = mockRes();
    await creditGuard('chat')(req, res, vi.fn());
    res.status(200);
    await res.json({ ok: true });
    expect(engineMocks.finalizeCredits).toHaveBeenCalledTimes(1);
    expect(engineMocks.rollbackCredits).not.toHaveBeenCalled();
  });

  it('rollt automatisch zurück über den res.json-Hook bei Fehlerstatus (>=400)', async () => {
    engineMocks.reserveCredits.mockResolvedValue({ ok: true, reservationId: 'r1' });
    const req = { user: { id: 'u1', email: 'x@example.com' } };
    const res = mockRes();
    await creditGuard('chat')(req, res, vi.fn());
    res.status(500);
    await res.json({ ok: false });
    expect(engineMocks.rollbackCredits).toHaveBeenCalledTimes(1);
    expect(engineMocks.finalizeCredits).not.toHaveBeenCalled();
  });
});

describe('finalizeCreditGuard / rollbackCreditGuard', () => {
  it('finalisiert nur einmal, auch bei doppeltem Aufruf', async () => {
    const req = { creditReservation: { requestId: 'r1', userId: 'u1', settled: false, classification: { tier: 'low' }, credits: 10, estimatedCostEur: 0.001 } };
    await finalizeCreditGuard(req, {});
    await finalizeCreditGuard(req, {});
    expect(engineMocks.finalizeCredits).toHaveBeenCalledTimes(1);
  });

  it('rollbackCreditGuard settled=true verhindert eine spätere Finalisierung', async () => {
    const req = { creditReservation: { requestId: 'r1', userId: 'u1', settled: false, classification: { tier: 'low' }, credits: 10, estimatedCostEur: 0.001 } };
    await rollbackCreditGuard(req, 'provider_error');
    await finalizeCreditGuard(req, {});
    expect(engineMocks.rollbackCredits).toHaveBeenCalledTimes(1);
    expect(engineMocks.finalizeCredits).not.toHaveBeenCalled();
  });
});

describe('chargeAi', () => {
  it('wählt zur Laufzeit zwischen creditGuard und meterAiTokens', async () => {
    const { meterAiTokens } = await import('../lib/aiTokenQuota.js');
    configMocks.isCreditSystemEnabled.mockReturnValue(false);
    const req = { user: { id: 'u1' } };
    const res = mockRes();
    const next = vi.fn();
    await chargeAi('chat')(req, res, next);
    expect(meterAiTokens).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
