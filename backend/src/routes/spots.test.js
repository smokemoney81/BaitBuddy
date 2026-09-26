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

describe('GET /api/spots/recommended', () => {
  beforeEach(() => {
    supabaseMock.current = createSupabaseMock({
      authUser: { id: 'u1', email: 'a@b.de' },
      fromResults: {
        spots: {
          data: [
            { id: 's1', name: 'Rheinufer' },
            { id: 's2', name: 'Baggersee' },
          ],
          error: null,
        },
        catches: {
          data: [{ water_body: 'Rheinufer', species: 'Zander' }],
          error: null,
        },
        rule_entries: { data: [], error: null },
      },
    });
  });

  it('liefert die Spots des Nutzers mit Score und Breakdown, ohne Jev', async () => {
    const res = await request(app)
      .get('/api/spots/recommended')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.spots).toHaveLength(2);
    expect(res.body.spots[0]).toHaveProperty('score');
    expect(res.body.spots[0]).toHaveProperty('match');
    expect(supabaseMock.current.__builders.spots.eq).toHaveBeenCalledWith('created_by', 'a@b.de');
  });

  it('bevorzugt den Spot mit passenden Faengen der angegebenen Zielfischart', async () => {
    const res = await request(app)
      .get('/api/spots/recommended?species=Zander')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.spots[0].name).toBe('Rheinufer');
  });

  it('lehnt eine halbe Koordinatenangabe ab', async () => {
    const res = await request(app)
      .get('/api/spots/recommended?latitude=53.5')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(400);
  });

  it('verlangt eine Anmeldung', async () => {
    supabaseMock.current = createSupabaseMock({ authUser: null });
    const res = await request(app).get('/api/spots/recommended');
    expect(res.status).toBe(401);
  });

  it('liefert eine leere Liste, wenn der Nutzer keine Spots hat', async () => {
    supabaseMock.current = createSupabaseMock({
      authUser: { id: 'u1', email: 'a@b.de' },
      fromResults: { spots: { data: [], error: null } },
    });
    const res = await request(app)
      .get('/api/spots/recommended')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.spots).toEqual([]);
  });
});

// Datenleck: Die öffentlichen Spot-Endpunkte lieferten ohne Anmeldung auch
// private Spots aller Nutzer samt exakter Koordinaten aus.
describe('Öffentliche Spot-Endpunkte – nur is_public', () => {
  it('GET /api/spots/public filtert auf is_public=true', async () => {
    const res = await request(app).get('/api/spots/public');
    expect(res.status).toBe(200);
    expect(supabaseMock.current.__builders.spots.eq).toHaveBeenCalledWith('is_public', true);
  });

  it('GET /api/fishing/hotspots filtert auf is_public=true', async () => {
    const res = await request(app).get('/api/fishing/hotspots');
    expect(res.status).toBe(200);
    expect(supabaseMock.current.__builders.spots.eq).toHaveBeenCalledWith('is_public', true);
  });
});
