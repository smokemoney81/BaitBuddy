import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { MemoryCache } from '../lib/memoryCache.js';
import { validateCatchPayload } from './catches.js';
import { loadProfileDirectory, replaceEmails, replaceEmailList, publicAuthor } from '../lib/publicProfiles.js';

const router = Router();

// Kurzlebiger Read-Cache für die Liste aktiver Wettbewerbe: Diese wird häufig
// abgerufen (jedes Community-/Event-Rendering), ändert sich aber selten. 30s TTL
// deckelt die Staleness, `invalidate` leert ihn sofort nach einem Insert.
const COMPETITIONS_CACHE_KEY = 'competitions:active';
const competitionsCache = new MemoryCache({ defaultTtlMs: 30000, maxEntries: 4 });

// Whitelist der erlaubten Felder pro Ressource — muss den echten Spalten
// entsprechen (community_posts: text, photo_url; voting_submissions: title,
// description, photo_url, catch_id, species, length_cm, competition_id).
// Die frühere Liste (title/content/image_url bzw. category/image_url) nannte
// Spalten, die es nicht gibt: Jeder Community-Post wurde ohne Text und Foto
// gespeichert, jede Voting-Einreichung scheiterte.
const ALLOWED_POST_FIELDS = ['text', 'photo_url'];
const MAX_POST_CHARS = 5000;
const MAX_COMMENT_CHARS = 2000;
const ALLOWED_VOTING_SUBMIT_FIELDS = ['title', 'description', 'photo_url', 'catch_id', 'species', 'length_cm', 'competition_id'];
const ALLOWED_CLAN_FIELDS = ['name', 'description', 'logo_url', 'competition_id'];
const ALLOWED_COMPETITION_FIELDS = ['name', 'description', 'start_date', 'end_date', 'is_active'];

// Community-Inhalte führen den Autor als E-Mail. Nach außen geht stattdessen
// ein öffentliches Profil (siehe lib/publicProfiles.js).
async function withAuthors(req, rows, { field = 'created_by', alsoStrip = [] } = {}) {
  const directory = await loadProfileDirectory();
  return replaceEmails(rows, {
    field, as: 'author', ownFlag: 'is_own', viewerEmail: req.user?.email, directory, alsoStrip,
  });
}

async function withAuthor(req, row, options) {
  if (!row) return row;
  return (await withAuthors(req, [row], options))[0];
}

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
  return res.json(await withAuthors(req, data || []));
});

function readPostBody(body, { partial }) {
  const filtered = filterBody(body || {}, ALLOWED_POST_FIELDS);
  if (!partial || 'text' in filtered) {
    if (typeof filtered.text !== 'string' || !filtered.text.trim()) {
      return { ok: false, error: 'Text erforderlich' };
    }
    filtered.text = filtered.text.trim().slice(0, MAX_POST_CHARS);
  }
  if ('photo_url' in filtered && filtered.photo_url != null && typeof filtered.photo_url !== 'string') {
    return { ok: false, error: 'photo_url muss Text sein' };
  }
  return { ok: true, value: filtered };
}

