import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

let app;

const AGGREGATE = {
  next_trip: null,
  recent_catches: [],
  top_spots: [],
  weather: null,
  buddy_suggestion: null,
  statistics: {
    total_catches: 9,
    total_weight: 26,
    personal_best: 5,
    species_count: 5,
    weeks_active: 5,
  },
  timestamp: '2026-09-16T09:00:00.000Z',
};

function mockWith({ authUser = { id: 'u1', email: 'a@b.de' }, rpcResults } = {}) {
  supabaseMock.current = createSupabaseMock({
    authUser,
    adminUsers: authUser ? [{ ...authUser, user_metadata: {} }] : [],
    rpcResults,
  });
  return supabaseMock.current;
}

beforeEach(async () => {
  vi.resetModules();
  ({ default: app } = await import('../server.js'));
});

describe('GET /api/dashboard', () => {
  it('lehnt Zugriff ohne Token ab (401)', async () => {
    mockWith({ authUser: null });
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });

  it('ruft die Aggregation mit der E-Mail auf, nicht mit der User-ID', async () => {
    // Die App führt Nutzerdaten über `created_by = <E-Mail>`; `user_id` ist in
    // catches/spots/fishing_plans nicht befüllt. Ein Aufruf mit der ID lieferte
    // deshalb für jeden Nutzer ein leeres Dashboard.
    const supabase = mockWith({ rpcResults: { get_dashboard_data: { data: AGGREGATE, error: null } } });

    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_data', { user_email_param: 'a@b.de' });
  });

  it('liefert die Kennzahlen des Nutzers durch', async () => {
    mockWith({ rpcResults: { get_dashboard_data: { data: AGGREGATE, error: null } } });

    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');

    expect(res.body.data.statistics.total_catches).toBe(9);
    expect(res.body.data.recent_catches).toEqual([]);
    expect(res.body.metadata.plan).toBeTruthy();
  });

  it('meldet einen Fehler der Aggregation als 500, statt leere Daten vorzutäuschen', async () => {
    mockWith({ rpcResults: { get_dashboard_data: { data: null, error: { message: 'boom' } } } });

    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('meldet eine fehlende Datenbankfunktion als 500', async () => {
    // Genau dieser Fall lag in Produktion vor: die Migration war nie angewendet.
    mockWith({ rpcResults: {} });

    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(500);
  });
});
