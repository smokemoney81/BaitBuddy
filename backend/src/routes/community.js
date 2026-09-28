import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { MemoryCache } from '../lib/memoryCache.js';

const router = Router();

// Kurzlebiger Read-Cache für die Liste aktiver Wettbewerbe: Diese wird häufig
// abgerufen (jedes Community-/Event-Rendering), ändert sich aber selten. 30s TTL
// deckelt die Staleness, `invalidate` leert ihn sofort nach einem Insert.
const COMPETITIONS_CACHE_KEY = 'competitions:active';
const competitionsCache = new MemoryCache({ defaultTtlMs: 30000, maxEntries: 4 });

// Whitelist der erlaubten Felder pro Ressource
const ALLOWED_POST_FIELDS = ['text', 'photo_url', 'likes', 'reported'];
const ALLOWED_VOTING_SUBMIT_FIELDS = ['category', 'title', 'description', 'image_url'];
const ALLOWED_CLAN_FIELDS = ['name', 'description', 'logo_url', 'competition_id'];
const ALLOWED_COMPETITION_FIELDS = ['name', 'description', 'start_date', 'end_date', 'is_active'];

const filterBody = (body, allowedFields) => {
  const filtered = {};
  for (const key of allowedFields) {
    if (key in body) {
      filtered[key] = body[key];
    }
  }
  return filtered;
};

