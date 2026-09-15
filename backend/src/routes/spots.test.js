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
  supabaseMock.current = createSupabaseMock({
    authUser: { id: 'u1', email: 'a@b.de' },
    fromResults: {
      spots: { data: { id: 's1', name: 'Elbe', latitude: 53.55, longitude: 9.99 }, error: null },
    },
  });
});

// Regressionstests zu "Koordinaten-Manipulation verhindern" (Meilenstein 2):
// POST /spots schrieb die Koordinaten frueher voellig ungeprueft in die
// Datenbank.
describe('POST /api/spots – Koordinatenpruefung', () => {
  const post = (body) => request(app)
    .post('/api/spots')
    .set('Authorization', 'Bearer tok')
    .send(body);

  it('legt einen Spot mit gueltigen Koordinaten an', async () => {
    const res = await post({ name: 'Elbe', latitude: 53.55, longitude: 9.99 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('s1');
  });

  it('lehnt eine Breite ausserhalb von -90..90 ab', async () => {
    const res = await post({ name: 'Nirgendwo', latitude: 999, longitude: 9.99 });
    expect(res.status).toBe(400);
  });

  it('lehnt eine Laenge ausserhalb von -180..180 ab', async () => {
    const res = await post({ name: 'Nirgendwo', latitude: 53.55, longitude: 99999 });
    expect(res.status).toBe(400);
  });

  it('lehnt nicht-numerische Koordinaten ab', async () => {
    const res = await post({ name: 'Nirgendwo', latitude: 'abc', longitude: 'def' });
    expect(res.status).toBe(400);
  });

  it('lehnt fehlende Koordinaten ab', async () => {
    const res = await post({ name: 'Ohne Position' });
    expect(res.status).toBe(400);
  });

  it('verlangt weiterhin eine Anmeldung', async () => {
    supabaseMock.current = createSupabaseMock({ authUser: null });
    const res = await request(app)
      .post('/api/spots')
      .send({ name: 'Elbe', latitude: 53.55, longitude: 9.99 });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/spots/:id – Koordinatenpruefung', () => {
  const patch = (body) => request(app)
    .patch('/api/spots/s1')
    .set('Authorization', 'Bearer tok')
    .send(body);

  it('erlaubt Teil-Updates ohne Koordinaten', async () => {
    const res = await patch({ name: 'Neuer Name' });
    expect(res.status).toBe(200);
  });

  it('lehnt ein Update mit ungueltiger Position ab', async () => {
    const res = await patch({ latitude: 999, longitude: 9.99 });
    expect(res.status).toBe(400);
  });

  it('lehnt eine halbe Position ab', async () => {
    const res = await patch({ latitude: 53.55 });
    expect(res.status).toBe(400);
  });
});
