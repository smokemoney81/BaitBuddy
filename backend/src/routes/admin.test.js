import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const ADMIN = { id: 'admin-1', email: 'admin@baitbuddy.test', user_metadata: {} };
const NORMAL = { id: 'user-9', email: 'angler@baitbuddy.test', user_metadata: {} };

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

let app;

function makeUsers(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `u-${i}`,
    email: `angler${i}@baitbuddy.test`,
    created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    user_metadata: { full_name: `Angler ${i}`, ...overrides },
    app_metadata: { ...overrides },
  }));
}

async function boot({ authUser = ADMIN, adminUsers = [] } = {}) {
  vi.resetModules();
  supabaseMock.current = createSupabaseMock({ authUser, adminUsers });
  ({ default: app } = await import('../server.js'));
}

beforeEach(async () => {
  await boot();
});

describe('GET /api/admin/premium/check-expiry', () => {
  it('laeuft durch und setzt abgelaufene Plaene zurueck', async () => {
    // Frueher: `const { data: users } = await listUsers()` + `for (const u of users)`
    // -> "users is not iterable" -> der Cron endete bei jedem Lauf im 500er.
    const expired = {
      id: 'u-expired',
      email: 'abgelaufen@baitbuddy.test',
      user_metadata: {},
      app_metadata: {
        premium_plan_id: 'elite',
        premium_expires_at: '2020-01-01T00:00:00.000Z',
      },
    };
    const active = {
      id: 'u-active',
      email: 'aktiv@baitbuddy.test',
      user_metadata: {},
      app_metadata: {
        premium_plan_id: 'basic',
        premium_expires_at: '2099-01-01T00:00:00.000Z',
      },
    };
    await boot({ adminUsers: [expired, active] });

    const res = await request(app)
      .get('/api/admin/premium/check-expiry')
      .set('x-cron-secret', process.env.CRON_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.checked).toBe(2);
    expect(res.body.expired).toBe(1);
    expect(expired.app_metadata.premium_plan_id).toBeNull();
    expect(active.app_metadata.premium_plan_id).toBe('basic');
  });

  it('prueft auch Konten jenseits der ersten Seite', async () => {
    // listUsers ist seitenweise — ohne Paginierung blieben alle weiteren
    // Konten ungeprueft.
    const users = makeUsers(450, {
      premium_plan_id: 'elite',
      premium_expires_at: '2020-01-01T00:00:00.000Z',
    });
    await boot({ adminUsers: users });

    const res = await request(app)
      .get('/api/admin/premium/check-expiry')
      .set('x-cron-secret', process.env.CRON_SECRET);

    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(450);
    expect(res.body.expired).toBe(450);
  });

  it('akzeptiert das Cron-Secret auch als Authorization: Bearer', async () => {
    // Vercel-Crons, der Docker-Cron und der Cloudflare-Cron-Worker senden das
    // Secret als Bearer-Header — frueher lief check-expiry dadurch in 401.
    await boot({ adminUsers: [] });
    const res = await request(app)
      .get('/api/admin/premium/check-expiry')
      .set('Authorization', `Bearer ${process.env.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('lehnt Aufrufe ohne Cron-Secret ab', async () => {
    const res = await request(app).get('/api/admin/premium/check-expiry');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/plans/assign', () => {
  const target = () => ({
    id: 'u-target',
    email: 'ziel@baitbuddy.test',
    user_metadata: { full_name: 'Ziel Person', settings: { theme: 'dark' } },
  });

  it('weist einem Nutzer einen Plan mit Laufzeit zu', async () => {
    const user = target();
    await boot({ adminUsers: [user] });

    const res = await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ target_user_id: 'u-target', plan_id: 'elite', duration_days: 14 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.plan_id).toBe('elite');
    expect(res.body.user_email).toBe('ziel@baitbuddy.test');

    expect(user.app_metadata.premium_plan_id).toBe('elite');
    expect(user.app_metadata.premium_payment_method).toBe('admin');
    expect(user.app_metadata.premium_assigned_by).toBe(ADMIN.email);

    const days = (new Date(user.app_metadata.premium_expires_at) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it('behaelt die uebrigen Metadaten des Nutzers', async () => {
    // updateUserById ersetzt user_metadata komplett — ohne Merge waeren
    // Profil und Einstellungen des Nutzers weg.
    const user = target();
    await boot({ adminUsers: [user] });

    await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ target_user_id: 'u-target', plan_id: 'basic' });

    expect(user.user_metadata.full_name).toBe('Ziel Person');
    expect(user.user_metadata.settings).toEqual({ theme: 'dark' });
  });

  it('entzieht den Plan bei plan_id=free', async () => {
    const user = target();
    user.app_metadata = {
      premium_plan_id: 'elite',
      premium_expires_at: '2099-01-01T00:00:00.000Z',
    };
    await boot({ adminUsers: [user] });

    const res = await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ target_user_id: 'u-target', plan_id: 'free' });

    expect(res.status).toBe(200);
    expect(user.app_metadata.premium_plan_id).toBe('free');
    expect(user.app_metadata.premium_expires_at).toBeNull();
  });

  it('lehnt unbekannte Plaene und unsinnige Laufzeiten ab (400)', async () => {
    await boot({ adminUsers: [target()] });

    const badPlan = await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ target_user_id: 'u-target', plan_id: 'goldrand' });
    expect(badPlan.status).toBe(400);

    const badDuration = await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ target_user_id: 'u-target', plan_id: 'basic', duration_days: 0 });
    expect(badDuration.status).toBe(400);

    const missingTarget = await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'basic' });
    expect(missingTarget.status).toBe(400);
  });

  it('liefert 404 fuer einen unbekannten Nutzer', async () => {
    const res = await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ target_user_id: 'gibt-es-nicht', plan_id: 'basic' });

    expect(res.status).toBe(404);
  });

  it('sperrt Nicht-Admins aus (403) und Anonyme (401)', async () => {
    await boot({ authUser: NORMAL, adminUsers: [target()] });
    const forbidden = await request(app)
      .post('/api/admin/plans/assign')
      .set('Authorization', 'Bearer test-token')
      .send({ target_user_id: 'u-target', plan_id: 'elite' });
    expect(forbidden.status).toBe(403);

    await boot({ authUser: null });
    const unauthorized = await request(app)
      .post('/api/admin/plans/assign')
      .send({ target_user_id: 'u-target', plan_id: 'elite' });
    expect(unauthorized.status).toBe(401);
  });
});

describe('GET /api/admin/users', () => {
  it('liefert die echten Konten statt einer leeren Liste', async () => {
    await boot({ adminUsers: makeUsers(3) });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toMatchObject({
      email: expect.stringContaining('@baitbuddy.test'),
      premium_plan_id: 'free',
    });
    // Keine Rohdaten des Auth-Users nach aussen geben.
    expect(res.body[0].user_metadata).toBeUndefined();
    expect(res.body[0].identities).toBeUndefined();
  });

  it('filtert ueber ?search auf E-Mail und Name', async () => {
    await boot({ adminUsers: makeUsers(12) });

    const res = await request(app)
      .get('/api/admin/users?search=angler7')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe('angler7@baitbuddy.test');
  });

  it('sperrt Nicht-Admins aus (403)', async () => {
    await boot({ authUser: NORMAL, adminUsers: makeUsers(2) });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
  });
});

describe('GET /api/auth/me', () => {
  it('markiert Admins per is_admin', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.is_admin).toBe(true);
  });

  it('markiert normale Nutzer nicht als Admin', async () => {
    await boot({ authUser: NORMAL });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer test-token');

    expect(res.body.is_admin).toBe(false);
  });

  it('laesst sich nicht ueber user_metadata faelschen', async () => {
    await boot({
      authUser: { ...NORMAL, user_metadata: { is_admin: true, role: 'admin' } },
    });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer test-token');

    expect(res.body.is_admin).toBe(false);
  });
});
