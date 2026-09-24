import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { current: null } }));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));

const FREE_USER = { id: 'u-free', email: 'free@baitbuddy.test', user_metadata: {}, app_metadata: {} };

let app;

beforeEach(async () => {
  vi.resetModules();
  supabaseMock.current = createSupabaseMock({ authUser: FREE_USER, adminUsers: [{ ...FREE_USER }] });
  ({ default: app } = await import('../server.js'));
});

describe('POST /api/ads/reward/complete', () => {
  // Der Analytics-Insert hing früher mit .catch() am Query-Builder. Den gibt es
  // dort nicht — die Route warf NACH dem Speichern der Belohnung und lieferte 500.
  it('bestätigt eine gespeicherte Belohnung mit 200', async () => {
    const res = await request(app)
      .post('/api/ads/reward/complete')
      .set('Authorization', 'Bearer tok')
      .send({ reward_type: 'ki_analyse' });

    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(true);
    expect(supabaseMock.current.__adminUsers[0].user_metadata.rewarded_ki_analyse_count).toBe(1);
  });

  it('lehnt unbekannte Reward-Typen ab', async () => {
    const res = await request(app)
      .post('/api/ads/reward/complete')
      .set('Authorization', 'Bearer tok')
      .send({ reward_type: 'gratis_ultimate' });
    expect(res.status).toBe(400);
  });
});
