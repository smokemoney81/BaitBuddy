import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const SUPERUSER = { id: 'su-1', email: 'Kaisaschnitt99@gmail.com', user_metadata: {} };
// In ADMIN_EMAILS (test/setup.js), aber nicht der Superuser.
const ADMIN = { id: 'admin-1', email: 'admin@baitbuddy.test', user_metadata: {} };

const { supabaseMock, sendMail } = vi.hoisted(() => ({
  supabaseMock: { current: null },
  sendMail: vi.fn(async () => ({})),
}));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

let app;

async function boot({ authUser = SUPERUSER, fromResults = {}, adminUsers = [] } = {}) {
  vi.resetModules();
  supabaseMock.current = createSupabaseMock({ authUser, fromResults, adminUsers });
  ({ default: app } = await import('../server.js'));
}

const auth = (req) => req.set('Authorization', 'Bearer token');

beforeEach(() => {
  sendMail.mockClear();
  process.env.SMTP_HOST = 'smtp.test';
  process.env.SMTP_USER = 'support@baitbuddy.test';
  process.env.SMTP_PASSWORD = 'secret';
});

afterEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
});

describe('Zugriff auf /api/superadmin', () => {
  it('lehnt einen normalen Admin ab', async () => {
    await boot({ authUser: ADMIN });
    const res = await auth(request(app).get('/api/superadmin/tickets'));
    expect(res.status).toBe(403);
  });

  it('lehnt anonyme Anfragen ab', async () => {
    await boot({ authUser: null });
    const res = await request(app).get('/api/superadmin/tickets');
    expect(res.status).toBe(401);
  });

  it('lässt den Superuser rein (E-Mail ohne Groß-/Kleinschreibung) und meldet is_superuser', async () => {
    await boot();
    const res = await auth(request(app).get('/api/superadmin/tickets'));
    expect(res.status).toBe(200);
    const me = await auth(request(app).get('/api/auth/me'));
    expect(me.body.is_superuser).toBe(true);
    expect(me.body.is_admin).toBe(true);
  });
});

