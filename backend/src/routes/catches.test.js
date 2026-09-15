import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';
import { validateCatchPayload } from './catches.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

let app;

beforeEach(async () => {
  vi.resetModules();
  ({ default: app } = await import('../server.js'));
});

describe('GET /api/catches/stats/summary', () => {
  it('aggregiert total (Count), biggest und die Artenliste', async () => {
    supabaseMock.current = createSupabaseMock({
      authUser: { id: 'u1', email: 'a@b.de' },
      fromResults: {
        catches: {
          data: [
            { species: 'Hecht', length_cm: 80, weight_kg: 4 },
            { species: 'Barsch', length_cm: 20, weight_kg: 0.3 },
          ],
          error: null,
          count: 2,
        },
      },
    });
    const res = await request(app)
      .get('/api/catches/stats/summary')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.species).toContain('Hecht');
    expect(res.body.species).toContain('Barsch');
    expect(res.body.biggest).toBeTruthy();
  });

  it('lehnt Zugriff ohne Token ab (401)', async () => {
    supabaseMock.current = createSupabaseMock({ authUser: null });
    const res = await request(app).get('/api/catches/stats/summary');
    expect(res.status).toBe(401);
  });
});

// Regressionstests zum Fangbuch (Meilenstein 2): `species` ist in der Datenbank
// nullable, `length_cm`/`weight_kg` sind unbeschraenkt. Ohne Pruefung nahm der
// Server Faenge ohne Art und mit negativen oder absurden Massen an; ein
// ungueltiges `catch_time` erzeugte einen 500er statt einer klaren Meldung.
describe('validateCatchPayload', () => {
  it('nimmt einen vollstaendigen Fang an', () => {
    const result = validateCatchPayload({
      species: 'Hecht',
      length_cm: 82,
      weight_kg: 4.5,
      bait_used: 'Gummifisch',
      catch_time: '2026-05-04T08:00:00Z',
      is_released: true,
    });
    expect(result.ok).toBe(true);
    expect(result.value.species).toBe('Hecht');
    expect(result.value.length_cm).toBe(82);
    expect(result.value.catch_time).toBe('2026-05-04T08:00:00.000Z');
    expect(result.value.is_released).toBe(true);
  });

  it('verlangt eine Fischart', () => {
    expect(validateCatchPayload({}).ok).toBe(false);
    expect(validateCatchPayload({ species: '   ' }).ok).toBe(false);
    expect(validateCatchPayload({ species: 42 }).ok).toBe(false);
  });

  it('kuerzt die Fischart nicht still, sondern lehnt zu lange Werte ab', () => {
    expect(validateCatchPayload({ species: 'x'.repeat(121) }).ok).toBe(false);
  });

  it('lehnt negative Masse ab', () => {
    expect(validateCatchPayload({ species: 'Hecht', length_cm: -5 }).ok).toBe(false);
    expect(validateCatchPayload({ species: 'Hecht', weight_kg: -1 }).ok).toBe(false);
  });

  it('lehnt absurde Masse ab', () => {
    expect(validateCatchPayload({ species: 'Hecht', length_cm: 999999 }).ok).toBe(false);
    expect(validateCatchPayload({ species: 'Hecht', weight_kg: 100000 }).ok).toBe(false);
  });

  it('lehnt nicht-numerische Masse ab', () => {
    expect(validateCatchPayload({ species: 'Hecht', length_cm: 'gross' }).ok).toBe(false);
    expect(validateCatchPayload({ species: 'Hecht', weight_kg: true }).ok).toBe(false);
  });

  it('erlaubt fehlende Masse', () => {
    const result = validateCatchPayload({ species: 'Hecht' });
    expect(result.ok).toBe(true);
    expect(result.value.length_cm).toBeNull();
    expect(result.value.weight_kg).toBeNull();
  });

  it('setzt ohne Zeitangabe den aktuellen Zeitpunkt', () => {
    const result = validateCatchPayload({ species: 'Hecht' });
    expect(result.ok).toBe(true);
    expect(Number.isNaN(new Date(result.value.catch_time).getTime())).toBe(false);
  });

  it('lehnt ein ungueltiges catch_time ab, statt es an die Datenbank zu reichen', () => {
    const result = validateCatchPayload({ species: 'Hecht', catch_time: 'gestern' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/catch_time/);
  });

  it('zwingt is_released zu einem Boolean', () => {
    expect(validateCatchPayload({ species: 'Hecht', is_released: 'ja' }).value.is_released).toBe(false);
    expect(validateCatchPayload({ species: 'Hecht' }).value.is_released).toBe(false);
  });

  it('prueft beim Teil-Update nur die mitgesendeten Felder', () => {
    const result = validateCatchPayload({ length_cm: 90 }, { partial: true });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ length_cm: 90 });
    expect(result.value.species).toBeUndefined();
  });

  it('lehnt auch beim Teil-Update ungueltige Werte ab', () => {
    expect(validateCatchPayload({ length_cm: -1 }, { partial: true }).ok).toBe(false);
    expect(validateCatchPayload({ species: '' }, { partial: true }).ok).toBe(false);
  });
});

describe('POST /api/catches – Eingabepruefung', () => {
  const post = (body) => request(app)
    .post('/api/catches')
    .set('Authorization', 'Bearer tok')
    .send(body);

  beforeEach(() => {
    supabaseMock.current = createSupabaseMock({
      authUser: { id: 'u1', email: 'a@b.de' },
      fromResults: { catches: { data: { id: 'c1', species: 'Hecht' }, error: null } },
    });
  });

  it('legt einen gueltigen Fang an', async () => {
    const res = await post({ species: 'Hecht', length_cm: 82 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('c1');
  });

  it('lehnt einen Fang ohne Art ab (400)', async () => {
    const res = await post({ length_cm: 82 });
    expect(res.status).toBe(400);
  });

  it('lehnt eine negative Laenge ab (400)', async () => {
    const res = await post({ species: 'Hecht', length_cm: -10 });
    expect(res.status).toBe(400);
  });

  it('verlangt eine Anmeldung', async () => {
    supabaseMock.current = createSupabaseMock({ authUser: null });
    const res = await request(app).post('/api/catches').send({ species: 'Hecht' });
    expect(res.status).toBe(401);
  });
});
