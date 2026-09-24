import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { resolvePlan, PLAN_RANK } from '../lib/planResolver.js';
import { validateCatchPayload } from './catches.js';
import {
  calculateSubmissionPoints,
  calculateEventFinalRankings,
  aggregateMonthlyLeaderboard,
  autoActivateRewards,
  addActivityPoints,
  recalcParticipantTotals,
  ACTIVITY_POINTS
} from '../lib/pointsCalculator.js';
import { checkSubmission } from '../lib/submissionPlausibility.js';
import { isClubAdmin } from './clubs.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ÖFFENTLICHE ANZEIGE VON TEILNEHMERN
// ─────────────────────────────────────────────────────────────────────────────
// event_participants/event_submissions führen Teilnehmer über ihre E-Mail.
// Nach außen gehen nur Anzeigenamen ("Tom S.") und ein is_me-Flag — die
// Endpunkte sind ohne Login abrufbar, E-Mails wären dort ein Datenleck.

function shortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

async function displayNames(emails) {
  const unique = [...new Set((emails || []).filter(Boolean))];
  const names = new Map();
  if (!unique.length) return names;
  const { data } = await supabase.from('users').select('email, full_name').in('email', unique);
  for (const row of data || []) {
    const name = shortName(row.full_name);
    if (name) names.set(row.email, name);
  }
  return names;
}

function publicPerson(email, names, viewerEmail) {
  return {
    name: names.get(email) || 'Angler',
    is_me: Boolean(viewerEmail) && email === viewerEmail,
  };
}

async function loadOwnedEvent(eventId, email) {
  const { data: event } = await supabase
    .from('events')
    .select('id, created_by, start_date, end_date, status, is_active, target_species, requires_approval')
    .eq('id', eventId)
    .maybeSingle();
  if (!event || event.created_by !== email) return null;
  return event;
}

// Aktivitäts-Punkte liegen als Pseudo-Einreichung "[aktivität]" in derselben
// Tabelle; für Längen-/Anzahl-Wertungen zählen nur echte Fische.
const isRealFish = (submission) => !String(submission?.species || '').startsWith('[');

const STANDING_METRICS = {
  total_length: (a, b) => b.total_length - a.total_length,
  biggest: (a, b) => b.biggest - a.biggest,
  count: (a, b) => b.count - a.count || b.total_length - a.total_length,
  points: (a, b) => b.points - a.points,
};

// ─────────────────────────────────────────────────────────────────────────────
// EVENT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

router.get('/events/templates', optionalAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_templates')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) return sendDbError(res, error);
    return res.json(data || []);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Templates' });
  }
});

router.get('/events/templates/:templateId', optionalAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_templates')
      .select('*')
      .eq('template_id', req.params.templateId)
      .single();

    if (error) return res.status(404).json({ error: 'Template nicht gefunden' });
    return res.json(data);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Templates' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

// Löst die E-Mail-Adressen der "Freunde" eines Nutzers auf. Freunde = beide
// Richtungen der referrals-Beziehung (Nutzer, die ich eingeladen habe, UND der
// Nutzer, der mich eingeladen hat). Die referrals-Tabelle speichert UUIDs; die
// events.created_by-Spalte speichert E-Mails (siehe POST /events) — daher der
// Umweg über auth.admin.getUserById (bestehendes Muster aus premium.js/
// referrals.js). Best-effort: Fehler einzelner Lookups werden übersprungen,
// nie soll die Event-Liste daran scheitern.
async function resolveFriendEmails(userId) {
  const friendIds = new Set();

  const [{ data: invited }, { data: inviters }] = await Promise.all([
    supabase.from('referrals').select('referred_user_id').eq('referrer_user_id', userId),
    supabase.from('referrals').select('referrer_user_id').eq('referred_user_id', userId),
  ]);
  (invited || []).forEach((r) => r.referred_user_id && friendIds.add(r.referred_user_id));
  (inviters || []).forEach((r) => r.referrer_user_id && friendIds.add(r.referrer_user_id));

  const emails = [];
  await Promise.all([...friendIds].map(async (id) => {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (!error && data?.user?.email) emails.push(data.user.email);
    } catch {
      // best-effort: einzelnen Lookup überspringen
    }
  }));
  return emails;
}

// Baut den PostgREST-.or()-Ausdruck für die Sichtbarkeit. Öffentliche Events
// sieht jeder; 'friends'-Events nur, wenn created_by (E-Mail) in der erlaubten
// Liste liegt (eigene E-Mail + Freundes-E-Mails). Werte werden in Doppelquotes
// gefasst, damit Sonderzeichen (@ .) die Filter-Syntax nicht brechen.
function buildVisibilityOrExpr(allowedEmails) {
  const quoted = allowedEmails
    .filter(Boolean)
    .map((e) => `"${String(e).replace(/"/g, '')}"`)
    .join(',');
  if (!quoted) return 'visibility.eq.public';
  return `visibility.eq.public,and(visibility.eq.friends,created_by.in.(${quoted}))`;
}

