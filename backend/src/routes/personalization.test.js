import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

let app;
const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

const CATCHES = Array.from({ length: 4 }, () => ({
  species: 'Zander',
  bait_used: 'Gummifisch',
  water_body: 'Rhein',
  catch_time: '2026-05-14T07:30:00.000Z',
  weight_kg: 2.7,
}));

// requireAuth cached den aufgeloesten Nutzer pro Token (60 s) — jeder Aufruf
// braucht deshalb ein eigenes.
let tokenCounter = 0;

function mockWith({ plan = null, settings = {}, fromResults } = {}) {
  supabaseMock.current = createSupabaseMock({
    authUser: {
      id: 'u1',
      email: 'a@b.de',
      app_metadata: plan ? { premium_plan_id: plan, premium_expires_at: FUTURE } : {},
      user_metadata: { settings },
    },
    fromResults: fromResults ?? {
      catches: { data: CATCHES, error: null },
      gear_items: { data: [{ data: { name: 'Spinnrute 2,70 m' } }], error: null },
      fishing_plans: { data: [{ title: 'Rheintour', target_fish: 'Zander', planned_date: FUTURE }], error: null },
    },
  });
  return supabaseMock.current;
}

async function get() {
  tokenCounter += 1;
  return request(app).get('/api/personalization/me').set('Authorization', `Bearer tok-${tokenCounter}`);
}

beforeEach(async () => {
  vi.resetModules();
  ({ default: app } = await import('../server.js'));
});

describe('GET /api/personalization/me', () => {
  it('lehnt Zugriff ohne Token ab (401)', async () => {
    mockWith();
    const res = await request(app).get('/api/personalization/me');
    expect(res.status).toBe(401);
  });

  it('liefert das gespeicherte Profil zurueck', async () => {
    mockWith({
      plan: 'pro',
      settings: {
        fishing: { targetSpecies: ['Zander'], methods: ['Dropshot'] },
        angler: { experience: 'advanced', region: 'nw', noGos: ['kein Nachtangeln'] },
      },
    });

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.profile.targetSpecies).toEqual(['Zander']);
    expect(res.body.profile.experience).toBe('advanced');
    expect(res.body.profile.region).toBe('nw');
    expect(res.body.profile.noGos).toEqual(['kein Nachtangeln']);
  });

  it('leitet Muster aus den echten Faengen ab', async () => {
    mockWith({ plan: 'pro' });

    const res = await get();

    expect(res.body.patterns.enoughData).toBe(true);
    const species = res.body.patterns.patterns.find((p) => p.id === 'top_species');
    expect(species.value).toBe('Zander');
    expect(species.detail).toContain('4 von 4');
  });

  it('laedt fuer ein Konto ohne Plan gar keine Historie', async () => {
    const supabase = mockWith();

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.personalized).toBe(false);
    expect(res.body.patterns.enoughData).toBe(false);
    expect(res.body.gear.total).toBe(0);
    expect(res.body.trips).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalledWith('catches');
  });

  it('zeigt auf Basic keine abgeleiteten Muster — die Stufe deckt keine Historie', async () => {
    mockWith({ plan: 'basic' });

    const res = await get();

    expect(res.body.personalized).toBe(true);
    expect(res.body.patterns.enoughData).toBe(false);
  });

  it('nennt Ausruestung und Touren', async () => {
    mockWith({ plan: 'ultimate' });

    const res = await get();

    expect(res.body.gear.known).toContain('Spinnrute 2,70 m');
    expect(res.body.trips[0]).toMatchObject({ title: 'Rheintour', targetFish: 'Zander' });
  });

  it('meldet eine nicht lesbare Quelle, statt sie als leer auszugeben', async () => {
    mockWith({
      plan: 'pro',
      fromResults: {
        catches: { data: null, error: { message: 'boom' } },
        gear_items: { data: [], error: null },
        fishing_plans: { data: [], error: null },
      },
    });

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.incompleteSources).toContain('catches');
  });
});
