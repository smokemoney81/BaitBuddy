import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';
import { verifiedPrimaryEmail } from '../lib/clerkAuth.js';

const { supabaseMock, clerkMock, fetchMock } = vi.hoisted(() => ({
  supabaseMock: { current: null },
  clerkMock: { verifyToken: null, getUser: null },
  fetchMock: { current: null },
}));

vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
  supabaseUrl: 'https://db.test',
  supabaseKey: 'service-key',
}));
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args) => clerkMock.verifyToken(...args),
  createClerkClient: () => ({ users: { getUser: (...args) => clerkMock.getUser(...args) } }),
}));
vi.mock('../lib/fetchWithTimeout.js', () => ({
  fetchWithTimeout: (...args) => fetchMock.current(...args),
}));

const clerkUser = (overrides = {}) => ({
  id: 'user_clerk_1',
  firstName: 'Kai',
  lastName: 'Angler',
  primaryEmailAddressId: 'em_1',
  emailAddresses: [
    { id: 'em_0', emailAddress: 'alt@baitbuddy.test', verification: { status: 'verified' } },
    { id: 'em_1', emailAddress: 'Kai@BaitBuddy.test', verification: { status: 'verified' } },
  ],
  ...overrides,
});

let app;
let admin;

beforeEach(async () => {
  vi.resetModules();
  process.env.CLERK_SECRET_KEY = 'sk_test_123';
  supabaseMock.current = createSupabaseMock();
  admin = {
    createUser: vi.fn(async () => ({ data: { user: { id: 'sb-new' } }, error: null })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    generateLink: vi.fn(async () => ({ data: { properties: { hashed_token: 'hash-1' } }, error: null })),
  };
  supabaseMock.current.auth.admin = admin;
  clerkMock.verifyToken = vi.fn(async () => ({ sub: 'user_clerk_1' }));
  clerkMock.getUser = vi.fn(async () => clerkUser());
  fetchMock.current = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      access_token: 'sb-access',
      refresh_token: 'sb-refresh',
      user: { id: 'sb-1', email: 'kai@baitbuddy.test', user_metadata: { full_name: 'Kai Angler' } },
    }),
  }));
  ({ default: app } = await import('../server.js'));
});

afterEach(() => {
  delete process.env.CLERK_SECRET_KEY;
});

describe('verifiedPrimaryEmail', () => {
  it('nimmt die primäre, bestätigte Adresse (klein geschrieben)', () => {
    expect(verifiedPrimaryEmail(clerkUser())).toBe('kai@baitbuddy.test');
  });

  it('lehnt eine unbestätigte primäre Adresse ab, auch wenn eine andere bestätigt ist', () => {
    const user = clerkUser();
    user.emailAddresses[1].verification.status = 'unverified';
    expect(verifiedPrimaryEmail(user)).toBeNull();
  });

  it('liefert null ohne primäre Adresse', () => {
    expect(verifiedPrimaryEmail(clerkUser({ primaryEmailAddressId: null }))).toBeNull();
  });
});

describe('GET /api/auth/clerk/config', () => {
  it('meldet enabled, wenn CLERK_SECRET_KEY gesetzt ist', async () => {
    const res = await request(app).get('/api/auth/clerk/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true });
  });

  it('meldet disabled ohne Secret', async () => {
    delete process.env.CLERK_SECRET_KEY;
    const res = await request(app).get('/api/auth/clerk/config');
    expect(res.body).toEqual({ enabled: false });
  });
});

describe('POST /api/auth/clerk', () => {
  it('antwortet 503, solange Clerk nicht eingerichtet ist', async () => {
    delete process.env.CLERK_SECRET_KEY;
    const res = await request(app).post('/api/auth/clerk').send({ token: 't' });
    expect(res.status).toBe(503);
    expect(admin.generateLink).not.toHaveBeenCalled();
  });

  it('verlangt ein Token', async () => {
    const res = await request(app).post('/api/auth/clerk').send({});
    expect(res.status).toBe(400);
  });

  it('weist ein ungültiges Clerk-Token mit 401 ab', async () => {
    clerkMock.verifyToken.mockRejectedValue(new Error('bad signature'));
    const res = await request(app).post('/api/auth/clerk').send({ token: 'forged' });
    expect(res.status).toBe(401);
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.generateLink).not.toHaveBeenCalled();
  });

  it('prüft das Token gegen die eigenen Origins (azp)', async () => {
    await request(app).post('/api/auth/clerk').send({ token: 'tok' });
    const [token, options] = clerkMock.verifyToken.mock.calls[0];
    expect(token).toBe('tok');
    expect(options.secretKey).toBe('sk_test_123');
    expect(options.authorizedParties).toContain('https://catchgbt.com');
  });

  it('ordnet eine unbestätigte E-Mail keinem Konto zu (403)', async () => {
    const user = clerkUser();
    user.emailAddresses[1].verification = { status: 'unverified' };
    clerkMock.getUser.mockResolvedValue(user);
    const res = await request(app).post('/api/auth/clerk').send({ token: 'tok' });
    expect(res.status).toBe(403);
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.generateLink).not.toHaveBeenCalled();
  });

  it('meldet bestehende Nutzer ohne neue Trial an', async () => {
    admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'A user with this email address has already been registered' },
    });
    const res = await request(app).post('/api/auth/clerk').send({ token: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: 'sb-access',
      refresh_token: 'sb-refresh',
      user: { id: 'sb-1', email: 'kai@baitbuddy.test', full_name: 'Kai Angler' },
    });
    expect(admin.updateUserById).not.toHaveBeenCalled();
    expect(admin.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'kai@baitbuddy.test' });
    const [url, init] = fetchMock.current.mock.calls[0];
    expect(url).toBe('https://db.test/auth/v1/verify');
    expect(JSON.parse(init.body)).toEqual({ type: 'magiclink', token_hash: 'hash-1' });
  });

  it('legt neue Nutzer bestätigt an und vergibt die Start-Trial', async () => {
    const res = await request(app).post('/api/auth/clerk').send({ token: 'tok' });
    expect(res.status).toBe(200);
    expect(admin.createUser).toHaveBeenCalledWith({
      email: 'kai@baitbuddy.test',
      email_confirm: true,
      user_metadata: { full_name: 'Kai Angler' },
    });
    const [id, attrs] = admin.updateUserById.mock.calls[0];
    expect(id).toBe('sb-new');
    expect(attrs.app_metadata.premium_plan_id).toBe('elite');
    expect(attrs.app_metadata.premium_trial).toBe(true);
  });

  it('gibt einen echten Anlegefehler nicht als Anmeldung weiter', async () => {
    admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'database unavailable' } });
    const res = await request(app).post('/api/auth/clerk').send({ token: 'tok' });
    expect(res.status).toBe(500);
    expect(admin.generateLink).not.toHaveBeenCalled();
  });

  it('antwortet 401, wenn GoTrue den Magic-Link nicht einlöst', async () => {
    fetchMock.current = vi.fn(async () => ({ ok: false, json: async () => ({ msg: 'Token has expired or is invalid' }) }));
    const res = await request(app).post('/api/auth/clerk').send({ token: 'tok' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token has expired or is invalid');
  });

  it('antwortet 502, wenn Clerk nicht erreichbar ist', async () => {
    clerkMock.getUser.mockRejectedValue(new Error('ECONNRESET'));
    const res = await request(app).post('/api/auth/clerk').send({ token: 'tok' });
    expect(res.status).toBe(502);
  });
});
