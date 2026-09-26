import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

// GET /events Sichtbarkeit + POST /events visibility-Gate.
// Deckt die Regression ab: früher baute die Route ungültiges Roh-SQL in .or()
// (SELECT-Subqueries) und verglich created_by (E-Mail) gegen UUIDs — dadurch
// war die Events-Liste für eingeloggte Nutzer kaputt. Hier wird geprüft, dass
// die Route 200 liefert und der .or()-Ausdruck gültige PostgREST-Syntax hat.

const ME = { id: 'me-uuid', email: 'me@test.de', user_metadata: {} };

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

let app;

async function buildApp() {
  vi.resetModules();
  ({ default: app } = await import('../server.js'));
}

beforeEach(() => {
  supabaseMock.current = null;
});

describe('GET /api/events — Sichtbarkeit', () => {
  it('ausgeloggt: filtert auf visibility=public, kein .or()', async () => {
    supabaseMock.current = createSupabaseMock({
      authUser: null,
      fromResults: { events: { data: [{ id: 'e1', visibility: 'public', name: 'Public Cup' }], error: null } },
    });
    await buildApp();

    const res = await request(app).get('/api/events');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const eventsBuilder = supabaseMock.current.__builders.events;
    expect(eventsBuilder.eq).toHaveBeenCalledWith('visibility', 'public');
    expect(eventsBuilder.or).not.toHaveBeenCalled();
  });

  it('eingeloggt: baut gueltigen .or()-Ausdruck (kein SELECT), inkl. eigener + Freundes-E-Mail', async () => {
    supabaseMock.current = createSupabaseMock({
      authUser: ME,
      fromResults: {
        events: { data: [{ id: 'e1', visibility: 'public' }], error: null },
        referrals: { data: [{ referred_user_id: 'friend-uuid' }], error: null },
      },
    });
    supabaseMock.current.auth.admin = {
      getUserById: vi.fn(async () => ({ data: { user: { email: 'friend@test.de' } }, error: null })),
    };
    await buildApp();

    const res = await request(app).get('/api/events').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    const orArg = supabaseMock.current.__builders.events.or.mock.calls[0][0];
    expect(orArg).toContain('visibility.eq.public');
    expect(orArg).toContain('and(visibility.eq.friends,created_by.in.(');
    expect(orArg).toContain('"me@test.de"');
    expect(orArg).toContain('"friend@test.de"');
    // Kein Roh-SQL: PostgREST .or() kennt keine Subqueries.
    expect(orArg.toUpperCase()).not.toContain('SELECT');
  });

  it('eingeloggt ohne Freunde: .or() enthaelt nur die eigene E-Mail', async () => {
    supabaseMock.current = createSupabaseMock({
      authUser: ME,
      fromResults: {
        events: { data: [], error: null },
        referrals: { data: [], error: null },
      },
    });
    supabaseMock.current.auth.admin = { getUserById: vi.fn() };
    await buildApp();

    const res = await request(app).get('/api/events').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    const orArg = supabaseMock.current.__builders.events.or.mock.calls[0][0];
    expect(orArg).toContain('"me@test.de"');
    // Keine Freundes-E-Mail in der in-Liste (der Ausdruck enthält zwar
    // "visibility.eq.friends", aber keine zusätzliche eingequotete Adresse).
    expect(orArg).toBe('visibility.eq.public,and(visibility.eq.friends,created_by.in.("me@test.de"))');
    expect(supabaseMock.current.auth.admin.getUserById).not.toHaveBeenCalled();
  });
});

describe('POST /api/events — visibility-Gate', () => {
  async function postAppFor(user) {
    supabaseMock.current = createSupabaseMock({
      authUser: user,
      fromResults: {
        events: { data: { id: 'e-new' }, error: null },
        event_templates: { data: null, error: null },
      },
    });
    await buildApp();
  }

  const body = { name: 'Cup', start_date: '2026-08-01', end_date: '2026-08-10', visibility: 'friends' };

  it('Free-User: friends-Sichtbarkeit faellt still auf public zurueck', async () => {
    await postAppFor({ ...ME, user_metadata: {} });

    const res = await request(app).post('/api/events').set('Authorization', 'Bearer tok').send(body);

    expect(res.status).toBe(201);
    const inserted = supabaseMock.current.__builders.events.insert.mock.calls[0][0];
    expect(inserted.visibility).toBe('public');
  });

  it('Friends-Plan: friends-Sichtbarkeit wird uebernommen', async () => {
    const future = new Date(Date.now() + 300 * 24 * 3600 * 1000).toISOString();
    await postAppFor({ ...ME, app_metadata: { premium_plan_id: 'friends', premium_expires_at: future } });

    const res = await request(app).post('/api/events').set('Authorization', 'Bearer tok').send(body);

    expect(res.status).toBe(201);
    const inserted = supabaseMock.current.__builders.events.insert.mock.calls[0][0];
    expect(inserted.visibility).toBe('friends');
  });
});