router.get('/events', optionalAuth, async (req, res) => {
  try {
    let query = supabase
      .from('events')
      .select('*')
      .eq('is_active', true);

    if (req.user?.id) {
      // Eingeloggt: öffentliche Events + eigene/Freundes-'friends'-Events.
      // created_by speichert E-Mails, referrals speichert UUIDs -> auflösen.
      const friendEmails = await resolveFriendEmails(req.user.id);
      const allowed = [req.user.email, ...friendEmails];
      query = query.or(buildVisibilityOrExpr(allowed));
    } else {
      // Ausgeloggt: nur öffentliche Events.
      query = query.eq('visibility', 'public');
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return sendDbError(res, error);
    return res.json(data || []);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Events' });
  }
});

router.get('/events/:id', optionalAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ error: 'Event nicht gefunden' });
    return res.json(data);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Events' });
  }
});

router.post('/events', requireAuth, async (req, res) => {
  try {
    const { name, description, start_date, end_date, template_id, scoring_method, target_species, prize_description, visibility, requires_approval, club_id } = req.body;

    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Name, Startdatum und Enddatum erforderlich' });
    }

    // Vereinsveranstaltungen legt nur ein Verwalter des Vereins an.
    if (club_id && !(await isClubAdmin(club_id, req.user.id))) {
      return res.status(403).json({ error: 'Nur Vereinsverwalter können Vereinsveranstaltungen anlegen' });
    }

    // Sichtbarkeit: 'friends'-Events (nur für Freunde/Referrals sichtbar) sind
    // ein Friends-Plan-Feature. Wer den Plan nicht hat, dessen Event fällt still
    // auf 'public' zurück, statt die Erstellung zu blockieren.
    const { effectiveId } = resolvePlan(req.user);
    const wantsFriends = visibility === 'friends';
    const canHostFriends = (PLAN_RANK[effectiveId] ?? 0) >= PLAN_RANK.friends;
    const eventVisibility = wantsFriends && canHostFriends ? 'friends' : 'public';

    // 1. Event erstellen
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        name,
        description: description || '',
        start_date,
        end_date,
        created_by: req.user.email,
        template_id: template_id || null,
        event_type: template_id ? 'template' : 'custom',
        scoring_method: scoring_method || 'points',
        target_species: target_species || null,
        prize_description: prize_description || null,
        visibility: eventVisibility,
        requires_approval: requires_approval === true,
        ...(club_id ? { club_id } : {}),
        status: 'active',
        is_active: true
      })
      .select()
      .single();

    if (eventError || !event) return sendDbError(res, eventError || new Error('Event creation failed'));

    // 2. Creator als Teilnehmer hinzufügen
    await supabase
      .from('event_participants')
      .insert({
        event_id: event.id,
        user_id: req.user.email,
        joined_at: new Date().toISOString()
      });

    // 3. Standard-Punkte-Konfiguration erstellen
    const { data: template } = await supabase
      .from('event_templates')
      .select('*')
      .eq('template_id', template_id)
      .single();

    const config = {
      event_id: event.id,
      base_points: template?.base_points || 100,
      length_bonus_per_cm: template?.base_points ? 5.0 : 5.0,
      species_bonus: template?.target_species ? { [template.target_species]: 50 } : {},
      first_place_bonus: 500,
      second_place_bonus: 300,
      third_place_bonus: 100,
      like_point_multiplier: 1.0
    };

    await supabase
      .from('event_point_configs')
      .insert(config);

    return res.status(201).json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Events' });
  }
});

