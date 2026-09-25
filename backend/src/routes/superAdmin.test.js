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

describe('GET /api/superadmin/stats/tools', () => {
  it('zählt nur Seitenaufrufe und sortiert nach Häufigkeit', async () => {
    await boot({
      fromResults: {
        usage_sessions: {
          data: [
            { feature_id: 'page:KiBuddyBeta', user_id: 'a' },
            { feature_id: 'page:KiBuddyBeta', user_id: 'b' },
            { feature_id: 'page:KiBuddyBeta', user_id: 'a' },
            { feature_id: 'page:Weather', user_id: 'a' },
            { feature_id: 'ai_buddy', user_id: 'a' },
          ],
          error: null,
        },
      },
    });
    const res = await auth(request(app).get('/api/superadmin/stats/tools?days=7'));
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    expect(res.body.total_views).toBe(4);
    expect(res.body.pages).toEqual([
      { page: 'KiBuddyBeta', views: 3, users: 2 },
      { page: 'Weather', views: 1, users: 1 },
    ]);
    const builder = supabaseMock.current.__builders.usage_sessions;
    expect(builder.eq).toHaveBeenCalledWith('status', 'view');
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