router.post('/community/posts', requireAuth, async (req, res) => {
  const post = readPostBody(req.body, { partial: false });
  if (!post.ok) return res.status(400).json({ error: post.error });
  const { data, error } = await supabase.from('community_posts').insert({
    ...post.value,
    likes: 0,
    reported: false,
    created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(await withAuthor(req, data));
});

// Bearbeiten (nur Autor) bzw. Melden (jeder angemeldete Nutzer). Das Frontend
// meldet über entities.Post.update(id, { reported: true }) — diese Route gab
// es bisher nicht, jede Meldung endete mit 404.
router.patch('/community/posts/:id', requireAuth, async (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body);
  if (keys.length === 1 && body.reported === true) {
    const { data, error } = await supabase.from('community_posts')
      .update({ reported: true }).eq('id', req.params.id).select('id, reported').maybeSingle();
    if (error) return sendDbError(res, error);
    if (!data) return res.status(404).json({ error: 'Post nicht gefunden' });
    return res.json({ ok: true, id: data.id, reported: true });
  }

  const post = readPostBody(body, { partial: true });
  if (!post.ok) return res.status(400).json({ error: post.error });
  if (Object.keys(post.value).length === 0) {
    return res.status(400).json({ error: 'Keine änderbaren Felder' });
  }
  const { data, error } = await supabase.from('community_posts')
    .update(post.value)
    .eq('id', req.params.id).eq('created_by', req.user.email)
    .select().maybeSingle();
  if (error) return sendDbError(res, error);
  if (!data) return res.status(404).json({ error: 'Post nicht gefunden' });
  return res.json(await withAuthor(req, data));
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
router.get('/community/comments', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  let query = supabase.from('community_comments')
    .select('*').order('created_at', { ascending: true }).range(offset, offset + limit - 1);
  if (req.query.post_id) query = query.eq('post_id', req.query.post_id);
  const { data, error } = await query;
  if (error) return sendDbError(res, error);
  return res.json(await withAuthors(req, data || []));
});

router.post('/community/comments', requireAuth, async (req, res) => {
  const { post_id, text } = req.body || {};
  if (!post_id || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'post_id und text erforderlich' });
  }
  const { data, error } = await supabase.from('community_comments').insert({
    post_id, text: text.trim().slice(0, MAX_COMMENT_CHARS), created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(await withAuthor(req, data));
});

router.get('/community/voting/leaderboard', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { data, error } = await supabase.from('voting_submissions')
    .select('*').order('total_score', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return sendDbError(res, error);
  return res.json(await withAuthors(req, data || [], { alsoStrip: ['user_id'] }));
});

router.post('/community/voting/submit', requireAuth, async (req, res) => {
  const filteredBody = filterBody(req.body, ALLOWED_VOTING_SUBMIT_FIELDS);
  const { data, error } = await supabase.from('voting_submissions').insert({
    ...filteredBody, user_id: req.user.email, created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(await withAuthor(req, data, { alsoStrip: ['user_id'] }));
});

router.post('/community/voting/:id/like', requireAuth, async (req, res) => {
  const { error } = await supabase.from('voting_likes').insert({
    submission_id: req.params.id, user_id: req.user.email
  });
  if (error?.code === '23505') return res.json({ ok: true });
  if (error) return sendDbError(res, error);

  // Zähler aus voting_likes neu berechnen und an der Einreichung speichern —
  // wie bei Post-Likes. Vorher blieb voting_submissions.likes immer 0.
  const { count } = await supabase.from('voting_likes')
    .select('*', { count: 'exact', head: true })
    .eq('submission_id', req.params.id);
  if (typeof count === 'number') {
    await supabase.from('voting_submissions').update({ likes: count }).eq('id', req.params.id);
  }
  return res.json({ ok: true, likes: count });
});

// ─────────────────────────────────────────────────────────────────────────────
// Globale Bestenlisten (Community → „Bestenlisten“)
// Früher baute der Client die Listen aus Catch.list() — das liefert aber nur
// die EIGENEN Fänge, und „Punkte“ las eine Entity, die es nicht gibt. Die
// Bestenliste zeigte deshalb nur den Nutzer selbst oder nichts.
// Aggregiert wird hier serverseitig; ausgegeben werden öffentliche Profile.
const LEADERBOARD_TYPES = new Set(['points', 'catches', 'biggest']);
const LEADERBOARD_SIZE = 10;
// Obergrenze der gelesenen Zeilen je Aggregation. Reicht für den aktuellen
// Datenbestand um Größenordnungen; bei starkem Wachstum gehört die Aggregation
// in eine RPC.
const LEADERBOARD_SCAN_LIMIT = 20000;
const leaderboardCache = new MemoryCache({ defaultTtlMs: 60000, maxEntries: 3 });

async function aggregateLeaderboard(type) {
  const totals = new Map();
  if (type === 'points') {
    const { data, error } = await supabase.from('event_participants')
      .select('user_id, total_points').limit(LEADERBOARD_SCAN_LIMIT);
    if (error) throw error;
    for (const row of data || []) {
      if (!row.user_id) continue;
      totals.set(row.user_id, (totals.get(row.user_id) || 0) + (Number(row.total_points) || 0));
    }
  } else {
    const { data, error } = await supabase.from('catches')
      .select('created_by, length_cm').not('created_by', 'is', null).limit(LEADERBOARD_SCAN_LIMIT);
    if (error) throw error;
    for (const row of data || []) {
      if (type === 'catches') {
        totals.set(row.created_by, (totals.get(row.created_by) || 0) + 1);
      } else {
        const length = Number(row.length_cm) || 0;
        if (length > 0 && length > (totals.get(row.created_by) || 0)) totals.set(row.created_by, length);
      }
    }
  }
  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LEADERBOARD_SIZE)
    .map(([email, value]) => ({ email, value: Math.round(value * 100) / 100 }));
}

router.get('/community/leaderboard', optionalAuth, async (req, res) => {
  const type = String(req.query.type || '');
  if (!LEADERBOARD_TYPES.has(type)) {
    return res.status(400).json({ error: 'type muss points, catches oder biggest sein' });
  }
  try {
    const rows = await leaderboardCache.wrap(type, () => aggregateLeaderboard(type));
    const directory = await loadProfileDirectory();
    const entries = replaceEmails(rows, {
      field: 'email', as: 'user', ownFlag: 'is_me', viewerEmail: req.user?.email, directory,
    }).map((row, index) => ({ rank: index + 1, ...row }));
    return res.json({ type, entries });
  } catch (error) {
    return sendDbError(res, error);
  }
});

const CLAN_MAX_MEMBERS = 10;

// Aggregiert Clans (optional einer Competition) mit Mitgliedern und Fang-Statistik.
// Mitgliedschaft ist die Wahrheit aus clan_members (user_id = E-Mail); die Fänge
// kommen aus catches der Mitglieder. Drei Sammel-Queries statt N+1 pro Clan.
async function buildClanStats(competitionId, viewerEmail = null) {
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

  const directory = await loadProfileDirectory();
  const viewer = viewerEmail ? String(viewerEmail).toLowerCase() : null;

  return clans.map((clan) => {
    const members = membersByClan[clan.id] || [];
    const lengths = members.flatMap((e) => catchesByEmail[e] || []);
    const totalScore = Math.round(lengths.reduce((s, l) => s + l, 0));
    const averageSize = lengths.length ? Math.round(totalScore / lengths.length) : 0;
    // Mitglieder und Gründer als öffentliche Profile, nie als E-Mail.
    // `members` (jsonb-Spalte der Tabelle) wird durch die echte Liste ersetzt.
    const { created_by: ownerEmail, ...clanFields } = clan;
    return {
      ...clanFields,
      owner: publicAuthor(ownerEmail, directory),
      is_own: !!viewer && String(ownerEmail || '').toLowerCase() === viewer,
      is_member: !!viewer && members.some((m) => String(m).toLowerCase() === viewer),
      members: replaceEmailList(members, directory),
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
    return res.json(await buildClanStats(req.query.competition_id || null, req.user?.email));
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
  const directory = await loadProfileDirectory();
  const { created_by: _ownerEmail, ...clanFields } = clan;
  return res.json({
    ...clanFields,
    owner: publicAuthor(req.user.email, directory),
    is_own: true,
    is_member: true,
    members: replaceEmailList([req.user.email], directory),
    member_count: 1,
  });
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
  return res.json(await withAuthors(req, data || []));
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
    return res.json(await withAuthors(req, data));
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
  return res.json(await withAuthor(req, data));
});

router.get('/competitions/:id/leaderboard', optionalAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const { data, error } = await supabase.from('voting_submissions')
    .select('*').eq('competition_id', req.params.id)
    .order('total_score', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return sendDbError(res, error);
  return res.json(await withAuthors(req, data || [], { alsoStrip: ['user_id'] }));
});

router.post('/competitions/:id/submit', requireAuth, async (req, res) => {
  const { species, length_cm, photo_url } = req.body || {};
  // Punkte = Länge → dieselben Grenzen wie im Fangbuch, sonst ließe sich die
  // Rangliste mit beliebigen Zahlen anführen.
  const validated = validateCatchPayload({ species, length_cm, photo_url }, { partial: true });
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { data, error } = await supabase.from('voting_submissions').insert({
    competition_id: req.params.id,
    user_id: req.user.email,
    created_by: req.user.email,
    species: validated.value.species ?? null,
    length_cm: validated.value.length_cm ?? null,
    photo_url: validated.value.photo_url || null,
    catch_time: new Date().toISOString(),
    total_score: validated.value.length_cm || 0
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(await withAuthor(req, data, { alsoStrip: ['user_id'] }));
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
