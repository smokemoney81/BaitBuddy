import { Router } from 'express';
import { requireAuth, optionalAuth, requireAdmin } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { validateClubProfile, EXTERNAL_REF } from '../lib/clubProfile.js';

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLUB_COLUMNS = 'id, external_ref, name, description, motto, region, home_water, street, postal_code, city, phone, email, website, contact, logo_url, founded_year, member_count, latitude, longitude, rules, waters, verified, updated_at';

async function findClub(key) {
  const column = UUID.test(key) ? 'id' : 'external_ref';
  if (column === 'external_ref' && !EXTERNAL_REF.test(key)) return { data: null, error: null };
  return supabase.from('fishing_clubs').select(CLUB_COLUMNS).eq(column, key).maybeSingle();
}

async function isClubAdmin(clubId, userId) {
  if (!userId) return false;
  const { data } = await supabase.from('club_admins').select('club_id').eq('club_id', clubId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

// Verzeichnis-Vereine, denen jemand folgt oder die jemand einrichtet, bekommen
// beim ersten Mal eine Zeile. Name/Ort stammen aus dem öffentlichen Verzeichnis
// im Client; bis ein Vorstand das Profil übernimmt, bleibt es unverifiziert.
async function ensureClubForRef(ref, body) {
  const existing = await findClub(ref);
  if (existing.error) return existing;
  if (existing.data) return existing;
  const validated = validateClubProfile({
    name: body?.name, city: body?.city, street: body?.street, postal_code: body?.postal_code,
    phone: body?.phone, email: body?.email, website: body?.website, latitude: body?.latitude, longitude: body?.longitude,
  }, { requireName: true });
  if (!validated.ok) return { data: null, error: { status: 400, message: validated.error } };
  const inserted = await supabase.from('fishing_clubs')
    .insert({ ...validated.value, external_ref: ref })
    .select(CLUB_COLUMNS)
    .single();
  // Gleichzeitig angelegt (Unique-Index auf external_ref) → vorhandene Zeile nehmen.
  if (inserted.error?.code === '23505') return findClub(ref);
  return inserted;
}

function sendClubError(res, error) {
  if (error?.status === 400) return res.status(400).json({ error: error.message });
  return sendDbError(res, error);
}

router.get('/clubs', optionalAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
  let query = supabase.from('fishing_clubs').select('id, external_ref, name, city, home_water, verified, logo_url').order('name').limit(50);
  if (q) {
    const safe = q.replace(/[%,()*]/g, ' ');
    query = query.or(`name.ilike.%${safe}%,city.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.get('/clubs/following/me', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('club_followers').select('club_id').eq('user_id', req.user.id);
  if (error) return sendDbError(res, error);
  const ids = (data || []).map(row => row.club_id);
  if (!ids.length) return res.json([]);
  const { data: clubs, error: clubError } = await supabase.from('fishing_clubs')
    .select('id, external_ref, name, city, verified, logo_url').in('id', ids);
  if (clubError) return sendDbError(res, clubError);
  return res.json(clubs || []);
});

router.get('/clubs/:key', optionalAuth, async (req, res) => {
  const { data: club, error } = await findClub(req.params.key);
  if (error) return sendDbError(res, error);
  if (!club) return res.status(404).json({ error: 'Verein hat noch kein Profil' });

  const nowIso = new Date().toISOString();
  const [followers, admins, following, clubEvents] = await Promise.all([
    supabase.from('club_followers').select('user_id', { count: 'exact', head: true }).eq('club_id', club.id),
    supabase.from('club_admins').select('user_id', { count: 'exact', head: true }).eq('club_id', club.id),
    req.user?.id
      ? supabase.from('club_followers').select('club_id').eq('club_id', club.id).eq('user_id', req.user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('events')
      .select('id, name, start_date, end_date, target_species, prize_description, status')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .gte('end_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(10),
  ]);

  const eventIds = (clubEvents.data || []).map(e => e.id);
  const counts = new Map();
  if (eventIds.length) {
    const { data: parts } = await supabase.from('event_participants').select('event_id').in('event_id', eventIds);
    for (const p of parts || []) counts.set(p.event_id, (counts.get(p.event_id) || 0) + 1);
  }

  return res.json({
    ...club,
    follower_count: followers.count || 0,
    claimed: (admins.count || 0) > 0,
    is_following: Boolean(following.data),
    is_admin: await isClubAdmin(club.id, req.user?.id),
    events: (clubEvents.data || []).map(e => ({ ...e, participant_count: counts.get(e.id) || 0 })),
  });
});

// Profil anlegen bzw. ein Verzeichnis-Profil übernehmen. Wer zuerst übernimmt,
// wird Verwalter; das Häkchen "Verifiziert" setzt nur ein App-Admin.
router.post('/clubs', requireAuth, async (req, res) => {
  const ref = typeof req.body?.external_ref === 'string' ? req.body.external_ref.trim() : null;
  if (ref && !EXTERNAL_REF.test(ref)) return res.status(400).json({ error: 'Ungültige Verzeichnis-Referenz' });
  const validated = validateClubProfile(req.body, { requireName: true });
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  let club;
  if (ref) {
    const ensured = await ensureClubForRef(ref, req.body);
    if (ensured.error) return sendClubError(res, ensured.error);
    club = ensured.data;
    const { count } = await supabase.from('club_admins').select('user_id', { count: 'exact', head: true }).eq('club_id', club.id);
    if ((count || 0) > 0 && !(await isClubAdmin(club.id, req.user.id))) {
      return res.status(409).json({ error: 'Dieses Vereinsprofil wird bereits verwaltet.' });
    }
    const { data, error } = await supabase.from('fishing_clubs')
      .update({ ...validated.value, updated_at: new Date().toISOString() })
      .eq('id', club.id).select(CLUB_COLUMNS).single();
    if (error) return sendDbError(res, error);
    club = data;
  } else {
    const { data, error } = await supabase.from('fishing_clubs').insert(validated.value).select(CLUB_COLUMNS).single();
    if (error) return sendDbError(res, error);
    club = data;
  }

  const { error: adminError } = await supabase.from('club_admins').upsert({ club_id: club.id, user_id: req.user.id });
  if (adminError) return sendDbError(res, adminError);
  return res.status(201).json({ ...club, is_admin: true, claimed: true });
});

router.patch('/clubs/:id', requireAuth, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Verein nicht gefunden' });
  if (!(await isClubAdmin(req.params.id, req.user.id))) return res.status(403).json({ error: 'Nur Vereinsverwalter können das Profil ändern' });
  const validated = validateClubProfile(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { data, error } = await supabase.from('fishing_clubs')
    .update({ ...validated.value, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).select(CLUB_COLUMNS).single();
  if (error) return sendDbError(res, error);
  return res.json({ ...data, is_admin: true });
});

router.post('/clubs/:id/verify', requireAuth, requireAdmin, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Verein nicht gefunden' });
  const verified = req.body?.verified !== false;
  const { data, error } = await supabase.from('fishing_clubs').update({ verified }).eq('id', req.params.id).select('id, verified').single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

async function follow(req, res, club) {
  const { error } = await supabase.from('club_followers').upsert({ club_id: club.id, user_id: req.user.id });
  if (error) return sendDbError(res, error);
  return res.json({ ok: true, club_id: club.id, is_following: true });
}

router.post('/clubs/:key/follow', requireAuth, async (req, res) => {
  const key = req.params.key;
  const result = UUID.test(key) ? await findClub(key) : EXTERNAL_REF.test(key) ? await ensureClubForRef(key, req.body) : { data: null };
  if (result.error) return sendClubError(res, result.error);
  if (!result.data) return res.status(404).json({ error: 'Verein nicht gefunden' });
  return follow(req, res, result.data);
});

router.delete('/clubs/:id/follow', requireAuth, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Verein nicht gefunden' });
  const { error } = await supabase.from('club_followers').delete().eq('club_id', req.params.id).eq('user_id', req.user.id);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true, is_following: false });
});

export { isClubAdmin };
export default router;