router.patch('/events/:id', requireAuth, async (req, res) => {
  try {
    // Prüfe Ownership
    const { data: event } = await supabase
      .from('events')
      .select('created_by, start_date, scoring_method, target_species, end_date, requires_approval, template_id')
      .eq('id', req.params.id)
      .single();

    if (!event || event.created_by !== req.user.email) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    // Nur echte Spalten der events-Tabelle uebernehmen. Das Frontend schickt
    // teils zusaetzliche Felder (z. B. 'participants'), die Postgrest sonst mit
    // "Could not find the 'participants' column" ablehnt; created_by/id bleiben
    // ebenfalls unveraenderbar.
    const EVENT_UPDATE_FIELDS = [
      'name', 'description', 'start_date', 'end_date', 'template_id',
      'event_type', 'scoring_method', 'target_species', 'prize_description',
      'status', 'is_active', 'requires_approval',
    ];
    const patch = {};
    for (const k of EVENT_UPDATE_FIELDS) {
      if (k in req.body) patch[k] = req.body[k];
    }

    // Wettbewerbsregeln sind ab dem Start fixiert und für alle gleich: Wertung,
    // Zielarten, Zeitraum und Freigabepflicht lassen sich danach nicht mehr
    // ändern (Beenden über status/is_active bleibt möglich).
    const LOCKED_AFTER_START = ['start_date', 'end_date', 'scoring_method', 'target_species', 'requires_approval', 'template_id'];
    const started = event.start_date && new Date(event.start_date).getTime() <= Date.now();
    const lockedChange = started && LOCKED_AFTER_START.find(k => k in patch && String(patch[k] ?? '') !== String(event[k] ?? ''));
    if (lockedChange) {
      return res.status(409).json({ error: 'Die Wettbewerbsregeln sind seit dem Start fixiert.', field: lockedChange });
    }

    const { data, error } = await supabase
      .from('events')
      .update({
        ...patch,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return sendDbError(res, error);
    return res.json(data);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Events' });
  }
});

router.delete('/events/:id', requireAuth, async (req, res) => {
  try {
    const { data: event } = await supabase
      .from('events')
      .select('created_by')
      .eq('id', req.params.id)
      .single();

    if (!event || event.created_by !== req.user.email) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    await supabase
      .from('events')
      .update({ is_active: false })
      .eq('id', req.params.id);

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Events' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENT PARTICIPATION
// ─────────────────────────────────────────────────────────────────────────────

router.post('/events/:id/join', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('event_participants')
      .insert({
        event_id: req.params.id,
        user_id: req.user.email,
        joined_at: new Date().toISOString()
      });

    if (error?.code === '23505') {
      return res.json({ ok: true, already_joined: true });
    }
    if (error) return sendDbError(res, error);

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error joining event:', error);
    res.status(500).json({ error: 'Fehler beim Beitreten des Events' });
  }
});

router.post('/events/:id/leave', requireAuth, async (req, res) => {
  try {
    await supabase
      .from('event_participants')
      .delete()
      .eq('event_id', req.params.id)
      .eq('user_id', req.user.email);

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error leaving event:', error);
    res.status(500).json({ error: 'Fehler beim Verlassen des Events' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENT SUBMISSIONS & LEADERBOARDS
// ─────────────────────────────────────────────────────────────────────────────

router.post('/events/:id/submit', requireAuth, async (req, res) => {
  try {
    const { species, length_cm, weight_kg, photo_url, catch_time } = req.body || {};

    // Einreichungen nur für laufende Events: Nach dem Ende hätten nachträgliche
    // Einreichungen die bereits archivierten Endstände verändert.
    const { data: event } = await supabase
      .from('events')
      .select('id, status, is_active, start_date, end_date, target_species, requires_approval')
      .eq('id', req.params.id)
      .maybeSingle();
    const nowMs = Date.now();
    if (!event || event.is_active === false) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }
    if (event.status !== 'active'
      || (event.start_date && new Date(event.start_date).getTime() > nowMs)
      || (event.end_date && new Date(event.end_date).getTime() < nowMs)) {
      return res.status(409).json({ error: 'Das Event läuft derzeit nicht' });
    }

    // Dieselben Grenzen wie im Fangbuch (catches.js) — Punkte hängen an der
    // Länge, ungeprüfte Werte wären eine offene Tür für Fantasie-Einreichungen.
    const validated = validateCatchPayload(
      { species, length_cm, weight_kg, photo_url },
      { partial: true }
    );
    if (!validated.ok || !validated.value.species) {
      return res.status(400).json({ error: validated.ok ? 'Fischart (species) erforderlich' : validated.error });
    }
    const parsedCatchTime = catch_time ? new Date(catch_time) : new Date(nowMs);
    if (Number.isNaN(parsedCatchTime.getTime())) {
      return res.status(400).json({ error: 'catch_time ist kein gültiger Zeitpunkt' });
    }

    // Plausibilitätsprüfung: harte Verstöße ablehnen, Auffälligkeiten in die
    // Prüfung durch den Veranstalter schicken.
    const { data: recent } = await supabase
      .from('event_submissions')
      .select('species, length_cm, catch_time')
      .eq('event_id', req.params.id)
      .eq('user_id', req.user.email)
      .order('submitted_at', { ascending: false })
      .limit(20);
    const plausibility = checkSubmission(
      {
        species: validated.value.species,
        length_cm: validated.value.length_cm,
        weight_kg: validated.value.weight_kg,
        photo_url: validated.value.photo_url,
        catch_time: parsedCatchTime.toISOString(),
      },
      event,
      { now: nowMs, recent: Array.isArray(recent) ? recent.filter(isRealFish) : [] }
    );
    if (plausibility.blocked) {
      const reason = plausibility.checks.find(c => !c.ok && c.severity === 'block');
      return res.status(422).json({ error: reason?.message || 'Einreichung nicht plausibel', checks: plausibility.checks });
    }

    // 1. Berechne Punkte
    const pointsResult = await calculateSubmissionPoints(
      { species: validated.value.species, length_cm: validated.value.length_cm, community_likes: 0 },
      req.params.id,
      supabase
    );

    // 2. Erstelle Einreichung
    const { data: submission, error: submissionError } = await supabase
      .from('event_submissions')
      .insert({
        event_id: req.params.id,
        user_id: req.user.email,
        species: validated.value.species,
        length_cm: validated.value.length_cm,
        weight_kg: validated.value.weight_kg,
        photo_url: validated.value.photo_url || null,
        catch_time: parsedCatchTime.toISOString(),
        calculated_points: pointsResult.total,
        points_breakdown: pointsResult.breakdown,
        verified: !plausibility.needsReview,
        review_status: plausibility.needsReview ? 'pending' : 'confirmed',
        plausibility: plausibility.checks,
      })
      .select()
      .single();

    if (submissionError) return sendDbError(res, submissionError);

    // 3. Teilnehmer-Summen aus den (bestätigten) Einreichungen neu berechnen.
    //    Legt den Teilnehmer bei Bedarf an, sodass die Punkte nie verloren
    //    gehen, und vermeidet Lost-Updates bei parallelen Einreichungen.
    await recalcParticipantTotals(req.params.id, req.user.email, supabase);

    return res.status(201).json({ ...submission, checks: plausibility.checks });
  } catch (error) {
    console.error('Error submitting event entry:', error);
    res.status(500).json({ error: 'Fehler beim Einreichen der Einreichung' });
  }
});

router.get('/events/:id/participants', optionalAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_participants')
      .select('id, user_id, joined_at, submission_count, total_points, is_winner')
      .eq('event_id', req.params.id)
      .order('total_points', { ascending: false });

    if (error) return sendDbError(res, error);
    const names = await displayNames((data || []).map(p => p.user_id));
    return res.json((data || []).map(({ user_id, ...row }) => ({ ...row, ...publicPerson(user_id, names, req.user?.email) })));
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Teilnehmer' });
  }
});

router.get('/events/:id/leaderboard', optionalAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_participants')
      .select('id, user_id, joined_at, submission_count, total_points, is_winner')
      .eq('event_id', req.params.id)
      .order('total_points', { ascending: false })
      .limit(100);

    if (error) return sendDbError(res, error);
    const names = await displayNames((data || []).map(p => p.user_id));
    return res.json((data || []).map(({ user_id, ...row }) => ({ ...row, ...publicPerson(user_id, names, req.user?.email) })));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Leaderboards' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WETTBEWERB: WERTUNG, EIGENE EINREICHUNGEN, PRÜFUNG, EINSPRÜCHE
// ─────────────────────────────────────────────────────────────────────────────

// Rangliste nach Wertungskategorie. Zählt nur bestätigte Einreichungen.
router.get('/events/:id/standings', optionalAuth, async (req, res) => {
  try {
    const metric = STANDING_METRICS[req.query.metric] ? req.query.metric : 'total_length';
    const { data, error } = await supabase
      .from('event_submissions')
      .select('id, user_id, species, length_cm, photo_url, catch_time, calculated_points')
      .eq('event_id', req.params.id)
      .eq('review_status', 'confirmed')
      .limit(5000);
    if (error) return sendDbError(res, error);

    const byUser = new Map();
    for (const sub of data || []) {
      const entry = byUser.get(sub.user_id) || { user_id: sub.user_id, count: 0, total_length: 0, biggest: 0, points: 0, submissions: [] };
      entry.points += Number(sub.calculated_points) || 0;
      if (isRealFish(sub)) {
        const length = Number(sub.length_cm) || 0;
        entry.count += 1;
        entry.total_length += length;
        entry.biggest = Math.max(entry.biggest, length);
        entry.submissions.push({ id: sub.id, species: sub.species, length_cm: sub.length_cm, photo_url: sub.photo_url, catch_time: sub.catch_time });
      }
      byUser.set(sub.user_id, entry);
    }

    const names = await displayNames([...byUser.keys()]);
    const rows = [...byUser.values()]
      .filter(e => metric === 'points' || e.count > 0)
      .sort(STANDING_METRICS[metric])
      .slice(0, 100)
      .map(({ user_id, ...entry }, index) => ({
        rank: index + 1,
        ...publicPerson(user_id, names, req.user?.email),
        ...entry,
        total_length: Math.round(entry.total_length * 10) / 10,
        points: Math.round(entry.points),
        submissions: entry.submissions.sort((a, b) => (Number(b.length_cm) || 0) - (Number(a.length_cm) || 0)).slice(0, 10),
      }));
    return res.json({ metric, entries: rows });
  } catch (error) {
    console.error('Error fetching standings:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Rangliste' });
  }
});

// Eigene Einreichungen mit Prüfstatus (für "Meine Einreichungen").
router.get('/events/:id/my-submissions', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('event_submissions')
    .select('id, species, length_cm, weight_kg, photo_url, catch_time, submitted_at, calculated_points, review_status, plausibility, review_note')
    .eq('event_id', req.params.id)
    .eq('user_id', req.user.email)
    .order('submitted_at', { ascending: false })
    .limit(100);
  if (error) return sendDbError(res, error);
  return res.json((data || []).filter(isRealFish));
});

// Prüf-Warteschlange des Veranstalters: offene Einreichungen und Einsprüche.
router.get('/events/:id/review', requireAuth, async (req, res) => {
  const event = await loadOwnedEvent(req.params.id, req.user.email);
  if (!event) return res.status(403).json({ error: 'Nur der Veranstalter kann prüfen' });

  const [{ data: pending, error: pendingError }, { data: disputes, error: disputeError }] = await Promise.all([
    supabase.from('event_submissions')
      .select('id, user_id, species, length_cm, weight_kg, photo_url, catch_time, plausibility')
      .eq('event_id', req.params.id)
      .eq('review_status', 'pending')
      .order('submitted_at', { ascending: true })
      .limit(100),
    supabase.from('event_disputes')
      .select('id, submission_id, reporter, reason, created_at')
      .eq('event_id', req.params.id)
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(100),
  ]);
  if (pendingError || disputeError) return sendDbError(res, pendingError || disputeError);

  const disputedIds = [...new Set((disputes || []).map(d => d.submission_id))];
  let disputedSubs = [];
  if (disputedIds.length) {
    const { data, error } = await supabase.from('event_submissions')
      .select('id, user_id, species, length_cm, weight_kg, photo_url, catch_time, review_status')
      .in('id', disputedIds);
    if (error) return sendDbError(res, error);
    disputedSubs = data || [];
  }
  const subsById = new Map(disputedSubs.map(sub => [sub.id, sub]));
  const names = await displayNames([
    ...(pending || []).map(p => p.user_id),
    ...disputedSubs.map(sub => sub.user_id),
    ...(disputes || []).map(d => d.reporter),
  ]);
  const strip = ({ user_id, ...sub }) => ({ ...sub, angler: publicPerson(user_id, names, req.user.email).name });

  return res.json({
    pending: (pending || []).filter(isRealFish).map(strip),
    disputes: (disputes || []).map(({ reporter, ...dispute }) => ({
      ...dispute,
      reporter: publicPerson(reporter, names, req.user.email).name,
      submission: subsById.has(dispute.submission_id) ? strip(subsById.get(dispute.submission_id)) : null,
    })),
  });
});

router.post('/events/:id/submissions/:sid/review', requireAuth, async (req, res) => {
  const event = await loadOwnedEvent(req.params.id, req.user.email);
  if (!event) return res.status(403).json({ error: 'Nur der Veranstalter kann prüfen' });
  const { decision, note } = req.body || {};
  if (decision !== 'confirm' && decision !== 'reject') {
    return res.status(400).json({ error: "decision muss 'confirm' oder 'reject' sein" });
  }

  const { data: submission } = await supabase.from('event_submissions')
    .select('id, user_id').eq('id', req.params.sid).eq('event_id', req.params.id).maybeSingle();
  if (!submission) return res.status(404).json({ error: 'Einreichung nicht gefunden' });

  const confirmed = decision === 'confirm';
  const { error } = await supabase.from('event_submissions').update({
    review_status: confirmed ? 'confirmed' : 'rejected',
    verified: confirmed,
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.user.email,
    review_note: typeof note === 'string' ? note.trim().slice(0, 300) || null : null,
  }).eq('id', submission.id);
  if (error) return sendDbError(res, error);

  await recalcParticipantTotals(req.params.id, submission.user_id, supabase);
  return res.json({ ok: true, review_status: confirmed ? 'confirmed' : 'rejected' });
});

router.post('/events/:id/submissions/:sid/dispute', requireAuth, async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 10 || reason.length > 1000) {
    return res.status(400).json({ error: 'Bitte begründe den Einspruch (10 bis 1000 Zeichen).' });
  }

  const [{ data: submission }, { data: participant }] = await Promise.all([
    supabase.from('event_submissions').select('id, user_id, review_status')
      .eq('id', req.params.sid).eq('event_id', req.params.id).maybeSingle(),
    supabase.from('event_participants').select('id')
      .eq('event_id', req.params.id).eq('user_id', req.user.email).maybeSingle(),
  ]);
  if (!submission || !isRealFish(submission) || submission.review_status === 'rejected') {
    return res.status(404).json({ error: 'Einreichung nicht gefunden' });
  }
  if (!participant) return res.status(403).json({ error: 'Nur Teilnehmer können Einspruch einlegen' });
  if (submission.user_id === req.user.email) {
    return res.status(400).json({ error: 'Gegen den eigenen Fang ist kein Einspruch möglich' });
  }

  const { data, error } = await supabase.from('event_disputes').insert({
    event_id: req.params.id,
    submission_id: submission.id,
    reporter: req.user.email,
    reason,
  }).select('id, status, created_at').single();
  if (error?.code === '23505') return res.status(409).json({ error: 'Du hast gegen diesen Fang bereits Einspruch eingelegt' });
  if (error) return sendDbError(res, error);
  return res.status(201).json(data);
});

router.post('/events/:id/disputes/:did/resolve', requireAuth, async (req, res) => {
  const event = await loadOwnedEvent(req.params.id, req.user.email);
  if (!event) return res.status(403).json({ error: 'Nur der Veranstalter entscheidet über Einsprüche' });
  const { decision, resolution } = req.body || {};
  if (decision !== 'upheld' && decision !== 'dismissed') {
    return res.status(400).json({ error: "decision muss 'upheld' oder 'dismissed' sein" });
  }

  const { data: dispute } = await supabase.from('event_disputes')
    .select('id, submission_id, status').eq('id', req.params.did).eq('event_id', req.params.id).maybeSingle();
  if (!dispute) return res.status(404).json({ error: 'Einspruch nicht gefunden' });
  if (dispute.status !== 'open') return res.status(409).json({ error: 'Einspruch ist bereits entschieden' });

  const now = new Date().toISOString();
  const text = typeof resolution === 'string' ? resolution.trim().slice(0, 300) || null : null;
  const { error } = await supabase.from('event_disputes')
    .update({ status: decision, resolution: text, resolved_at: now })
    .eq('id', dispute.id);
  if (error) return sendDbError(res, error);

  if (decision === 'upheld') {
    const { data: submission } = await supabase.from('event_submissions')
      .select('id, user_id').eq('id', dispute.submission_id).maybeSingle();
    if (submission) {
      const { error: rejectError } = await supabase.from('event_submissions').update({
        review_status: 'rejected',
        verified: false,
        reviewed_at: now,
        reviewed_by: req.user.email,
        review_note: text || 'Einspruch stattgegeben',
      }).eq('id', submission.id);
      if (rejectError) return sendDbError(res, rejectError);
      await recalcParticipantTotals(req.params.id, submission.user_id, supabase);
    }
  }
  return res.json({ ok: true, status: decision });
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENT INVITATIONS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_INVITES_PER_REQUEST = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/events/:id/invite', requireAuth, async (req, res) => {
  try {
    const { invitee_emails } = req.body || {};

    if (!Array.isArray(invitee_emails) || invitee_emails.length === 0) {
      return res.status(400).json({ error: 'invitee_emails erforderlich' });
    }

    const emails = [...new Set(
      invitee_emails
        .filter((e) => typeof e === 'string')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_PATTERN.test(e) && e !== String(req.user.email).toLowerCase())
    )];
    if (emails.length === 0) {
      return res.status(400).json({ error: 'Keine gültigen E-Mail-Adressen' });
    }
    if (emails.length > MAX_INVITES_PER_REQUEST) {
      return res.status(400).json({ error: `Höchstens ${MAX_INVITES_PER_REQUEST} Einladungen pro Anfrage` });
    }

    // Einladen darf nur, wer selbst am (aktiven) Event teilnimmt — sonst
    // könnte jeder für beliebige Events Einladungen an Fremde verschicken.
    const { data: event } = await supabase
      .from('events')
      .select('id, is_active')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!event || event.is_active === false) {
      return res.status(404).json({ error: 'Event nicht gefunden' });
    }
    const { data: participant } = await supabase
      .from('event_participants')
      .select('id')
      .eq('event_id', req.params.id)
      .eq('user_id', req.user.email)
      .maybeSingle();
    if (!participant) {
      return res.status(403).json({ error: 'Nur Teilnehmer können einladen' });
    }

    // Supabase-Query-Builder sind nur thenable und haben kein .catch() — der
    // frühere .catch()-Aufruf warf einen TypeError, jede Einladung endete mit 500.
    const results = await Promise.all(
      emails.map((email) =>
        supabase
          .from('event_invitations')
          .insert({
            event_id: req.params.id,
            inviter_id: req.user.email,
            invitee_id: email,
            status: 'pending'
          })
          .select()
          .single()
      )
    );

    const invitations = results.filter((r) => !r.error && r.data).map((r) => r.data);
    const failed = results.filter((r) => r.error).length;
    return res.status(201).json({ invitations, failed });
  } catch (error) {
    console.error('Error sending invitations:', error);
    res.status(500).json({ error: 'Fehler beim Senden von Einladungen' });
  }
});