describe('Statistik', () => {
  const NOW = Date.parse('2026-09-25T10:00:00.000Z');

  it('summarizeUsage zählt Tools, Seiten, App-Sitzungen und aktive Nutzer pro Tag', async () => {
    const { summarizeUsage } = await import('./superAdmin.js');
    const rows = [
      { feature_id: 'ai_buddy', user_id: 'a', status: 'stopped', started_at: '2026-09-24T08:00:00Z', stopped_at: '2026-09-24T08:10:00Z' },
      { feature_id: 'ai_buddy', user_id: 'b', status: 'stopped', started_at: '2026-09-25T08:00:00Z', stopped_at: '2026-09-25T08:05:00Z' },
      // hängengebliebene Sitzung: auf 180 Minuten gedeckelt
      { feature_id: 'map', user_id: 'a', status: 'active', started_at: '2026-09-20T00:00:00Z', last_heartbeat: '2026-09-22T00:00:00Z' },
      { feature_id: 'app_general', user_id: 'c', status: 'active', started_at: '2026-09-25T07:00:00Z', last_heartbeat: '2026-09-25T07:30:00Z' },
      { feature_id: 'page:Weather', user_id: 'a', status: 'view', created_at: '2026-09-25T09:00:00Z' },
      { feature: 'catch_log', user_id: 'b', status: 'stopped', started_at: '2026-09-23T08:00:00Z' },
    ];
    const out = summarizeUsage(rows, { days: 7, now: NOW });
    expect(out.features).toEqual([
      { feature: 'ai_buddy', sessions: 2, users: 2, minutes: 15 },
      { feature: 'map', sessions: 1, users: 1, minutes: 180 },
      { feature: 'catch_log', sessions: 1, users: 1, minutes: 0 },
    ]);
    expect(out.pages).toEqual([{ page: 'Weather', views: 1, users: 1 }]);
    expect(out.app_sessions).toBe(1);
    expect(out.app_minutes).toBe(30);
    expect(out.active_users).toBe(3);
    expect(out.daily).toHaveLength(7);
    expect(out.daily.at(-1)).toEqual({ date: '2026-09-25', users: 3, sessions: 1 });
    expect(out.daily.find(d => d.date === '2026-09-21')).toEqual({ date: '2026-09-21', users: 0, sessions: 0 });
  });

  it('summarizeUsers zählt neue, aktive Nutzer und Tarife', async () => {
    const { summarizeUsers } = await import('./superAdmin.js');
    const users = [
      { created_at: '2026-09-24T00:00:00Z', last_sign_in_at: '2026-09-24T00:00:00Z', app_metadata: {} },
      { created_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-09-01T00:00:00Z', app_metadata: { premium_plan_id: 'basic', premium_expires_at: '2099-01-01T00:00:00Z' } },
      { created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, app_metadata: {} },
    ];
    expect(summarizeUsers(users, { days: 30, now: NOW })).toEqual({
      total: 3, new_7d: 1, new_period: 1, active_7d: 1, active_period: 2, never_signed_in: 1,
      plans: { free: 2, basic: 1 },
    });
  });

  it('GET /api/superadmin/stats liefert Nutzer, Nutzung und Inhalte', async () => {
    await boot({
      adminUsers: [{ id: 'u1', email: 'a@b.test', created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString() }],
      fromResults: {
        usage_sessions: { data: [{ feature_id: 'ai_buddy', user_id: 'u1', status: 'stopped', started_at: new Date().toISOString() }], error: null },
        catches: { data: null, count: 4, error: null },
        spots: { data: null, error: { message: 'relation does not exist' } },
      },
    });
    const res = await auth(request(app).get('/api/superadmin/stats?days=7'));
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    expect(res.body.users.total).toBe(1);
    expect(res.body.usage.features[0]).toMatchObject({ feature: 'ai_buddy', sessions: 1, users: 1 });
    expect(res.body.content.catches_total).toBe(4);
    // Fehler wird nicht zur 0 geschönt
    expect(res.body.content.spots).toBeNull();
  });
});

describe('Community und Events', () => {
  it('löscht einen Beitrag samt Kommentaren und Likes', async () => {
    await boot();
    const res = await auth(request(app).delete('/api/superadmin/community/posts/p1'));
    expect(res.status).toBe(200);
    const b = supabaseMock.current.__builders;
    expect(b.community_comments.delete).toHaveBeenCalled();
    expect(b.post_likes.delete).toHaveBeenCalled();
    expect(b.community_posts.delete).toHaveBeenCalled();
    expect(b.community_posts.eq).toHaveBeenCalledWith('id', 'p1');
  });

  it('löscht Events weich (status deleted, nicht aus der Datenbank)', async () => {
    await boot({ fromResults: { events: { data: { id: 'e1' }, error: null } } });
    const res = await auth(request(app).delete('/api/superadmin/events/e1'));
    expect(res.status).toBe(200);
    const events = supabaseMock.current.__builders.events;
    expect(events.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'deleted', is_active: false }));
    expect(events.delete).not.toHaveBeenCalled();
  });

  it('startet ein Event mit gleicher Laufzeit ab jetzt neu', async () => {
    const original = {
      id: 'e1', name: 'Hecht-Cup', created_by: 'host@baitbuddy.test', visibility: 'public',
      start_date: '2026-01-01T00:00:00.000Z', end_date: '2026-01-08T00:00:00.000Z',
      scoring_method: 'length', status: 'ended', is_active: false,
    };
    await boot({ fromResults: { events: { data: original, error: null } } });
    const res = await auth(request(app).post('/api/superadmin/events/e1/restart'));
    expect(res.status).toBe(201);
    const inserted = supabaseMock.current.__builders.events.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({ name: 'Hecht-Cup', scoring_method: 'length', status: 'active', is_active: true });
    const duration = new Date(inserted.end_date) - new Date(inserted.start_date);
    expect(duration).toBe(7 * 24 * 60 * 60 * 1000);
    expect(Math.abs(new Date(inserted.start_date) - Date.now())).toBeLessThan(5000);
  });
});

describe('Support-Tickets', () => {
  const ticket = { id: 't1', subject: 'Login', user_email: 'angler@baitbuddy.test', user_name: 'Angler', status: 'geloest' };

  it('beantwortet ein Ticket und schickt die Antwort per E-Mail', async () => {
    await boot({ fromResults: { support_tickets: { data: ticket, error: null } } });
    const res = await auth(request(app).patch('/api/superadmin/tickets/t1'))
      .send({ status: 'geloest', admin_response: 'Passwort zurückgesetzt.' });
    expect(res.status).toBe(200);
    expect(res.body.emailed).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'angler@baitbuddy.test' }));
  });

  it('lehnt unbekannte Status ab', async () => {
    await boot();
    const res = await auth(request(app).patch('/api/superadmin/tickets/t1')).send({ status: 'weg' });
    expect(res.status).toBe(400);
  });

  it('löscht ein Ticket', async () => {
    await boot();
    const res = await auth(request(app).delete('/api/superadmin/tickets/t1'));
    expect(res.status).toBe(200);
    expect(supabaseMock.current.__builders.support_tickets.delete).toHaveBeenCalled();
  });
});

