import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock, createQueryBuilderMock } from '../../test/mockSupabase.js';

const REFERRER = {
  id: 'ref-user-1',
  email: 'referrer@baitbuddy.test',
  user_metadata: { referral_code: 'FRIENDS1' },
};
const NEW_USER = {
  id: 'new-user-2',
  email: 'invitee@baitbuddy.test',
  user_metadata: {},
};

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { current: null },
}));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

let app;

async function bootApp({ authUser, referrer = REFERRER } = {}) {
  vi.resetModules();
  supabaseMock.current = createSupabaseMock({ authUser });
  // Admin-Helfer werden pro Test überschrieben. getUserById antwortet je ID —
  // die Routen laden sowohl den eigenen (frischen) Stand als auch den Referrer.
  const users = { [referrer.id]: referrer };
  if (authUser) users[authUser.id] = authUser;
  supabaseMock.current.auth.admin = {
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    getUserById: vi.fn(async (id) => ({ data: { user: users[id] || null }, error: null })),
  };
  ({ default: app } = await import('../server.js'));
  return app;
}

beforeEach(() => {
  supabaseMock.current = null;
});

describe('GET /api/referrals/me', () => {
  it('liefert den bestehenden Code, ohne einen neuen zu erzeugen', async () => {
    await bootApp({ authUser: REFERRER });

    // Der Code ist bereits diesem Nutzer zugeordnet.
    const codesBuilder = createQueryBuilderMock({ data: { user_id: REFERRER.id }, error: null });
    // count-Query: liefert count via head:true
    const countBuilder = createQueryBuilderMock({ count: 3, error: null });

    supabaseMock.current.from = vi.fn((table) => {
      if (table === 'user_referral_codes') return codesBuilder;
      if (table === 'referrals') return countBuilder;
      return createQueryBuilderMock();
    });

    const res = await request(app)
      .get('/api/referrals/me')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toBe('FRIENDS1');
    expect(res.body.referral_count).toBe(3);
    expect(res.body.reward_days).toBe(7);
    expect(res.body.reward_plan_id).toBe('elite');
    expect(codesBuilder.insert).not.toHaveBeenCalled();
    expect(codesBuilder.upsert).not.toHaveBeenCalled();
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('trägt einen vorhandenen, noch freien Code im Lookup nach', async () => {
    await bootApp({ authUser: REFERRER });
    const codesBuilder = createQueryBuilderMock({ data: null, error: null });
    supabaseMock.current.from = vi.fn((table) => (
      table === 'user_referral_codes' ? codesBuilder : createQueryBuilderMock({ count: 0, error: null })
    ));

    const res = await request(app)
      .get('/api/referrals/me')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('FRIENDS1');
    expect(codesBuilder.insert).toHaveBeenCalledWith({ code: 'FRIENDS1', user_id: REFERRER.id });
  });

  // Code-Hijack: user_metadata ist clientseitig beschreibbar. Ein dort
  // eingetragener fremder Code darf den Lookup nicht auf den Angreifer umbiegen.
  it('übernimmt keinen Code, der einem anderen Nutzer gehört', async () => {
    const attacker = { id: 'attacker', email: 'a@x.test', user_metadata: { referral_code: 'FRIENDS1' } };
    await bootApp({ authUser: attacker });
    const codesBuilder = createQueryBuilderMock({ data: { user_id: REFERRER.id }, error: null });
    supabaseMock.current.from = vi.fn((table) => (
      table === 'user_referral_codes' ? codesBuilder : createQueryBuilderMock({ count: 0, error: null })
    ));

    const res = await request(app)
      .get('/api/referrals/me')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe('FRIENDS1');
    expect(codesBuilder.upsert).not.toHaveBeenCalled();
    expect(codesBuilder.insert).not.toHaveBeenCalledWith({ code: 'FRIENDS1', user_id: 'attacker' });
    expect(codesBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'attacker' }),
    );
  });
});