router.get('/events/invitations/me', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_invitations')
      .select('*, events(*)')
      .eq('invitee_id', req.user.email)
      .eq('status', 'pending')
      .order('sent_at', { ascending: false });

    if (error) return sendDbError(res, error);
    return res.json(data || []);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Fehler beim Laden von Einladungen' });
  }
});

router.post('/events/invitations/:id/accept', requireAuth, async (req, res) => {
  try {
    // 1. Lade Einladung mit User-Scoping
    const { data: invitation, error: fetchError } = await supabase
      .from('event_invitations')
      .select('id, event_id')
      .eq('id', req.params.id)
      .eq('invitee_id', req.user.email)
      .single();

    if (fetchError || !invitation) {
      return res.status(404).json({ error: 'Einladung nicht gefunden' });
    }

    // 2. Aktualisiere Einladungs-Status
    const { error: inviteError } = await supabase
      .from('event_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id)
      .eq('invitee_id', req.user.email);

    if (inviteError) return sendDbError(res, inviteError);

    // 3. Fuege User als Teilnehmer hinzu (Duplikate ignorieren)
    const { error: participantError } = await supabase
      .from('event_participants')
      .insert({
        event_id: invitation.event_id,
        user_id: req.user.email,
        joined_at: new Date().toISOString()
      });

    if (participantError && participantError.code !== '23505') {
      return sendDbError(res, participantError);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return res.status(500).json({ error: 'Fehler beim Akzeptieren der Einladung' });
  }
});

router.post('/events/invitations/:id/decline', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('event_invitations')
      .update({ status: 'declined' })
      .eq('id', req.params.id)
      .eq('invitee_id', req.user.email);

    if (error) return sendDbError(res, error);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error declining invitation:', error);
    res.status(500).json({ error: 'Fehler beim Ablehnen der Einladung' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY LEADERBOARDS & REWARDS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/leaderboards/monthly', optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    let year = parseInt(req.query.year) || now.getFullYear();
    let month = parseInt(req.query.month) || now.getMonth() + 1;

    // Validate ranges to prevent invalid queries
    if (year < 2000 || year > now.getFullYear() + 1) year = now.getFullYear();
    if (month < 1 || month > 12) month = now.getMonth() + 1;

    const { data, error } = await supabase
      .from('monthly_leaderboards')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .order('rank', { ascending: true })
      .limit(100);

    if (error) return sendDbError(res, error);
    return res.json(data || []);
  } catch (error) {
    console.error('Error fetching monthly leaderboard:', error);
    res.status(500).json({ error: 'Fehler beim Laden des monatlichen Leaderboards' });
  }
});

router.get('/rewards/my-activations', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reward_activations')
      .select('*')
      .eq('user_id', req.user.email)
      .eq('status', 'active');

    if (error) return sendDbError(res, error);
    return res.json(data || []);
  } catch (error) {
    console.error('Error fetching reward activations:', error);
    res.status(500).json({ error: 'Fehler beim Laden der aktivierten Rewards' });
  }
});

