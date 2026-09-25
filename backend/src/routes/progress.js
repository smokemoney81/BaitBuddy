import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { resolvePlan } from '../lib/planResolver.js';
import { computeProgress, XP_RULES, MAX_CATCHES_PER_DAY } from '../lib/progression.js';

const router = Router();

const PAGE = 1000;
const MAX_PAGES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

// PostgREST liefert höchstens 1000 Zeilen pro Anfrage; für die XP zählen aber
// alle Fänge. Deshalb seitenweise lesen (Obergrenze 20 000 Fänge).
async function loadCatches(email) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('catches')
      .select('species, length_cm, photo_url, catch_time, created_at')
      .eq('created_by', email)
      .order('created_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { data: rows };
}

function eventState(event, participation, now) {
  if (participation.is_winner) return 'won';
  const start = event?.start_date ? new Date(event.start_date).getTime() : null;
  const end = event?.end_date ? new Date(event.end_date).getTime() : null;
  if (event?.status === 'ended' || (end && end < now)) return 'participated';
  if (start && start > now) return 'upcoming';
  return 'running';
}

router.get('/progress/me', requireAuth, async (req, res) => {
  const email = req.user.email;
  const now = Date.now();

  const [catchResult, spotResult, tripResult, participationResult] = await Promise.all([
    loadCatches(email),
    supabase.from('spots').select('id', { count: 'exact', head: true }).eq('created_by', email),
    supabase.from('fishing_plans').select('id', { count: 'exact', head: true }).eq('created_by', email),
    supabase.from('event_participants').select('event_id, total_points, is_winner').eq('user_id', email),
  ]);
  const failed = [catchResult, spotResult, tripResult, participationResult].find(r => r?.error);
  if (failed) return sendDbError(res, failed.error);

  const participations = participationResult.data || [];
  let eventsById = new Map();
  const eventIds = [...new Set(participations.map(p => p.event_id).filter(Boolean))];
  if (eventIds.length) {
    const { data: events, error } = await supabase
      .from('events')
      .select('id, name, title, prize_description, status, start_date, end_date, target_species, is_active')
      .in('id', eventIds);
    if (error) return sendDbError(res, error);
    eventsById = new Map((events || []).map(e => [e.id, e]));
  }

  const progress = computeProgress({
    catches: catchResult.data,
    spotCount: spotResult.count || 0,
    tripCount: tripResult.count || 0,
    // Teilnahmen an ausgeblendeten (gelöschten) Events zählen nicht.
    participations: participations.filter(p => eventsById.get(p.event_id)?.is_active !== false),
  });

  const eventRewards = participations
    .map(p => ({ p, event: eventsById.get(p.event_id) }))
    .filter(({ event }) => event && event.is_active !== false)
    .map(({ p, event }) => ({
      event_id: event.id,
      name: event.name || event.title || 'Event',
      prize: event.prize_description || null,
      target_species: event.target_species || null,
      points: Math.round(Number(p.total_points) || 0),
      state: eventState(event, p, now),
      end_date: event.end_date || null,
    }))
    .sort((a, b) => (b.end_date || '').localeCompare(a.end_date || ''));

  const { effectiveId, isActive, expiresAt } = resolvePlan(req.user);
  const createdAt = req.user.created_at ? new Date(req.user.created_at).getTime() : null;

  return res.json({
    ...progress,
    member_since_days: createdAt ? Math.max(0, Math.floor((now - createdAt) / DAY_MS)) : null,
    plan: { id: effectiveId, active: isActive, expires_at: expiresAt },
    event_rewards: eventRewards,
    rules: { xp: XP_RULES, max_catches_per_day: MAX_CATCHES_PER_DAY },
  });
});

export default router;