describe('POST /api/referrals/redeem', () => {
  it('lehnt fehlenden Code ab', async () => {
    await bootApp({ authUser: NEW_USER });
    const res = await request(app)
      .post('/api/referrals/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({});
    expect(res.status).toBe(400);
  });

  it('verweigert Doppel-Einlösung', async () => {
    await bootApp({
      authUser: { ...NEW_USER, user_metadata: { referred_by: 'FRIENDS1' } },
    });
    const res = await request(app)
      .post('/api/referrals/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'friends1' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('already_redeemed');
  });

  it('lehnt unbekannten Code ab', async () => {
    await bootApp({ authUser: NEW_USER });
    supabaseMock.current.from = vi.fn((table) => {
      if (table === 'user_referral_codes') {
        return createQueryBuilderMock({ data: null, error: null });
      }
      return createQueryBuilderMock();
    });

    const res = await request(app)
      .post('/api/referrals/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'UNKNOWN1' });
    expect(res.status).toBe(404);
  });

  it('verweigert das Einlösen des eigenen Codes', async () => {
    await bootApp({ authUser: NEW_USER });
    supabaseMock.current.from = vi.fn((table) => {
      if (table === 'user_referral_codes') {
        return createQueryBuilderMock({ data: { user_id: NEW_USER.id }, error: null });
      }
      return createQueryBuilderMock();
    });

    const res = await request(app)
      .post('/api/referrals/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'SELFCODE' });
    expect(res.status).toBe(400);
  });

  it('protokolliert die Empfehlung und verlängert den Ultimate-Plan um 7 Tage', async () => {
    await bootApp({ authUser: NEW_USER });

    const insertBuilder = createQueryBuilderMock({ data: null, error: null });
    const lookupBuilder = createQueryBuilderMock({
      data: { user_id: REFERRER.id },
      error: null,
    });

    supabaseMock.current.from = vi.fn((table) => {
      if (table === 'user_referral_codes') return lookupBuilder;
      if (table === 'referrals') return insertBuilder;
      return createQueryBuilderMock();
    });

    const res = await request(app)
      .post('/api/referrals/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'friends1' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.reward_extended).toBe(true);
    expect(res.body.reward_days).toBe(7);
    expect(res.body.reward_plan_id).toBe('elite');

    // Log-Zeile geschrieben
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        referrer_user_id: REFERRER.id,
        referred_user_id: NEW_USER.id,
        referral_code: 'FRIENDS1',
        reward_days: 7,
      }),
    );

    // Referrer bekommt einen 7-Tage-Ultimate-Pass in app_metadata — nur dort
    // liest resolvePlan() Plan-Felder.
    const updateCalls = supabaseMock.current.auth.admin.updateUserById.mock.calls;
    const referrerUpdate = updateCalls.find((c) => c[0] === REFERRER.id);
    expect(referrerUpdate).toBeDefined();
    expect(referrerUpdate[1].user_metadata).toBeUndefined();
    expect(referrerUpdate[1].app_metadata.referral_reward_count).toBe(1);
    expect(new Date(referrerUpdate[1].app_metadata.premium_pass_expires_at).getTime())
      .toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    // Einladender-Nutzer wird als "referred_by" markiert
    const invitedUpdate = updateCalls.find((c) => c[0] === NEW_USER.id);
    expect(invitedUpdate).toBeDefined();
    expect(invitedUpdate[1].user_metadata.referred_by).toBe('FRIENDS1');
  });

  it('hängt an bestehende Ultimate-Laufzeit an statt sie zu kappen', async () => {
    const existingExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const paidReferrer = {
      ...REFERRER,
      app_metadata: {
        premium_plan_id: 'friends',
        premium_expires_at: existingExpires,
      },
    };
    await bootApp({ authUser: NEW_USER, referrer: paidReferrer });
    supabaseMock.current.from = vi.fn((table) => {
      if (table === 'user_referral_codes') {
        return createQueryBuilderMock({ data: { user_id: paidReferrer.id }, error: null });
      }
      if (table === 'referrals') return createQueryBuilderMock({ data: null, error: null });
      return createQueryBuilderMock();
    });

    const res = await request(app)
      .post('/api/referrals/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'FRIENDS1' });

    expect(res.status).toBe(200);
    // Der 'friends'-Plan bleibt bestehen (nicht auf elite herabgestuft).
    expect(res.body.reward_plan_id).toBe('friends');
    const updateCalls = supabaseMock.current.auth.admin.updateUserById.mock.calls;
    const referrerUpdate = updateCalls.find((c) => c[0] === paidReferrer.id);
    expect(referrerUpdate[1].app_metadata.premium_plan_id).toBe('friends');
    expect(referrerUpdate[1].app_metadata.premium_expires_at).toBe(existingExpires);
    // Bonus-Laufzeit schließt an das Abo an: bisherige + 7 Tage.
    const expected = new Date(new Date(existingExpires).getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(new Date(referrerUpdate[1].app_metadata.premium_pass_expires_at).getTime())
      .toBeCloseTo(expected.getTime(), -3);
  });

  it('lässt ein laufendes Basic-Abo unangetastet und hebt per Pass auf Ultimate', async () => {
    const basicExpires = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    const basicReferrer = {
      ...REFERRER,
      app_metadata: { premium_plan_id: 'basic', premium_expires_at: basicExpires },
    };
    await bootApp({ authUser: NEW_USER, referrer: basicReferrer });
    supabaseMock.current.from = vi.fn((table) => {
      if (table === 'user_referral_codes') {
        return createQueryBuilderMock({ data: { user_id: basicReferrer.id }, error: null });
      }
      return createQueryBuilderMock({ data: null, error: null });
    });

    const res = await request(app)
      .post('/api/referrals/redeem')
      .set('Authorization', 'Bearer test-token')
      .send({ code: 'FRIENDS1' });

    expect(res.status).toBe(200);
    expect(res.body.reward_plan_id).toBe('elite');
    const referrerUpdate = supabaseMock.current.auth.admin.updateUserById.mock.calls
      .find((c) => c[0] === basicReferrer.id);
    expect(referrerUpdate[1].app_metadata.premium_plan_id).toBe('basic');
    expect(referrerUpdate[1].app_metadata.premium_expires_at).toBe(basicExpires);
    const passEnd = new Date(referrerUpdate[1].app_metadata.premium_pass_expires_at).getTime();
    expect(passEnd).toBeCloseTo(Date.now() + 7 * 24 * 60 * 60 * 1000, -4);
  });
});
