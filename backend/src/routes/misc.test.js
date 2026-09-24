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
