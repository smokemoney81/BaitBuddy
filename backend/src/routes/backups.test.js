import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const TEST_USER = { id: 'user-1', email: 'angler@baitbuddy.test' };

// Bespoke Mock statt des generischen createSupabaseMock-Helfers: der Test
// muss unterscheiden koennen, ob .delete() auf catches/spots/water_scenes
// aufgerufen wurde, BEVOR bzw. NACHDEM das Sicherheits-Backup fehlgeschlagen
// ist — das braucht pro Tabelle eigene, unabhaengig konfigurierbare Mocks.
const { state } = vi.hoisted(() => ({
  state: {
    backupRow: null,
    safetyBackupShouldFail: false,
    deleteCalls: [],
    upsertCalls: [],
  },
}));

function makeTableBuilder(table) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn((rows) => {
      if (table === 'user_backups' && Array.isArray(rows) === false && state.safetyBackupShouldFail) {
        builder.__result = { data: null, error: { message: 'insert fehlgeschlagen' } };
      } else {
        builder.__result = { data: null, error: null, count: Array.isArray(rows) ? rows.length : 1 };
      }
      return builder;
    }),
    upsert: vi.fn((rows, options) => {
      state.upsertCalls.push({ table, rows, options });
      builder.__result = { data: null, error: null, count: rows.length };
      return builder;
    }),
    delete: vi.fn(() => {
      state.deleteCalls.push(table);
      builder.__result = { data: null, error: null };
      return builder;
    }),
    eq: vi.fn(() => builder),
    single: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(
      builder.__result ?? { data: table === 'user_backups' ? state.backupRow : [], error: null }
    ).then(resolve, reject),
  };
  return builder;
}

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: TEST_USER }, error: null })) },
    from: vi.fn((table) => makeTableBuilder(table)),
  },
}));

let app;

beforeEach(async () => {
  vi.resetModules();
  state.backupRow = {
    payload: {
      data: {
        catches: [{ id: 'c1', species: 'Hecht', spot_id: 's1', created_by: 'alt@test.de' }],
        spots: [{ id: 's1', name: 'Elbe' }],
        water_scenes: [],
      },
    },
  };
  state.upsertCalls = [];
  state.safetyBackupShouldFail = false;
  state.deleteCalls = [];
  ({ default: app } = await import('../server.js'));
});

describe('POST /api/backups/:id/restore (mode=replace)', () => {
  it('loescht KEINE Tabellen, wenn das Sicherheits-Backup vorab fehlschlaegt', async () => {
    state.safetyBackupShouldFail = true;

    const res = await request(app)
      .post('/api/backups/backup-1/restore')
      .set('Authorization', 'Bearer test-token')
      .send({ mode: 'replace', tables: ['catches'] });

    expect(res.status).toBe(500);
    expect(state.deleteCalls).toEqual([]);
  });

  it('loescht und stellt wieder her, wenn das Sicherheits-Backup gelingt', async () => {
    state.safetyBackupShouldFail = false;

    const res = await request(app)
      .post('/api/backups/backup-1/restore')
      .set('Authorization', 'Bearer test-token')
      .send({ mode: 'replace', tables: ['catches'] });

    expect(res.status).toBe(200);
    expect(state.deleteCalls).toEqual(['catches']);
    expect(res.body.results.catches.ok).toBe(true);
  });
});

describe('POST /api/backups/:id/restore – IDs und Merge', () => {
  // Früher bekamen wiederhergestellte Zeilen neue IDs: catches.spot_id zeigte
  // danach ins Leere. merge legte zudem vorhandene Zeilen doppelt an.
  it('stellt mit Original-IDs wieder her (Spot-Verweise bleiben gültig)', async () => {
    const res = await request(app)
      .post('/api/backups/backup-1/restore')
      .set('Authorization', 'Bearer test-token')
      .send({ mode: 'replace', tables: ['spots', 'catches'] });

    expect(res.status).toBe(200);
    const byTable = Object.fromEntries(state.upsertCalls.map((c) => [c.table, c]));
    expect(byTable.spots.rows[0].id).toBe('s1');
    expect(byTable.catches.rows[0]).toEqual(expect.objectContaining({ id: 'c1', spot_id: 's1', created_by: TEST_USER.email }));
  });

  it('merge ergänzt nur fehlende Zeilen statt sie zu duplizieren', async () => {
    const res = await request(app)
      .post('/api/backups/backup-1/restore')
      .set('Authorization', 'Bearer test-token')
      .send({ mode: 'merge', tables: ['catches'] });

    expect(res.status).toBe(200);
    expect(state.deleteCalls).toEqual([]);
    expect(state.upsertCalls[0].options).toEqual(expect.objectContaining({ onConflict: 'id', ignoreDuplicates: true }));
  });
});
