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

  it('fällt auf manuelles Fallback zurück, wenn RPC nicht existiert', async () => {
    // Wenn die RPC-Funktion nicht existiert (z.B. Migration nicht angewendet),
    // sollte der Endpunkt nicht mit 500 fehlen, sondern Daten manuell aggregieren.
    mockWith({ rpcResults: {} });

    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.statistics).toBeTruthy();
  });

  it('fällt auf manuelles Fallback zurück, wenn RPC einen Fehler meldet', async () => {
    // Wenn die RPC-Funktion explizit einen Fehler zurückgibt
    mockWith({ rpcResults: { get_dashboard_data: { data: null, error: { message: 'Function failed' } } } });

    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });
});

describe('GET /api/dashboard – Fallback-Aggregation', () => {
  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  function mockFallback({ catches, spots, catchesError = null }) {
    supabaseMock.current = createSupabaseMock({
      authUser: { id: 'u1', email: 'a@b.de' },
      adminUsers: [{ id: 'u1', email: 'a@b.de', user_metadata: {}, app_metadata: { premium_plan_id: 'basic', premium_expires_at: new Date(Date.now() + 86400000).toISOString() } }],
      rpcResults: {},
      fromResults: {
        catches: { data: catches, error: catchesError },
        spots: { data: spots, error: null },
        fishing_plans: { data: [], error: null },
      },
    });
  }

  // Fänge tragen spot_id, nicht spot_name. Früher gruppierte die Aggregation
  // nach spot_name bzw. zeigte die rohe UUID — „Top-Spots" blieb leer.
  it('löst Spots über spot_id auf und zählt sie', async () => {
    mockFallback({
      spots: [{ id: 's1', name: 'Elbe', latitude: 53.5, longitude: 9.9, water_type: 'fluss' }],
      catches: [
        { id: 'c1', species: 'Hecht', catch_time: recent, spot_id: 's1', weight_kg: 2 },
        { id: 'c2', species: 'Zander', catch_time: recent, spot_id: 's1', weight_kg: 3 },
        { id: 'c3', species: 'Barsch', catch_time: recent, spot_id: 'fremd', weight_kg: 1 },
      ],
    });

    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    expect(res.body.data.top_spots).toEqual([
      expect.objectContaining({ id: 's1', name: 'Elbe', usage_count: 2, location: '53.5, 9.9' }),
    ]);
    expect(res.body.data.recent_catches.map((c) => c.location)).toEqual(['Elbe', 'Elbe', null]);
    expect(res.body.data.statistics).toEqual(expect.objectContaining({ total_catches: 3, total_weight: 6, personal_best: 3, species_count: 3 }));
  });

  it('meldet Lesefehler als 500 statt ein leeres Dashboard vorzutäuschen', async () => {
    mockFallback({ catches: null, spots: [], catchesError: { message: 'boom' } });
    const res = await request(app).get('/api/dashboard').set('Authorization', 'Bearer tok');
    expect(res.status).toBe(500);
  });
});
