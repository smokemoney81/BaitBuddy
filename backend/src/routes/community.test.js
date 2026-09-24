import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const ME = { id: 'u-me', email: 'me@test.de', user_metadata: { nickname: 'Hechtjäger' } };
const OTHER = { id: 'u-other', email: 'max.mustermann@test.de', user_metadata: { full_name: 'Max M.' } };

let app;

async function boot({ authUser = ME, fromResults = {} } = {}) {
  vi.resetModules();
  supabaseMock.current = createSupabaseMock({ authUser, fromResults, adminUsers: [ME, OTHER] });
  ({ default: app } = await import('../server.js'));
}

const noEmails = (body) => expect(JSON.stringify(body)).not.toMatch(/@test\.de/);

describe('POST /api/community/posts', () => {
  beforeEach(() => boot({
    fromResults: { community_posts: { data: { id: 'p1', text: 'Petri!', photo_url: null, created_by: ME.email }, error: null } },
  }));

  // Regression: Die Whitelist nannte title/content/image_url — Spalten, die es
  // nicht gibt. Text und Foto jedes Posts gingen verloren.
  it('speichert Text und Foto', async () => {
    const res = await request(app)
      .post('/api/community/posts')
      .set('Authorization', 'Bearer tok')
      .send({ text: '  Petri!  ', photo_url: 'https://x/y.jpg', likes: 999, reported: true });

    expect(res.status).toBe(200);
    expect(supabaseMock.current.__builders.community_posts.insert).toHaveBeenCalledWith({
      text: 'Petri!', photo_url: 'https://x/y.jpg', likes: 0, reported: false, created_by: ME.email,
    });
    expect(res.body.is_own).toBe(true);
    noEmails(res.body);
  });

  it('lehnt leere Posts ab', async () => {
    const res = await request(app).post('/api/community/posts').set('Authorization', 'Bearer tok').send({ text: '  ' });
    expect(res.status).toBe(400);
  });
});

describe('Community-Listen ohne E-Mail-Adressen', () => {
  it('GET /api/community/posts liefert Autorenprofile statt E-Mails (auch ohne Login)', async () => {
    await boot({
      authUser: null,
      fromResults: {
        community_posts: {
          data: [
            { id: 'p1', text: 'a', created_by: OTHER.email },
            { id: 'p2', text: 'b', created_by: 'geloescht@test.de' },
          ],
          error: null,
        },
      },
    });

    const res = await request(app).get('/api/community/posts');

    expect(res.status).toBe(200);
    noEmails(res.body);
    expect(res.body[0].author).toEqual(expect.objectContaining({ id: OTHER.id, name: 'Max M.' }));
    expect(res.body[0].is_own).toBe(false);
    expect(res.body[1].author.name).toBe('Angler');
  });

  it('markiert eigene Posts', async () => {
    await boot({ fromResults: { community_posts: { data: [{ id: 'p1', text: 'a', created_by: ME.email }], error: null } } });
    const res = await request(app).get('/api/community/posts').set('Authorization', 'Bearer tok');
    expect(res.body[0].is_own).toBe(true);
    expect(res.body[0].author.name).toBe('Hechtjäger');
  });

  it('GET /api/events/:id/leaderboard gibt keine Teilnehmer-E-Mails heraus', async () => {
    await boot({
      fromResults: {
        event_participants: {
          data: [
            { id: 'ep1', user_id: OTHER.email, total_points: 50 },
            { id: 'ep2', user_id: ME.email, total_points: 20 },
          ],
          error: null,
        },
      },
    });
    const res = await request(app).get('/api/events/e1/leaderboard').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    noEmails(res.body);
    expect(res.body.map((r) => r.is_me)).toEqual([false, true]);
    expect(res.body[0].user.name).toBe('Max M.');
  });

  it('GET /api/community/clans liefert Mitglieder als Profile', async () => {
    await boot({
      authUser: null,
      fromResults: {
        clans: { data: [{ id: 'c1', name: 'Raubfisch-Crew', created_by: OTHER.email }], error: null },
        clan_members: { data: [{ clan_id: 'c1', user_id: OTHER.email }], error: null },
        catches: { data: [], error: null },
      },
    });
    const res = await request(app).get('/api/community/clans');
    expect(res.status).toBe(200);
    noEmails(res.body);
    expect(res.body[0].members[0].name).toBe('Max M.');
    expect(res.body[0].owner.name).toBe('Max M.');
  });
});

describe('PATCH /api/community/posts/:id', () => {
  it('erlaubt jedem angemeldeten Nutzer das Melden', async () => {
    await boot({ fromResults: { community_posts: { data: { id: 'p1', reported: true }, error: null } } });
    const res = await request(app)
      .patch('/api/community/posts/p1')
      .set('Authorization', 'Bearer tok')
      .send({ reported: true });
    expect(res.status).toBe(200);
    const builder = supabaseMock.current.__builders.community_posts;
    expect(builder.update).toHaveBeenCalledWith({ reported: true });
    expect(builder.eq).not.toHaveBeenCalledWith('created_by', ME.email);
  });

  it('beschränkt Textänderungen auf den Autor', async () => {
    await boot({ fromResults: { community_posts: { data: { id: 'p1', text: 'neu', created_by: ME.email }, error: null } } });
    await request(app)
      .patch('/api/community/posts/p1')
      .set('Authorization', 'Bearer tok')
      .send({ text: 'neu' });
    expect(supabaseMock.current.__builders.community_posts.eq).toHaveBeenCalledWith('created_by', ME.email);
  });
});

describe('GET /api/community/leaderboard', () => {
  it('aggregiert Fänge über alle Nutzer und liefert Profile', async () => {
    await boot({
      fromResults: {
        catches: {
          data: [
            { created_by: OTHER.email, length_cm: 80 },
            { created_by: OTHER.email, length_cm: 40 },
            { created_by: ME.email, length_cm: 95 },
          ],
          error: null,
        },
      },
    });

    const catchesRes = await request(app).get('/api/community/leaderboard?type=catches').set('Authorization', 'Bearer tok');
    expect(catchesRes.status).toBe(200);
    noEmails(catchesRes.body);
    expect(catchesRes.body.entries.map((e) => [e.user.name, e.value, e.is_me])).toEqual([
      ['Max M.', 2, false],
      ['Hechtjäger', 1, true],
    ]);

    const biggestRes = await request(app).get('/api/community/leaderboard?type=biggest').set('Authorization', 'Bearer tok');
    expect(biggestRes.body.entries.map((e) => e.value)).toEqual([95, 80]);
  });

  it('lehnt unbekannte Typen ab', async () => {
    await boot();
    const res = await request(app).get('/api/community/leaderboard?type=geld');
    expect(res.status).toBe(400);
  });
});