describe('POST /api/superadmin/mail/broadcast', () => {
  const users = Array.from({ length: 120 }, (_, i) => ({ id: `u${i}`, email: `angler${i}@baitbuddy.test` }));

  it('verschickt in BCC-Paketen an alle Nutzer', async () => {
    await boot({ adminUsers: [...users, { id: 'dup', email: 'ANGLER0@baitbuddy.test' }, { id: 'x', email: null }] });
    const res = await auth(request(app).post('/api/superadmin/mail/broadcast'))
      .send({ subject: 'Neue Funktion', message: 'Hallo zusammen' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recipients: 120, sent: 120, failed: 0 });
    expect(sendMail).toHaveBeenCalledTimes(3);
    const first = sendMail.mock.calls[0][0];
    expect(first.bcc).toHaveLength(50);
    expect(first.to).not.toContain('angler');
  });

  it('meldet fehlendes SMTP, bevor etwas passiert', async () => {
    delete process.env.SMTP_HOST;
    await boot({ adminUsers: users });
    const res = await auth(request(app).post('/api/superadmin/mail/broadcast'))
      .send({ subject: 'Neue Funktion', message: 'Hallo zusammen' });
    expect(res.status).toBe(503);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('verlangt Betreff und Nachricht', async () => {
    await boot({ adminUsers: users });
    const res = await auth(request(app).post('/api/superadmin/mail/broadcast')).send({ subject: '', message: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events/archive', () => {
  it('liefert archivierte Events statt sie als ID zu deuten', async () => {
    await boot({ authUser: null, fromResults: { events: { data: [{ id: 'old' }], error: null } } });
    const res = await request(app).get('/api/events/archive');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'old' }]);
    const events = supabaseMock.current.__builders.events;
    expect(events.eq).toHaveBeenCalledWith('status', 'ended');
    expect(events.eq).toHaveBeenCalledWith('is_active', false);
    expect(events.eq).toHaveBeenCalledWith('visibility', 'public');
  });
});

describe('Nutzer & Pläne', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const users = () => [
    {
      id: 'u-old', email: 'alt@baitbuddy.test', created_at: '2026-01-01T00:00:00Z',
      last_sign_in_at: '2026-09-01T10:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z',
      user_metadata: { full_name: 'Alte Anglerin' },
      app_metadata: { provider: 'email', providers: ['email'], premium_plan_id: 'basic', premium_expires_at: new Date(Date.now() + 10 * DAY).toISOString(), premium_pass_expires_at: new Date(Date.now() + 3 * DAY).toISOString(), refresh_marker: 'bleibt' },
    },
    {
      id: 'u-new', email: 'neu@baitbuddy.test', created_at: '2026-09-20T00:00:00Z',
      last_sign_in_at: '2026-09-24T08:00:00Z',
      user_metadata: { nickname: 'Hecht99' },
      app_metadata: { provider: 'google', providers: ['google', 'email'] },
    },
    {
      id: 'u-never', email: 'nie@baitbuddy.test', created_at: '2026-09-22T00:00:00Z',
      last_sign_in_at: null, user_metadata: {}, app_metadata: {},
    },
  ];

  it('listet alle Konten, zuletzt angemeldete zuerst, mit tatsächlich geltendem Plan', async () => {
    await boot({ adminUsers: users() });
    const res = await auth(request(app).get('/api/superadmin/users'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.users.map((u) => u.id)).toEqual(['u-new', 'u-old', 'u-never']);

    const old = res.body.users.find((u) => u.id === 'u-old');
    expect(old).toMatchObject({
      full_name: 'Alte Anglerin',
      email_confirmed: true,
      providers: ['email'],
      plan: { id: 'elite', source: 'premium_pass' },
      subscription: { id: 'basic' },
    });
    const fresh = res.body.users.find((u) => u.id === 'u-new');
    expect(fresh).toMatchObject({ full_name: 'Hecht99', providers: ['google', 'email'], plan: { id: 'free' } });
    // Keine rohen Metadaten oder Tokens in der Antwort.
    expect(JSON.stringify(res.body)).not.toContain('refresh_marker');
  });

  it('ist nur für den Superuser erreichbar', async () => {
    await boot({ authUser: ADMIN, adminUsers: users() });
    const list = await auth(request(app).get('/api/superadmin/users'));
    expect(list.status).toBe(403);
    const assign = await auth(request(app).post('/api/superadmin/users/u-new/plan').send({ plan_id: 'elite', duration_days: 30 }));
    expect(assign.status).toBe(403);
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('weist einen Plan zu, behält die übrigen app_metadata und liefert den neuen Stand', async () => {
    await boot({ adminUsers: users() });
    const res = await auth(request(app).post('/api/superadmin/users/u-new/plan').send({ plan_id: 'pro', duration_days: 90 }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, plan_id: 'pro', user: { id: 'u-new', plan: { id: 'pro', source: 'subscription' } } });
    const days = (new Date(res.body.expires_at).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);

    const [id, attrs] = supabaseMock.current.auth.admin.updateUserById.mock.calls[0];
    expect(id).toBe('u-new');
    expect(attrs.app_metadata).toMatchObject({
      provider: 'google',
      providers: ['google', 'email'],
      premium_plan_id: 'pro',
      premium_payment_method: 'admin',
      premium_assigned_by: 'Kaisaschnitt99@gmail.com',
    });
    expect(attrs.user_metadata).toBeUndefined();
  });

  it('entzieht einen Plan mit "free"', async () => {
    await boot({ adminUsers: users() });
    const res = await auth(request(app).post('/api/superadmin/users/u-old/plan').send({ plan_id: 'free' }));
    expect(res.status).toBe(200);
    expect(res.body.expires_at).toBeNull();
    expect(res.body.user.subscription).toMatchObject({ id: 'free', expires_at: null });
  });

  it('prüft Plan, Laufzeit und Zielkonto', async () => {
    await boot({ adminUsers: users() });
    expect((await auth(request(app).post('/api/superadmin/users/u-new/plan').send({ plan_id: 'gold' }))).status).toBe(400);
    expect((await auth(request(app).post('/api/superadmin/users/u-new/plan').send({ plan_id: 'pro', duration_days: 0 }))).status).toBe(400);
    expect((await auth(request(app).post('/api/superadmin/users/u-new/plan').send({ plan_id: 'pro', duration_days: 4000 }))).status).toBe(400);
    expect((await auth(request(app).post('/api/superadmin/users/gibt-es-nicht/plan').send({ plan_id: 'pro' }))).status).toBe(404);
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});

describe('App-Schalter (Werbung, alle Tools kostenlos)', () => {
  const row = (value) => ({ app_config: { data: { value, updated_at: '2026-09-25T10:00:00Z' }, error: null } });

  it('liefert öffentlich die Standardwerte, solange nichts gespeichert ist', async () => {
    await boot({ authUser: null });
    const res = await request(app).get('/api/app/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ads_enabled: true, all_tools_free: false });
  });

  it('fällt bei fehlender Tabelle auf die Standardwerte zurück (nie Werbung aus oder alles gratis)', async () => {
    await boot({ authUser: null, fromResults: { app_config: { data: null, error: { message: 'relation "app_config" does not exist' } } } });
    const res = await request(app).get('/api/app/settings');
    expect(res.body).toEqual({ ads_enabled: true, all_tools_free: false });
  });

  it('liefert gespeicherte Werte aus', async () => {
    await boot({ authUser: null, fromResults: row({ ads_enabled: false, all_tools_free: true }) });
    const res = await request(app).get('/api/app/settings');
    expect(res.body).toEqual({ ads_enabled: false, all_tools_free: true });
    const ads = await request(app).get('/api/ads/config');
    expect(ads.body.ads_enabled).toBe(false);
  });

  it('lässt nur den Superuser umschalten und speichert nur Booleans', async () => {
    await boot({ authUser: ADMIN });
    const denied = await auth(request(app).patch('/api/superadmin/settings').send({ ads_enabled: false }));
    expect(denied.status).toBe(403);

    await boot();
    const bad = await auth(request(app).patch('/api/superadmin/settings').send({ all_tools_free: 'ja' }));
    expect(bad.status).toBe(400);
    const empty = await auth(request(app).patch('/api/superadmin/settings').send({}));
    expect(empty.status).toBe(400);

    const ok = await auth(request(app).patch('/api/superadmin/settings').send({ all_tools_free: true }));
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ads_enabled: true, all_tools_free: true, updated_by: 'Kaisaschnitt99@gmail.com' });
    const upsert = supabaseMock.current.__builders.app_config.upsert;
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'app_settings', value: { ads_enabled: true, all_tools_free: true, updated_by: 'Kaisaschnitt99@gmail.com' } }),
      { onConflict: 'key' },
    );
    // Sofort wirksam, ohne auf den Cache zu warten.
    const pub = await request(app).get('/api/app/settings');
    expect(pub.body.all_tools_free).toBe(true);
  });

  it('meldet 503, wenn nicht gespeichert werden kann', async () => {
    await boot({ fromResults: { app_config: { data: null, error: { message: 'relation "app_config" does not exist' } } } });
    const res = await auth(request(app).patch('/api/superadmin/settings').send({ ads_enabled: false }));
    expect(res.status).toBe(503);
  });
});