describe('POST /api/events/:id/invite', () => {
  const invite = (emails) => request(app)
    .post('/api/events/e1/invite')
    .set('Authorization', 'Bearer tok')
    .send({ invitee_emails: emails });

  function mockWith({ participant = { id: 'p1' }, event = { id: 'e1', is_active: true } } = {}) {
    supabaseMock.current = createSupabaseMock({
      authUser: ME,
      fromResults: {
        events: { data: event, error: null },
        event_participants: { data: participant, error: null },
        event_invitations: { data: { id: 'inv1', invitee_id: 'freund@test.de' }, error: null },
      },
    });
  }

  // Regression: Die Route hängte .catch() an den Supabase-Query-Builder, der
  // nur thenable ist — jeder Aufruf warf einen TypeError und endete mit 500.
  it('legt Einladungen an und liefert 201', async () => {
    mockWith();
    await buildApp();
    const res = await invite(['Freund@Test.de', 'freund@test.de']);
    expect(res.status).toBe(201);
    expect(res.body.invitations).toHaveLength(1);
    expect(supabaseMock.current.__builders.event_invitations.insert).toHaveBeenCalledTimes(1);
    expect(supabaseMock.current.__builders.event_invitations.insert).toHaveBeenCalledWith(
      expect.objectContaining({ invitee_id: 'freund@test.de', inviter_id: ME.email }),
    );
  });

  it('verweigert Einladungen von Nicht-Teilnehmern', async () => {
    mockWith({ participant: null });
    await buildApp();
    const res = await invite(['freund@test.de']);
    expect(res.status).toBe(403);
  });

  it('lehnt ungültige Adressen ab', async () => {
    mockWith();
    await buildApp();
    const res = await invite(['kein-mail', 42]);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/events/:id/submit', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  const submit = (body) => request(app)
    .post('/api/events/e1/submit')
    .set('Authorization', 'Bearer tok')
    .send(body);

  function mockEvent(event) {
    supabaseMock.current = createSupabaseMock({
      authUser: ME,
      fromResults: {
        events: { data: event, error: null },
        event_submissions: { data: [{ id: 'sub1', calculated_points: 100 }], error: null },
        event_point_configs: { data: null, error: null },
        event_participants: { data: [], error: null },
      },
    });
  }

  it('lehnt Einreichungen für beendete Events ab', async () => {
    mockEvent({ id: 'e1', status: 'ended', is_active: true, start_date: past, end_date: past });
    await buildApp();
    const res = await submit({ species: 'Hecht', length_cm: 80 });
    expect(res.status).toBe(409);
  });

  it('lehnt unplausible Längen ab', async () => {
    mockEvent({ id: 'e1', status: 'active', is_active: true, start_date: past, end_date: future });
    await buildApp();
    const res = await submit({ species: 'Hecht', length_cm: 999999 });
    expect(res.status).toBe(400);
  });

  it('nimmt gültige Einreichungen in laufenden Events an', async () => {
    mockEvent({ id: 'e1', status: 'active', is_active: true, start_date: past, end_date: future });
    await buildApp();
    const res = await submit({ species: 'Hecht', length_cm: 80 });
    expect(res.status).toBe(201);
  });
});

describe('Wettbewerb: Plausibilität, Rangliste, Prüfung, Einspruch', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  const running = { id: 'e1', status: 'active', is_active: true, start_date: past, end_date: future, target_species: 'Zander, Hecht', created_by: 'boss@test.de' };

  function mock(fromResults, authUser = ME) {
    supabaseMock.current = createSupabaseMock({ authUser, fromResults });
    return supabaseMock.current;
  }

  it('lehnt eine nicht gewertete Art mit 422 und den Prüfergebnissen ab', async () => {
    mock({ events: { data: running, error: null }, event_submissions: { data: [], error: null } });
    await buildApp();
    const res = await request(app).post('/api/events/e1/submit').set('Authorization', 'Bearer tok')
      .send({ species: 'Karpfen', length_cm: 60, photo_url: 'https://x/p.jpg' });
    expect(res.status).toBe(422);
    expect(res.body.checks.find(c => c.id === 'species').ok).toBe(false);
  });

  it('nimmt einen Fang ohne Foto an, schickt ihn aber in die Prüfung', async () => {
    const supabase = mock({
      events: { data: running, error: null },
      event_submissions: { data: [], error: null },
      event_point_configs: { data: null, error: null },
      event_participants: { data: [], error: null },
    });
    await buildApp();
    const res = await request(app).post('/api/events/e1/submit').set('Authorization', 'Bearer tok')
      .send({ species: 'Zander', length_cm: 62 });
    expect(res.status).toBe(201);
    const inserted = supabase.__builders.event_submissions.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({ review_status: 'pending', verified: false });
  });

  it('Rangliste: nur bestätigte Fänge, Anzeigenamen statt E-Mails', async () => {
    const supabase = mock({
      event_submissions: { data: [
        { id: 's1', user_id: 'tom@x.de', species: 'Zander', length_cm: 70, calculated_points: 400 },
        { id: 's2', user_id: 'tom@x.de', species: 'Hecht', length_cm: 80, calculated_points: 450 },
        { id: 's3', user_id: 'me@test.de', species: 'Zander', length_cm: 90, calculated_points: 500 },
        { id: 's4', user_id: 'me@test.de', species: '[ai_chat_interaction]', length_cm: null, calculated_points: 10 },
      ], error: null },
      users: { data: [{ email: 'tom@x.de', full_name: 'Tom Schmidt' }], error: null },
    });
    await buildApp();
    const res = await request(app).get('/api/events/e1/standings?metric=total_length').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(supabase.__builders.event_submissions.eq).toHaveBeenCalledWith('review_status', 'confirmed');
    expect(res.body.entries.map(e => [e.rank, e.name, e.total_length, e.count, e.is_me])).toEqual([
      [1, 'Tom S.', 150, 2, false],
      [2, 'Angler', 90, 1, true],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('Teilnehmerliste enthält keine E-Mail-Adressen', async () => {
    mock({ event_participants: { data: [{ id: 'p1', user_id: 'me@test.de', total_points: 10 }], error: null }, users: { data: [], error: null } });
    await buildApp();
    const res = await request(app).get('/api/events/e1/participants');
    expect(res.body[0]).toMatchObject({ id: 'p1', name: 'Angler', is_me: false });
    expect(res.body[0]).not.toHaveProperty('user_id');
  });

  it('nur der Veranstalter darf Einreichungen prüfen', async () => {
    mock({ events: { data: running, error: null } });
    await buildApp();
    const res = await request(app).post('/api/events/e1/submissions/s1/review').set('Authorization', 'Bearer tok').send({ decision: 'confirm' });
    expect(res.status).toBe(403);
  });

  it('kein Einspruch gegen den eigenen Fang', async () => {
    mock({
      event_submissions: { data: { id: 's3', user_id: 'me@test.de', species: 'Zander', review_status: 'confirmed' }, error: null },
      event_participants: { data: { id: 'p1' }, error: null },
    });
    await buildApp();
    const res = await request(app).post('/api/events/e1/submissions/s3/dispute').set('Authorization', 'Bearer tok')
      .send({ reason: 'Das Maßband ist nicht zu sehen.' });
    expect(res.status).toBe(400);
  });

  it('legt einen begründeten Einspruch an', async () => {
    const supabase = mock({
      event_submissions: { data: { id: 's1', user_id: 'tom@x.de', species: 'Zander', review_status: 'confirmed' }, error: null },
      event_participants: { data: { id: 'p1' }, error: null },
      event_disputes: { data: { id: 'd1', status: 'open' }, error: null },
    });
    await buildApp();
    const res = await request(app).post('/api/events/e1/submissions/s1/dispute').set('Authorization', 'Bearer tok')
      .send({ reason: 'Das Maßband ist auf dem Foto nicht zu sehen.' });
    expect(res.status).toBe(201);
    expect(supabase.__builders.event_disputes.insert).toHaveBeenCalledWith(expect.objectContaining({ submission_id: 's1', reporter: 'me@test.de' }));
  });

  it('sperrt Regeländerungen nach dem Start', async () => {
    mock({ events: { data: { ...running, created_by: 'me@test.de', scoring_method: 'points' }, error: null } });
    await buildApp();
    const res = await request(app).patch('/api/events/e1').set('Authorization', 'Bearer tok').send({ scoring_method: 'length' });
    expect(res.status).toBe(409);
  });

  describe('Prüf-Warteschlange (Jev-Priorisierung, standardmäßig ohne Jev)', () => {
    it('sortiert nach deterministischer Priorität statt chronologisch', async () => {
      mock({
        events: { data: { ...running, created_by: 'me@test.de' }, error: null },
        event_submissions: {
          data: [
            { id: 's_low', user_id: 'a@x.de', species: 'Hecht', plausibility: [] },
            {
              id: 's_high', user_id: 'b@x.de', species: 'Zander',
              plausibility: [
                { id: 'length', ok: false, severity: 'review' },
                { id: 'photo', ok: false, severity: 'review' },
              ],
            },
          ],
          error: null,
        },
        event_disputes: { data: [], error: null },
      });
      await buildApp();
      const res = await request(app).get('/api/events/e1/review').set('Authorization', 'Bearer tok');
      expect(res.status).toBe(200);
      expect(res.body.pending.map((p) => p.id)).toEqual(['s_high', 's_low']);
      expect(res.body.pending[0].review_priority).toBe('high');
      expect(res.body.pending[1].review_priority).toBe('low');
    });
  });
});
