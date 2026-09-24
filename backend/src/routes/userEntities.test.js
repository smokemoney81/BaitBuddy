import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const ME = { id: 'me', email: 'me@test.de' };

let app;

async function boot({ authUser = ME, fromResults = {} } = {}) {
  vi.resetModules();
  supabaseMock.current = createSupabaseMock({ authUser, fromResults });
  ({ default: app } = await import('../server.js'));
}

beforeEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe('Öffentliche Entities – keine fremden E-Mail-Adressen', () => {
  it('entfernt user_email aus fremden Anzeigen, behält die Kontaktadresse', async () => {
    await boot({
      fromResults: {
        gear_listings: {
          data: [
            { id: 'l1', user_id: 'other', user_email: 'other@test.de', seller_email: 'other@test.de', title: 'Rute' },
            { id: 'l2', user_id: 'me', user_email: 'me@test.de', seller_email: 'me@test.de', title: 'Rolle' },
          ],
          error: null,
        },
      },
    });

    const res = await request(app).get('/api/gear/listings').set('Authorization', 'Bearer tok');

    expect(res.status).toBe(200);
    expect(res.body[0].user_email).toBeUndefined();
    expect(res.body[0].seller_email).toBe('other@test.de');
    expect(res.body[1].user_email).toBe('me@test.de');
  });

  it('setzt seller_email immer auf den angemeldeten Nutzer', async () => {
    await boot({ fromResults: { gear_listings: { data: { id: 'l3' }, error: null } } });

    await request(app)
      .post('/api/gear/listings')
      .set('Authorization', 'Bearer tok')
      .send({ title: 'Kescher', seller_email: 'fremd@test.de' });

    expect(supabaseMock.current.__builders.gear_listings.insert).toHaveBeenCalledWith(
      expect.objectContaining({ seller_email: 'me@test.de', user_id: 'me' }),
    );
  });
});

describe('Funktions-Bewertungen – Auswertung nur für Admins', () => {
  it('schränkt Nicht-Admins auf die eigenen Bewertungen ein', async () => {
    await boot();
    await request(app).get('/api/ratings').set('Authorization', 'Bearer tok');
    expect(supabaseMock.current.__builders.function_ratings.eq).toHaveBeenCalledWith('user_id', 'me');
  });

  it('liefert Admins alle Bewertungen', async () => {
    process.env.ADMIN_EMAILS = 'me@test.de';
    await boot();
    await request(app).get('/api/ratings').set('Authorization', 'Bearer tok');
    expect(supabaseMock.current.__builders.function_ratings.eq).not.toHaveBeenCalledWith('user_id', 'me');
  });
});
