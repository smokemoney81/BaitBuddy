import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

let app;

beforeEach(async () => {
  vi.resetModules();
  ({ default: app } = await import('../server.js'));
});

const DAY = 24 * 60 * 60 * 1000;

function mockWith(fromResults, authUser = { id: 'u1', email: 'a@b.de', created_at: new Date(Date.now() - 45 * DAY).toISOString() }) {
  supabaseMock.current = createSupabaseMock({ authUser, fromResults });
  return supabaseMock.current;
}

describe('GET /api/progress/me', () => {
  it('verlangt eine Anmeldung', async () => {
    mockWith({}, null);
    const res = await request(app).get('/api/progress/me');
    expect(res.status).toBe(401);
  });

  it('berechnet Level, Abzeichen und Event-Belohnungen aus den Nutzerdaten', async () => {
    const supabase = mockWith({
      catches: { data: [{ species: 'Zander', length_cm: 62, photo_url: 'p', catch_time: '2026-09-01T10:00:00Z' }], error: null },
      spots: { data: null, count: 3, error: null },
      fishing_plans: { data: null, count: 2, error: null },
      event_participants: { data: [{ event_id: 'e1', total_points: 340.5, is_winner: true }], error: null },
      events: { data: [{ id: 'e1', name: 'Zander-Cup', prize_description: 'Rute', status: 'ended', end_date: '2026-09-10T00:00:00Z', is_active: true }], error: null },
    });

    const res = await request(app).get('/api/progress/me').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    // 30 + 10 + 3·15 + 2·25 + 100 + 500
    expect(res.body.xp).toBe(735);
    expect(res.body.level).toBe(4);
    expect(res.body.member_since_days).toBe(45);
    expect(res.body.event_rewards).toEqual([
      expect.objectContaining({ event_id: 'e1', name: 'Zander-Cup', prize: 'Rute', points: 341, state: 'won' }),
    ]);
    expect(res.body.badges.find(b => b.id === 'event_winner').unlocked).toBe(true);
    // Nur die eigenen Daten (created_by / user_id = E-Mail).
    expect(supabase.__builders.catches.eq).toHaveBeenCalledWith('created_by', 'a@b.de');
    expect(supabase.__builders.event_participants.eq).toHaveBeenCalledWith('user_id', 'a@b.de');
  });

  it('meldet Datenbankfehler statt eines leeren Fortschritts', async () => {
    mockWith({ catches: { data: null, error: { message: 'boom', code: 'XX000' } } });
    const res = await request(app).get('/api/progress/me').set('Authorization', 'Bearer tok');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