router.get('/community/posts', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { data, error } = await supabase.from('community_posts')
    .select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.post('/community/posts', requireAuth, async (req, res) => {
  const filteredBody = filterBody(req.body, ALLOWED_POST_FIELDS);
  const { data, error } = await supabase.from('community_posts').insert({
    ...filteredBody,
    created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.delete('/community/posts/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('community_posts').delete()
    .eq('id', req.params.id).eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

router.post('/community/posts/:id/like', requireAuth, async (req, res) => {
  const { error } = await supabase.from('post_likes').insert({
    post_id: req.params.id, user_id: req.user.email
  });
  // 23505 = bereits geliked (Unique-Constraint); nicht erneut hochzählen.
  if (error?.code === '23505') return res.json({ ok: true });
  if (error) return sendDbError(res, error);

  // Like-Anzahl aus post_likes aggregieren und auf dem Post persistieren,
  // damit der Zähler nach einem Reload korrekt bleibt.
  const { count } = await supabase.from('post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', req.params.id);
  if (typeof count === 'number') {
    await supabase.from('community_posts').update({ likes: count }).eq('id', req.params.id);
  }
  return res.json({ ok: true, likes: count });
});

// Kommentare zu Community-Posts. community_posts nutzt created_by (E-Mail) als
// Autor-Kennung; community_comments folgt demselben Schema.
//
// `post_id` (einzelner Post) oder `post_ids` (kommagetrennt, für einen
// geladenen Feed-Ausschnitt) grenzen die Abfrage auf bekannte Posts ein, damit
// das Limit unten neue Kommentare nie verdeckt. Ohne einen der beiden Filter
// wird plattformweit sortiert nach neuesten zuerst geliefert (Sicherheitsnetz),
// statt aufsteigend + hartem Cap, was ältere Kommentare bevorzugt und neue
// Kommentare nach Überschreiten des Caps dauerhaft verschwinden lässt.
router.get('/community/comments', optionalAuth, async (req, res) => {
  const postIds = req.query.post_ids
    ? String(req.query.post_ids).split(',').map(id => id.trim()).filter(Boolean)
    : null;
  const hasPostFilter = !!(req.query.post_id || (postIds && postIds.length > 0));
  const maxLimit = hasPostFilter ? 2000 : 500;
  const limit = Math.min(parseInt(req.query.limit) || (hasPostFilter ? 500 : 100), maxLimit);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  let query = supabase.from('community_comments').select('*');
  if (req.query.post_id) {
    query = query.eq('post_id', req.query.post_id).order('created_at', { ascending: true });
  } else if (postIds && postIds.length > 0) {
    query = query.in('post_id', postIds).order('created_at', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: false });
  }
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.post('/community/comments', requireAuth, async (req, res) => {
  const { post_id, text } = req.body || {};
  if (!post_id || !text) return res.status(400).json({ error: 'post_id und text erforderlich' });
  const { data, error } = await supabase.from('community_comments').insert({
    post_id, text, created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.get('/community/voting/leaderboard', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { data, error } = await supabase.from('voting_submissions')
    .select('*').order('total_score', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.post('/community/voting/submit', requireAuth, async (req, res) => {
  const filteredBody = filterBody(req.body, ALLOWED_VOTING_SUBMIT_FIELDS);
  const { data, error } = await supabase.from('voting_submissions').insert({
    ...filteredBody, created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.post('/community/voting/:id/like', requireAuth, async (req, res) => {
  const { error } = await supabase.from('voting_likes').insert({
    submission_id: req.params.id, user_id: req.user.email
  });
  if (error?.code === '23505') return res.json({ ok: true });
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

const CLAN_MAX_MEMBERS = 10;

// Aggregiert Clans (optional einer Competition) mit Mitgliedern und Fang-Statistik.
// Mitgliedschaft ist die Wahrheit aus clan_members (user_id = E-Mail); die Fänge
// kommen aus catches der Mitglieder. Drei Sammel-Queries statt N+1 pro Clan.
async function buildClanStats(competitionId) {
  let clanQuery = supabase.from('clans').select('*');
  if (competitionId) clanQuery = clanQuery.eq('competition_id', competitionId);
  const { data: clans } = await clanQuery;
  if (!clans?.length) return [];

  const clanIds = clans.map((c) => c.id);
  const { data: memberRows } = await supabase
    .from('clan_members').select('clan_id, user_id').in('clan_id', clanIds);

  const membersByClan = {};
  const allEmails = new Set();
  for (const m of memberRows || []) {
    (membersByClan[m.clan_id] ||= []).push(m.user_id);
    if (m.user_id) allEmails.add(m.user_id);
  }

  const catchesByEmail = {};
  if (allEmails.size) {
    const { data: catchRows } = await supabase
      .from('catches').select('created_by, length_cm').in('created_by', [...allEmails]);
    for (const c of catchRows || []) {
      (catchesByEmail[c.created_by] ||= []).push(Number(c.length_cm) || 0);
    }
  }

  return clans.map((clan) => {
    const members = membersByClan[clan.id] || [];
    const lengths = members.flatMap((e) => catchesByEmail[e] || []);
    const totalScore = Math.round(lengths.reduce((s, l) => s + l, 0));
    const averageSize = lengths.length ? Math.round(totalScore / lengths.length) : 0;
    return {
      ...clan,
      members,
      member_count: members.length,
      total_catches: lengths.length,
      total_score: totalScore,
      total_event_score: totalScore,
      average_size: averageSize,
    };
  });
}

// Clan-Liste (optional je Competition) inkl. Mitglieder + Statistik.
router.get('/community/clans', optionalAuth, async (req, res) => {
  try {
    return res.json(await buildClanStats(req.query.competition_id || null));
  } catch (e) {
    return sendDbError(res, e);
  }
});

// Clan-Rangliste einer Competition (nach Gesamt-Score, mit Rang).
router.get('/community/clans/leaderboard', optionalAuth, async (req, res) => {
  try {
    const leaderboard = (await buildClanStats(req.query.competition_id || null))
      .sort((a, b) => b.total_score - a.total_score)
      .map((c, i) => ({
        clan_id: c.id,
        clan_name: c.name,
        member_count: c.member_count,
        total_catches: c.total_catches,
        average_size: c.average_size,
        total_score: c.total_score,
        rank: i + 1,
      }));
    return res.json({ leaderboard });
  } catch (e) {
    return sendDbError(res, e);
  }
});

router.post('/community/clans', requireAuth, async (req, res) => {
  const filteredBody = filterBody(req.body, ALLOWED_CLAN_FIELDS);
  const { data: clan, error } = await supabase.from('clans').insert({
    ...filteredBody, created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  // Ersteller wird automatisch erstes Mitglied (Modell A: clan_members).
  await supabase.from('clan_members')
    .insert({ clan_id: clan.id, user_id: req.user.email, role: 'owner' });
  return res.json(clan);
});

router.post('/community/clans/:id/join', requireAuth, async (req, res) => {
  const { count } = await supabase.from('clan_members')
    .select('*', { count: 'exact', head: true }).eq('clan_id', req.params.id);
  if ((count || 0) >= CLAN_MAX_MEMBERS) {
    return res.status(400).json({ error: `Clan ist voll (max. ${CLAN_MAX_MEMBERS} Mitglieder)` });
  }
  const { error } = await supabase.from('clan_members').insert({
    clan_id: req.params.id, user_id: req.user.email
  });
  if (error?.code === '23505') return res.json({ ok: true, already_member: true });
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

// Mitglieder + grösster Fang je Mitglied eines einzelnen Clans.
router.get('/community/clans/:id/leaderboard', optionalAuth, async (req, res) => {
  const { data: members } = await supabase.from('clan_members')
    .select('user_id').eq('clan_id', req.params.id);
  if (!members?.length) return res.json([]);
  const memberIds = members.map((m) => m.user_id);
  const { data, error } = await supabase.from('catches')
    .select('created_by, species, length_cm')
    .in('created_by', memberIds)
    .order('length_cm', { ascending: false }).limit(20);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.get('/competitions', optionalAuth, async (req, res) => {
  // Cache-Aside: DB nur bei Cache-Miss/abgelaufener TTL treffen. Ein DB-Fehler
  // wird nicht gecacht (wrap wirft und der Producer läuft beim nächsten Mal neu).
  try {
    const data = await competitionsCache.wrap(COMPETITIONS_CACHE_KEY, async () => {
      const { data: rows, error } = await supabase.from('competitions')
        .select('*').eq('is_active', true).order('created_at', { ascending: false });
      if (error) throw error;
      return rows || [];
    });
    return res.json(data);
  } catch (error) {
    return sendDbError(res, error);
  }
});

router.post('/competitions', requireAuth, async (req, res) => {
  const filteredBody = filterBody(req.body, ALLOWED_COMPETITION_FIELDS);
  const { data, error } = await supabase.from('competitions').insert({
    ...filteredBody, created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  // Neuer Wettbewerb: gecachte Liste sofort verwerfen, damit er ohne TTL-Wartezeit
  // erscheint.
  competitionsCache.delete(COMPETITIONS_CACHE_KEY);
  return res.json(data);
});

router.get('/competitions/:id/leaderboard', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { data, error } = await supabase.from('voting_submissions')
    .select('*').eq('competition_id', req.params.id)
    .order('total_score', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.post('/competitions/:id/submit', requireAuth, async (req, res) => {
  const { species, length_cm, photo_url } = req.body;
  const { data, error } = await supabase.from('voting_submissions').insert({
    competition_id: req.params.id,
    user_id: req.user.email,
    created_by: req.user.email,
    species, length_cm, photo_url,
    catch_time: new Date().toISOString(),
    total_score: length_cm || 0
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.post('/competitions/:id/join', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('voting_submissions').insert({
    competition_id: req.params.id,
    user_id: req.user.email,
    created_by: req.user.email,
    total_score: 0
  }).select().single();
  if (error?.code === '23505') return res.json({ ok: true });
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

export default router;
