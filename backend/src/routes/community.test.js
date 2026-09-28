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
      community_comments: { data: [{ id: 'c1', post_id: 'p1', text: 'Hallo', created_by: 'a@b.de' }], error: null },
    },
  });
});

// Regressionstests zum Community-Kommentar-Bug: Kommentare wurden platt
// plattformweit (ohne post_id-Filter) mit hartem limit=500 und aufsteigender
// Sortierung geholt — sobald es insgesamt mehr als 500 Kommentare gab, fielen
// neue Kommentare dauerhaft aus dem Ergebnis, auf allen Geräten.
describe('GET /api/community/comments', () => {
  it('filtert per post_id und sortiert aufsteigend (chronologisch je Post)', async () => {
    const res = await request(app).get('/api/community/comments?post_id=p1');
    expect(res.status).toBe(200);
    const builder = supabaseMock.current.__builders.community_comments;
    expect(builder.eq).toHaveBeenCalledWith('post_id', 'p1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('filtert per post_ids (Feed-Ausschnitt) statt der ganzen Plattform', async () => {
    const res = await request(app).get('/api/community/comments?post_ids=p1,p2,p3');
    expect(res.status).toBe(200);
    const builder = supabaseMock.current.__builders.community_comments;
    expect(builder.in).toHaveBeenCalledWith('post_id', ['p1', 'p2', 'p3']);
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('erlaubt ein hoeheres Limit, wenn nach post_ids gefiltert wird', async () => {
    const res = await request(app).get('/api/community/comments?post_ids=p1,p2&limit=1500');
    expect(res.status).toBe(200);
    const builder = supabaseMock.current.__builders.community_comments;
    expect(builder.range).toHaveBeenCalledWith(0, 1499);
  });

  it('deckelt das Limit weiterhin auf 500, ohne post_id/post_ids-Filter', async () => {
    const res = await request(app).get('/api/community/comments?limit=5000');
    expect(res.status).toBe(200);
    const builder = supabaseMock.current.__builders.community_comments;
    expect(builder.range).toHaveBeenCalledWith(0, 499);
  });

  it('sortiert ohne Filter absteigend (Sicherheitsnetz gegen das Cap-Problem)', async () => {
    const res = await request(app).get('/api/community/comments');
    expect(res.status).toBe(200);
    const builder = supabaseMock.current.__builders.community_comments;
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

describe('POST /api/community/posts', () => {
  it('akzeptiert text, photo_url, likes und reported Felder vom Frontend', async () => {
    supabaseMock.current = createSupabaseMock({
      authUser: { id: 'u1', email: 'test@example.com' },
      fromResults: {
        community_posts: { data: { id: 'p1', text: 'Mein Post', photo_url: 'https://example.com/pic.jpg', likes: 0, reported: false, created_by: 'test@example.com', created_at: '2026-09-26T00:00:00Z' }, error: null },
      },
    });
    const res = await request(app)
      .post('/api/community/posts')
      .set('Authorization', 'Bearer tok')
      .send({ text: 'Mein Post', photo_url: 'https://example.com/pic.jpg', likes: 0, reported: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'p1', text: 'Mein Post', photo_url: 'https://example.com/pic.jpg', created_by: 'test@example.com' });
  });

  it('verlangt eine Anmeldung', async () => {
    supabaseMock.current = createSupabaseMock({ authUser: null });
    const res = await request(app)
      .post('/api/community/posts')
      .send({ text: 'Gast-Post', photo_url: null });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/community/comments', () => {
  it('legt einen Kommentar mit korrekter Autor-Zuordnung an', async () => {
    supabaseMock.current.__builders.community_comments = undefined;
    supabaseMock.current = createSupabaseMock({
      authUser: { id: 'u1', email: 'a@b.de' },
      fromResults: {
        community_comments: { data: { id: 'c1', post_id: 'p1', text: 'Neuer Kommentar', created_by: 'a@b.de', created_at: '2026-09-26T00:00:00Z' }, error: null },
      },
    });
    const res = await request(app)
      .post('/api/community/comments')
      .set('Authorization', 'Bearer tok')
      .send({ post_id: 'p1', text: 'Neuer Kommentar' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'c1', post_id: 'p1', created_by: 'a@b.de' });
  });

  it('verlangt post_id und text', async () => {
    const res = await request(app)
      .post('/api/community/comments')
      .set('Authorization', 'Bearer tok')
      .send({ text: 'Ohne Post' });
    expect(res.status).toBe(400);
  });

  it('verlangt eine Anmeldung', async () => {
    supabaseMock.current = createSupabaseMock({ authUser: null });
    const res = await request(app)
      .post('/api/community/comments')
      .send({ post_id: 'p1', text: 'Gast-Kommentar' });
    expect(res.status).toBe(401);
  });
});