router.post('/rewards/claim', requireAuth, async (req, res) => {
  try {
    const { leaderboard_id } = req.body;

    if (!leaderboard_id) {
      return res.status(400).json({ error: 'leaderboard_id erforderlich' });
    }

    // Prüfe ob User der Gewinner ist
    const { data: leaderboard } = await supabase
      .from('monthly_leaderboards')
      .select('*')
      .eq('id', leaderboard_id)
      .eq('user_id', req.user.email)
      .eq('rank', 1)
      .single();

    if (!leaderboard) {
      return res.status(403).json({ error: 'Keine Berechtigung für diesen Reward' });
    }

    // Reward wurde bereits automatisch aktiviert
    const { data: activation, error } = await supabase
      .from('reward_activations')
      .select('*')
      .eq('user_id', req.user.email)
      .eq('leaderboard_id', leaderboard_id)
      .single();

    if (error || !activation) {
      return res.status(400).json({ error: 'Reward nicht verfügbar' });
    }

    return res.json(activation);
  } catch (error) {
    console.error('Error claiming reward:', error);
    res.status(500).json({ error: 'Fehler beim Beanspruchen des Rewards' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS (Cron Jobs)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/admin/leaderboards/monthly/generate', async (req, res) => {
  try {
    // Vercel Crons senden Authorization: Bearer <CRON_SECRET> Header
    const secret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY;
    if (!secret) {
      return res.status(500).json({ error: 'Cron-Secret nicht konfiguriert' });
    }
    const authHeader = req.headers.authorization || '';
    const headerSecret = authHeader.replace(/^Bearer\s+/, '').trim();
    const xApiKey = req.headers['x-api-key'] || '';

    const isAuthorized = headerSecret === secret || xApiKey === secret;
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

    const result = await aggregateMonthlyLeaderboard(year, month, supabase);

    return res.json({
      success: true,
      year,
      month,
      entries: result.length,
      leaderboard: result
    });
  } catch (error) {
    console.error('Error generating monthly leaderboard:', error);
    res.status(500).json({ error: 'Fehler beim Generieren des monatlichen Leaderboards' });
  }
});

router.get('/admin/rewards/auto-activate', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY;
    if (!secret) {
      return res.status(500).json({ error: 'Cron-Secret nicht konfiguriert' });
    }
    const authHeader = req.headers.authorization || '';
    const headerSecret = authHeader.replace(/^Bearer\s+/, '').trim();
    const xApiKey = req.headers['x-api-key'] || '';

    const isAuthorized = headerSecret === secret || xApiKey === secret;
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Auf den Vormonat ausrichten - analog zu /admin/leaderboards/monthly/generate,
    // das die pending Rewards fuer den abgeschlossenen Vormonat erzeugt.
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

    const activated = await autoActivateRewards(year, month, supabase);

    return res.json({
      success: true,
      activated_count: activated.length,
      activations: activated
    });
  } catch (error) {
    console.error('Error auto-activating rewards:', error);
    res.status(500).json({ error: 'Fehler beim automatischen Aktivieren von Rewards' });
  }
});

router.get('/admin/events/auto-archive', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY;
    if (!secret) {
      return res.status(500).json({ error: 'Cron-Secret nicht konfiguriert' });
    }
    const authHeader = req.headers.authorization || '';
    const headerSecret = authHeader.replace(/^Bearer\s+/, '').trim();
    const xApiKey = req.headers['x-api-key'] || '';

    const isAuthorized = headerSecret === secret || xApiKey === secret;
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const retentionDays = Number(process.env.EVENT_AUTO_DELETE_DAYS) || 3;

    // Schritt A: Finde alle gerade abgelaufenen, noch aktiven Events und archiviere sie
    const { data: expiredEvents, error: fetchError } = await supabase
      .from('events')
      .select('id')
      .eq('status', 'active')
      .lt('end_date', now.toISOString());

    if (fetchError) {
      return sendDbError(res, fetchError);
    }

    let archived = 0;

    for (const event of expiredEvents) {
      // Berechne finale Rankings
      await calculateEventFinalRankings(event.id, supabase);

      // Markiere als ended
      await supabase
        .from('events')
        .update({ status: 'ended' })
        .eq('id', event.id);

      archived++;
    }

    // Schritt B: Blende beendete Events nach Ablauf der Nachlauffrist aus der Liste aus.
    // Soft-Delete (is_active=false) statt Hard-Delete: Punkte-/Teilnehmer-Historie bleibt erhalten.
    const retentionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const { data: retiredEvents, error: retireFetchError } = await supabase
      .from('events')
      .select('id')
      .eq('status', 'ended')
      .eq('is_active', true)
      .lt('end_date', retentionCutoff.toISOString());

    if (retireFetchError) {
      return sendDbError(res, retireFetchError);
    }

    let deleted = 0;

    for (const event of retiredEvents) {
      await supabase
        .from('events')
        .update({ is_active: false })
        .eq('id', event.id);

      deleted++;
    }

    return res.json({
      success: true,
      archived_count: archived,
      deleted_count: deleted
    });
  } catch (error) {
    console.error('Error archiving events:', error);
    res.status(500).json({ error: 'Fehler beim Archivieren von Events' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY COMPETITION INTEGRATION (aus community.js)
// ─────────────────────────────────────────────────────────────────────────────

// Starte einen Wettbewerb aus vordefinierten Templates
router.post('/community/competitions/start', requireAuth, async (req, res) => {
  try {
    const { template_id } = req.body;

    if (!template_id) {
      return res.status(400).json({ error: 'template_id erforderlich' });
    }

    // Lade Template
    const { data: template, error: templateError } = await supabase
      .from('event_templates')
      .select('*')
      .eq('template_id', template_id)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template nicht gefunden' });
    }

    // Prüfe ob Event mit diesem Template schon existiert
    const now = new Date();
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('template_id', template_id)
      .eq('status', 'active')
      .gte('end_date', now.toISOString())
      .single();

    if (existing) {
      // Füge User als Teilnehmer hinzu
      await supabase
        .from('event_participants')
        .insert({
          event_id: existing.id,
          user_id: req.user.email
        });

      return res.json({ ok: true, joined: true, event_id: existing.id });
    }

    // Erstelle neues Event aus Template
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + (template.duration_days || 14));

    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        template_id: template_id,
        name: template.name,
        description: template.description,
        event_type: 'template',
        created_by: req.user.email,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        target_species: template.target_species,
        scoring_method: template.scoring_method,
        base_points: template.base_points,
        status: 'active',
        is_active: true
      })
      .select()
      .single();

    if (eventError) {
      return sendDbError(res, eventError);
    }

    // Erstelle Punkte-Config
    await supabase
      .from('event_point_configs')
      .insert({
        event_id: event.id,
        template_id: template_id,
        base_points: template.base_points,
        species_bonus: template.target_species ? { [template.target_species]: 50 } : {}
      });

    // Füge Creator als Teilnehmer hinzu
    await supabase
      .from('event_participants')
      .insert({
        event_id: event.id,
        user_id: req.user.email
      });

    return res.status(201).json({ ok: true, created: true, event });
  } catch (error) {
    console.error('Error starting competition:', error);
    res.status(500).json({ error: 'Fehler beim Starten des Wettbewerbs' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY TRACKING & POINTS (Trip Completions, AI Interactions)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/events/activities/track', requireAuth, async (req, res) => {
  try {
    const { activityType, eventId } = req.body;

    if (!activityType || !eventId) {
      return res.status(400).json({ error: 'activityType und eventId erforderlich' });
    }

    if (!ACTIVITY_POINTS[activityType]) {
      return res.status(400).json({ error: `Unbekannter Activity Type: ${activityType}` });
    }

    // Prüfe ob User am Event teilnimmt
    const { data: participant } = await supabase
      .from('event_participants')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', req.user.email)
      .single();

    if (!participant) {
      return res.status(403).json({ error: 'User ist nicht Teilnehmer des Events' });
    }

    // Anti-Farming: jede Aktivitaet zaehlt pro Event und User nur ein einziges
    // Mal. Verhindert beliebiges Hochfarmen von Punkten durch wiederholtes
    // Auslosen derselben Aktivitaet.
    const { count: alreadyCounted } = await supabase
      .from('event_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('user_id', req.user.email)
      .eq('species', `[${activityType}]`);

    if (alreadyCounted && alreadyCounted > 0) {
      return res.json({
        ok: true,
        awarded: false,
        message: 'Aktivitaet wurde fuer dieses Event bereits gezaehlt'
      });
    }

    // Addiere Punkte
    const result = await addActivityPoints(req.user.email, eventId, activityType, supabase);

    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }

    return res.json(result);
  } catch (error) {
    console.error('Error tracking activity:', error);
    res.status(500).json({ error: 'Fehler beim Tracken der Aktivität' });
  }
});

router.get('/events/activities/list', optionalAuth, async (req, res) => {
  try {
    return res.json(ACTIVITY_POINTS);
  } catch (error) {
    console.error('Error listing activities:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Aktivitäten' });
  }
});

// Get total points across ALL of the user's event participations
// (unabhaengig vom Event-Status: live, beendet oder geplant). So bleiben
// einmal erspielte Punkte dauerhaft im Header sichtbar.
router.get('/events/user/current-points', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Alle Teilnahmen des Users laden und Punkte aufsummieren
    const { data: participants } = await supabase
      .from('event_participants')
      .select('total_points, event_id')
      .eq('user_id', req.user.email);

    const total = participants
      ? participants.reduce((sum, p) => sum + (parseFloat(p.total_points) || 0), 0)
      : 0;

    // Anzahl der aktuell live laufenden Events (rein informativ fuer die UI)
    const { count: activeEventsCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .lte('start_date', nowIso)
      .gte('end_date', nowIso);

    return res.json({
      total_points: Math.round(total * 100) / 100,
      active_events: activeEventsCount || 0,
      participating_events: participants?.length || 0
    });
  } catch (error) {
    console.error('Error getting current points:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Punkte' });
  }
});

// Get active events with countdown
router.get('/events/user/active-event', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Finde das aktuell laufende (live) Event, das als naechstes endet
    const { data: activeEvent } = await supabase
      .from('events')
      .select('id, name, end_date, start_date')
      .eq('status', 'active')
      .lte('start_date', nowIso)
      .gt('end_date', nowIso)
      .order('end_date', { ascending: true })
      .limit(1)
      .single();

    if (!activeEvent) {
      return res.json({ active_event: null });
    }

    const endDate = new Date(activeEvent.end_date);
    const timeLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    return res.json({
      active_event: {
        id: activeEvent.id,
        name: activeEvent.name,
        days_left: timeLeft,
        hours_left: Math.ceil((endDate - now) / (1000 * 60 * 60)),
        end_date: activeEvent.end_date
      }
    });
  } catch (error) {
    console.error('Error getting active event:', error);
    res.status(500).json({ error: 'Fehler beim Laden des aktiven Events' });
  }
});

export default router;
