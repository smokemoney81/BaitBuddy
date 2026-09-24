import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const TEST_USER = { id: 'user-1', email: 'angler@baitbuddy.test' };

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
  get supabaseUrl() { return 'https://yejiqenqdzupauddjcyi.supabase.co'; },
}));

let app;

beforeEach(async () => {
  vi.resetModules();
  supabaseMock.current = createSupabaseMock({ authUser: TEST_USER });
  ({ default: app } = await import('../server.js'));
});

describe('POST /api/water/bathymetry (SSRF-Schutz)', () => {
  it('lehnt eine file_url auf einem fremden Host ab', async () => {
    const res = await request(app)
      .post('/api/water/bathymetry')
      .set('Authorization', 'Bearer test-token')
      .send({ file_url: 'https://evil.example.com/internal', water_body_name: 'Test-See' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Supabase-Storage/);
  });

  it('lehnt eine file_url mit http (statt https) ab', async () => {
    const res = await request(app)
      .post('/api/water/bathymetry')
      .set('Authorization', 'Bearer test-token')
      .send({ file_url: 'http://yejiqenqdzupauddjcyi.supabase.co/storage/v1/object/public/x.csv', water_body_name: 'Test-See' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/fishing/plans (Feld-Mapping)', () => {
  it('speichert title/target_fish/steps/is_active statt sie stillschweigend zu verwerfen', async () => {
    const res = await request(app)
      .post('/api/fishing/plans')
      .set('Authorization', 'Bearer test-token')
      .send({ title: 'Hechtangeln am See', target_fish: 'Hecht', spot_info: 'Nordufer', steps: ['a', 'b'], is_active: true });

    expect(res.status).toBe(200);
    const insertCall = supabaseMock.current.__builders.fishing_plans.insert.mock.calls[0][0];
    expect(insertCall).toMatchObject({
      title: 'Hechtangeln am See',
      target_fish: 'Hecht',
      spot_info: 'Nordufer',
      steps: ['a', 'b'],
      is_active: true,
      created_by: TEST_USER.email,
    });
  });
});

describe('DELETE /api/user/account (echte Loeschung)', () => {
  it('loescht den Auth-User wirklich, statt nur ok:true vorzutaeuschen', async () => {
    supabaseMock.current.auth.admin = {
      deleteUser: vi.fn(async () => ({ error: null })),
    };

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(supabaseMock.current.auth.admin.deleteUser).toHaveBeenCalledWith(TEST_USER.id);
  });

  it('liefert 500, wenn der Auth-User nicht geloescht werden kann', async () => {
    supabaseMock.current.auth.admin = {
      deleteUser: vi.fn(async () => ({ error: { message: 'admin api down' } })),
    };

    const res = await request(app)
      .delete('/api/user/account')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('resolveUploadContentType', () => {
  it('lässt die Medientypen der App durch', async () => {
    const { resolveUploadContentType } = await import('./misc.js');
    expect(resolveUploadContentType('image/jpeg')).toBe('image/jpeg');
    expect(resolveUploadContentType('audio/webm;codecs=opus')).toBe('audio/webm;codecs=opus');
    expect(resolveUploadContentType('video/webm')).toBe('video/webm');
  });

  it('legt CSV/GPX als text/plain ab', async () => {
    const { resolveUploadContentType } = await import('./misc.js');
    expect(resolveUploadContentType('application/gpx+xml', 'track.gpx')).toBe('text/plain; charset=utf-8');
    expect(resolveUploadContentType('application/octet-stream', 'tiefen.CSV')).toBe('text/plain; charset=utf-8');
  });

  it('verweigert aktive Inhalte', async () => {
    const { resolveUploadContentType } = await import('./misc.js');
    expect(resolveUploadContentType('text/html', 'x.html')).toBeNull();
    expect(resolveUploadContentType('image/svg+xml', 'x.svg')).toBeNull();
    expect(resolveUploadContentType('application/octet-stream', 'x.html')).toBeNull();
    expect(resolveUploadContentType(undefined, 'x.js')).toBeNull();
  });
});

describe('POST /api/files/upload', () => {
  it('lehnt HTML-Uploads mit 415 ab', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set('Authorization', 'Bearer test-token')
      .send({ file_base64: Buffer.from('<script>alert(1)</script>').toString('base64'), file_name: 'x.html', file_type: 'text/html' });
    expect(res.status).toBe(415);
  });
});

describe('POST /api/trips', () => {
  it('überschreibt keinen Trip eines anderen Nutzers', async () => {
    supabaseMock.current = createSupabaseMock({
      authUser: TEST_USER,
      fromResults: { live_trips: { data: { user_id: 'someone-else' }, error: null } },
    });
    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', 'Bearer test-token')
      .send({ id: 'trip-1', name: 'Fremder Trip' });
    expect(res.status).toBe(409);
    expect(supabaseMock.current.__builders.live_trips.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/water/bathymetric-map', () => {
  const ADMIN = { id: 'admin-1', email: 'admin@baitbuddy.test' };

  it('ist Admins vorbehalten', async () => {
    const res = await request(app)
      .post('/api/water/bathymetric-map')
      .set('Authorization', 'Bearer test-token')
      .send({ water_body_name: 'Wannsee' });
    expect(res.status).toBe(403);
  });

  it('aggregiert öffentliche Uploads zu einer Community-Karte', async () => {
    process.env.ADMIN_EMAILS = ADMIN.email;
    try {
      supabaseMock.current = createSupabaseMock({
        authUser: ADMIN,
        fromResults: {
          bathymetric_maps: {
            data: [
              { id: 'm1', user_id: 'a', name: 'Wannsee', map_data: { is_public: true } },
              { id: 'm2', user_id: 'b', name: 'wannsee', map_data: { is_public: false } },
            ],
            error: null,
          },
          depth_data_points: {
            data: [
              { latitude: 52.4, longitude: 13.1, depth_m: 4, user_id: 'a' },
              { latitude: 52.4001, longitude: 13.1, depth_m: 8, user_id: 'a' },
            ],
            error: null,
          },
        },
      });
      const res = await request(app)
        .post('/api/water/bathymetric-map')
        .set('Authorization', 'Bearer test-token')
        .send({ water_body_name: 'Wannsee' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        kind: 'community', status: 'ready', max_depth: 8, avg_depth: 6, data_points_count: 2, contributors_count: 1,
      }));
      // Nur der öffentliche Upload fließt ein.
      expect(supabaseMock.current.__builders.depth_data_points.in).toHaveBeenCalledWith('map_id', ['m1']);
    } finally {
      delete process.env.ADMIN_EMAILS;
    }
  });
});

describe('Angelvereine aus fishing_clubs', () => {
  const CLUBS = [
    { id: 'c1', name: 'Anglerverein Nah', latitude: 52.52, longitude: 13.40, region: 'Berlin', website: 'https://nah.de' },
    { id: 'c2', name: 'Anglerverein Fern', latitude: 48.14, longitude: 11.58, region: 'München', website: null },
  ];

  // Beide Routen lieferten bisher fest [] — die 148 Vereine aus der
  // Datenbank erschienen nirgends.
  it('GET /api/fishing/clubs liefert die Vereine im Kartenformat', async () => {
    supabaseMock.current = createSupabaseMock({ fromResults: { fishing_clubs: { data: CLUBS, error: null } } });
    const res = await request(app).get('/api/fishing/clubs');
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual(expect.objectContaining({
      id: 'c1', category: 'club', city: 'Berlin', coordinates: { lat: 52.52, lng: 13.40 },
    }));
  });

  it('POST /api/fishing/clubs/nearby sortiert nach Entfernung und begrenzt den Radius', async () => {
    supabaseMock.current = createSupabaseMock({ fromResults: { fishing_clubs: { data: CLUBS, error: null } } });
    const res = await request(app)
      .post('/api/fishing/clubs/nearby')
      .send({ latitude: 52.5, longitude: 13.4, radius_km: 50 });
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.id)).toEqual(['c1']);
    expect(res.body[0].distance_km).toBeLessThan(5);
  });
});
