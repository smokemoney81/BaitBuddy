import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const ME = { id: '11111111-1111-1111-1111-111111111111', email: 'me@test.de' };
const CLUB_ID = '22222222-2222-2222-2222-222222222222';
let app;

beforeEach(async () => {
  vi.resetModules();
  ({ default: app } = await import('../server.js'));
});

function mock(fromResults, authUser = ME) {
  supabaseMock.current = createSupabaseMock({ authUser, fromResults });
  return supabaseMock.current;
}

describe('Vereinsprofile', () => {
  it('liefert 404 für ein Verzeichnis-Profil ohne Datenbankeintrag', async () => {
    mock({ fishing_clubs: { data: null, error: null } });
    const res = await request(app).get('/api/clubs/68e9726e8247a0fd4ea4d870');
    expect(res.status).toBe(404);
  });

  it('liefert Profil mit Folgern, Status und Veranstaltungen, ohne Verwalter-Daten', async () => {
    mock({
      fishing_clubs: { data: { id: CLUB_ID, name: 'AV Möhnesee', verified: true }, error: null },
      club_followers: { data: null, count: 12, error: null },
      club_admins: { data: null, count: 1, error: null },
      events: { data: [{ id: 'e1', name: 'Anangeln' }], error: null },
      event_participants: { data: [{ event_id: 'e1' }, { event_id: 'e1' }], error: null },
    });
    const res = await request(app).get(`/api/clubs/${CLUB_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'AV Möhnesee', follower_count: 12, claimed: true, is_following: false, is_admin: false });
    expect(res.body.events[0]).toMatchObject({ id: 'e1', participant_count: 2 });
    expect(JSON.stringify(res.body)).not.toContain('user_id');
  });

  it('verweigert Profiländerungen durch Nicht-Verwalter', async () => {
    mock({ club_admins: { data: null, error: null } });
    const res = await request(app).patch(`/api/clubs/${CLUB_ID}`).set('Authorization', 'Bearer tok').send({ motto: 'x' });
    expect(res.status).toBe(403);
  });

  it('verweigert die Übernahme eines bereits verwalteten Profils', async () => {
    mock({
      fishing_clubs: { data: { id: CLUB_ID, name: 'AV Möhnesee' }, error: null },
      club_admins: { data: null, count: 1, error: null },
    });
    const res = await request(app).post('/api/clubs').set('Authorization', 'Bearer tok')
      .send({ external_ref: '68e9726e8247a0fd4ea4d870', name: 'AV Möhnesee' });
    expect(res.status).toBe(409);
  });

  it('folgt einem Verein per Verzeichnis-Referenz', async () => {
    const supabase = mock({ fishing_clubs: { data: { id: CLUB_ID, name: 'AV Möhnesee' }, error: null } });
    const res = await request(app).post('/api/clubs/68e9726e8247a0fd4ea4d870/follow').set('Authorization', 'Bearer tok')
      .send({ name: 'AV Möhnesee', city: 'Möhnesee' });
    expect(res.status).toBe(200);
    expect(supabase.__builders.club_followers.upsert).toHaveBeenCalledWith({ club_id: CLUB_ID, user_id: ME.id });
  });

  it('nur Vereinsverwalter legen Vereinsveranstaltungen an', async () => {
    mock({ club_admins: { data: null, error: null } });
    const res = await request(app).post('/api/events').set('Authorization', 'Bearer tok')
      .send({ name: 'Anangeln', start_date: '2026-10-01', end_date: '2026-10-02', club_id: CLUB_ID });
    expect(res.status).toBe(403);
  });
});
