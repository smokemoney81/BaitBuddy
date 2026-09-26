import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { listAllUsers } from '../lib/adminUsers.js';
import { resolvePlan } from '../lib/planResolver.js';
import { assignPlan } from '../lib/planAssignment.js';
import { getAppSettings, updateAppSettings } from '../lib/appSettings.js';
import { sendDbError } from '../lib/errorResponse.js';
import { getMailTransporter, mailFrom, supportEmail, escapeHtml, textToHtml } from '../lib/mailer.js';
import { isCreditSystemEnabled, TOPUP_PACKAGES } from '../lib/creditConfig.js';
import { mapPlanCodeToCreditPlan } from '../lib/planCreditMapping.js';

// Admin-Bereich des Superusers (Seite /Admin). Jede Route hier verlangt
// Anmeldung UND die Superuser-E-Mail (requireSuperuser, middleware/auth.js).
// Alle Schreibzugriffe laufen über den Service-Role-Client.
const router = Router();
router.use('/superadmin', requireAuth, requireSuperuser);

const TICKET_STATUSES = new Set(['offen', 'in_bearbeitung', 'geloest', 'geschlossen']);
const PAGE_SIZE = 1000; // PostgREST liefert standardmäßig höchstens 1000 Zeilen
const MAX_STAT_ROWS = 50000;
const MAIL_BATCH = 50;

// Express 4 reicht Fehler aus async-Handlern nicht weiter — ohne diesen
// Wrapper bliebe die Anfrage bei einer Ausnahme einfach hängen.
const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (e) {
    console.error('[superadmin]', req.method, req.path, e?.message || e);
    if (!res.headersSent) res.status(500).json({ error: 'Interner Fehler' });
  }
};

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// ── Statistik ───────────────────────────────────────────────────────────────
// Alles hier wird aus echten Zeilen gezählt. Kann eine Zahl nicht ermittelt
// werden (Tabelle fehlt, DB-Fehler), steht dort null — die Oberfläche zeigt
// dann „unbekannt“ statt einer erfundenen 0.
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_MINUTES = 180; // hängengebliebene Sitzungen nicht aufblähen
const STATS_TIMEZONE = 'Europe/Berlin';

function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // sv-SE formatiert als YYYY-MM-DD
  return d.toLocaleDateString('sv-SE', { timeZone: STATS_TIMEZONE });
}

async function countRows(table, apply) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) {
    console.warn(`[superadmin] Zählung ${table} fehlgeschlagen:`, error.message);
    return null;
  }
  return typeof count === 'number' ? count : null;
}

async function loadUsageRows(since) {
  const rows = [];
  for (let offset = 0; offset < MAX_STAT_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('usage_sessions')
      .select('feature_id, feature, user_id, status, started_at, stopped_at, last_heartbeat, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows, error };
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

function sessionMinutes(row) {
  const start = new Date(row.started_at || row.created_at).getTime();
  const end = new Date(row.stopped_at || row.last_heartbeat || NaN).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min((end - start) / 60000, MAX_SESSION_MINUTES);
}

// Reine Auswertung (ohne DB), damit sie direkt testbar ist.
export function summarizeUsage(rows, { days, now = Date.now() }) {
  const features = new Map();
  const pages = new Map();
  const daily = new Map();
  const activeUsers = new Set();
  let appSessions = 0;
  let appMinutes = 0;

  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    if (key) daily.set(key, { date: key, users: new Set(), sessions: 0 });
  }

  for (const row of rows) {
    const id = String(row.feature_id || row.feature || '');
    if (!id) continue;
    const user = row.user_id || null;
    if (user) activeUsers.add(user);

    const day = daily.get(dayKey(row.started_at || row.created_at));
    if (day && user) day.users.add(user);

    if (id.startsWith('page:')) {
      const page = id.slice(5);
      if (!page) continue;
      const entry = pages.get(page) || { page, views: 0, users: new Set() };
      entry.views += 1;
      if (user) entry.users.add(user);
      pages.set(page, entry);
      continue;
    }

    const minutes = sessionMinutes(row);
    if (id === 'app_general') {
      appSessions += 1;
      appMinutes += minutes;
      if (day) day.sessions += 1;
      continue;
    }

    const entry = features.get(id) || { feature: id, sessions: 0, users: new Set(), minutes: 0 };
    entry.sessions += 1;
    entry.minutes += minutes;
    if (user) entry.users.add(user);
    features.set(id, entry);
  }

  return {
    active_users: activeUsers.size,
    app_sessions: appSessions,
    app_minutes: Math.round(appMinutes),
    features: [...features.values()]
      .map(({ feature, sessions, users, minutes }) => ({ feature, sessions, users: users.size, minutes: Math.round(minutes) }))
      .sort((a, b) => b.sessions - a.sessions),
    pages: [...pages.values()]
      .map(({ page, views, users }) => ({ page, views, users: users.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 50),
    daily: [...daily.values()].map(({ date, users, sessions }) => ({ date, users: users.size, sessions })),
  };
}

export function summarizeUsers(users, { days, now = Date.now() }) {
  const since = now - days * DAY_MS;
  const week = now - 7 * DAY_MS;
  const plans = {};
  let newPeriod = 0;
  let new7 = 0;
  let activePeriod = 0;
  let active7 = 0;
  let neverSignedIn = 0;
  for (const u of users) {
    const created = new Date(u.created_at).getTime();
    const lastSeen = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : NaN;
    if (created >= since) newPeriod += 1;
    if (created >= week) new7 += 1;
    if (Number.isFinite(lastSeen)) {
      if (lastSeen >= since) activePeriod += 1;
      if (lastSeen >= week) active7 += 1;
    } else {
      neverSignedIn += 1;
    }
    const { effectiveId } = resolvePlan(u, new Date(now));
    plans[effectiveId] = (plans[effectiveId] || 0) + 1;
  }
  return {
    total: users.length,
    new_7d: new7,
    new_period: newPeriod,
    active_7d: active7,
    active_period: activePeriod,
    never_signed_in: neverSignedIn,
    plans,
  };
}

router.get('/superadmin/stats', safe(async (req, res) => {
  const days = clampInt(req.query.days, 30, 1, 365);
  const now = Date.now();
  const since = new Date(now - days * DAY_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const [usersResult, usageResult, content] = await Promise.all([
    listAllUsers(supabase),
    loadUsageRows(since),
    Promise.all([
      countRows('catches'),
      countRows('catches', (q) => q.gte('created_at', since)),
      countRows('spots'),
      countRows('community_posts'),
      countRows('community_comments'),
      countRows('fishing_plans'),
      countRows('water_analysis_history'),
      countRows('events', (q) => q.eq('status', 'active').eq('is_active', true).gt('end_date', nowIso)),
      countRows('events', (q) => q.eq('status', 'ended').eq('is_active', false)),
      countRows('event_participants'),
      countRows('support_tickets', (q) => q.in('status', ['offen', 'in_bearbeitung'])),
      countRows('support_tickets'),
    ]),
  ]);

  const [
    catchesTotal, catchesPeriod, spots, posts, comments, plans, waterAnalyses,
    eventsRunning, eventsArchived, participants, ticketsOpen, ticketsTotal,
  ] = content;

  return res.json({
    days,
    generated_at: nowIso,
    users: usersResult.error ? null : summarizeUsers(usersResult.users, { days, now }),
    usage: usageResult.error ? null : summarizeUsage(usageResult.rows, { days, now }),
    content: {
      catches_total: catchesTotal,
      catches_period: catchesPeriod,
      spots,
      community_posts: posts,
      community_comments: comments,
      fishing_plans: plans,
      water_analyses: waterAnalyses,
      events_running: eventsRunning,
      events_archived: eventsArchived,
      event_participants: participants,
      tickets_open: ticketsOpen,
      tickets_total: ticketsTotal,
    },
  });
}));

// ── Community ───────────────────────────────────────────────────────────────
router.get('/superadmin/community/posts', safe(async (req, res) => {
  const limit = clampInt(req.query.limit, 100, 1, 500);
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(0, limit - 1);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
}));

router.delete('/superadmin/community/posts/:id', safe(async (req, res) => {
  const id = req.params.id;
  // Abhängige Zeilen zuerst, damit keine verwaisten Kommentare/Likes bleiben.
  for (const table of ['community_comments', 'post_likes']) {
    const { error } = await supabase.from(table).delete().eq('post_id', id);
    if (error) return sendDbError(res, error);
  }
  const { error } = await supabase.from('community_posts').delete().eq('id', id);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
}));

// ── Events ──────────────────────────────────────────────────────────────────
router.get('/superadmin/events', safe(async (req, res) => {
  const limit = clampInt(req.query.limit, 200, 1, 500);
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .range(0, limit - 1);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
}));

// Löschen = ausblenden (auch aus dem Archiv). Kein Hard-Delete: Teilnehmer,
// Einreichungen und Punkte-Historie hängen am Event.
router.delete('/superadmin/events/:id', safe(async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .update({ status: 'deleted', is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();
  if (error) return sendDbError(res, error);
  if (!data) return res.status(404).json({ error: 'Event nicht gefunden' });
  return res.json({ ok: true });
}));

// Neu starten = neue Runde mit denselben Regeln ab jetzt, gleiche Laufzeit wie
// das Original. Das alte Event bleibt mit seiner Rangliste im Archiv erhalten.
router.post('/superadmin/events/:id/restart', safe(async (req, res) => {
  const { data: original, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return sendDbError(res, error);
  if (!original) return res.status(404).json({ error: 'Event nicht gefunden' });

  const oldStart = new Date(original.start_date || original.starts_at || original.created_at).getTime();
  const oldEnd = new Date(original.end_date || original.ends_at).getTime();
  const fallbackMs = 14 * 24 * 60 * 60 * 1000;
  const durationMs = Number.isFinite(oldStart) && Number.isFinite(oldEnd) && oldEnd > oldStart
    ? oldEnd - oldStart
    : fallbackMs;
  const start = new Date();
  const end = new Date(start.getTime() + durationMs);

  const { data: created, error: insertError } = await supabase
    .from('events')
    .insert({
      name: original.name || original.title || 'Event',
      description: original.description || '',
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      created_by: original.created_by,
      template_id: original.template_id || null,
      event_type: original.event_type || 'custom',
      scoring_method: original.scoring_method || 'points',
      target_species: original.target_species || null,
      prize_description: original.prize_description || null,
      visibility: original.visibility || 'public',
      requires_approval: original.requires_approval === true,
      ...(original.club_id ? { club_id: original.club_id } : {}),
      status: 'active',
      is_active: true,
    })
    .select()
    .single();
  if (insertError || !created) return sendDbError(res, insertError || new Error('Event konnte nicht angelegt werden'));

  // Punkte-Regeln übernehmen (ohne id/event_id des alten Events).
  const { data: config } = await supabase
    .from('event_point_configs')
    .select('*')
    .eq('event_id', original.id)
    .maybeSingle();
  if (config) {
    const { id: _id, event_id: _eventId, created_at: _createdAt, updated_at: _updatedAt, ...rules } = config;
    const { error: configError } = await supabase
      .from('event_point_configs')
      .insert({ ...rules, event_id: created.id });
    if (configError) console.warn('[superadmin] Punkte-Regeln nicht übernommen:', configError.message);
  }

  if (original.created_by) {
    const { error: participantError } = await supabase
      .from('event_participants')
      .insert({ event_id: created.id, user_id: original.created_by, joined_at: start.toISOString() });
    if (participantError) console.warn('[superadmin] Ersteller nicht als Teilnehmer eingetragen:', participantError.message);
  }

  return res.status(201).json(created);
}));

// ── Support-Tickets ─────────────────────────────────────────────────────────
router.get('/superadmin/tickets', safe(async (req, res) => {
  let q = supabase.from('support_tickets').select('*');
  if (req.query.status && TICKET_STATUSES.has(String(req.query.status))) {
    q = q.eq('status', String(req.query.status));
  }
  const { data, error } = await q.order('created_date', { ascending: false }).range(0, 499);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
}));

router.patch('/superadmin/tickets/:id', safe(async (req, res) => {
  const { status, admin_response: adminResponse, notify = true } = req.body || {};
  const patch = {};
  if (status !== undefined) {
    if (!TICKET_STATUSES.has(status)) return res.status(400).json({ error: 'Unbekannter Status' });
    patch.status = status;
  }
  if (adminResponse !== undefined) {
    if (typeof adminResponse !== 'string' || adminResponse.length > 10000) {
      return res.status(400).json({ error: 'Antwort muss Text mit höchstens 10.000 Zeichen sein' });
    }
    patch.admin_response = adminResponse.trim();
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nichts zu ändern' });
  patch.updated_date = new Date().toISOString();

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();
  if (error) return sendDbError(res, error);
  if (!ticket) return res.status(404).json({ error: 'Ticket nicht gefunden' });

  // Antwort per E-Mail an den Nutzer. Das Ticket ist schon gespeichert — ein
  // Mail-Fehler macht die Bearbeitung nicht rückgängig, wird aber gemeldet.
  let emailed = false;
  let emailError = null;
  if (notify !== false && patch.admin_response) {
    const transporter = getMailTransporter();
    if (!transporter) {
      emailError = 'SMTP nicht konfiguriert';
    } else {
      try {
        await transporter.sendMail({
          from: mailFrom(),
          to: ticket.user_email,
          replyTo: supportEmail(),
          subject: `Antwort auf dein Ticket: ${ticket.subject}`,
          html: `
            <p>Hallo ${escapeHtml(ticket.user_name || '')},</p>
            <p>auf dein Support-Ticket „${escapeHtml(ticket.subject)}“ gibt es eine Antwort:</p>
            <hr />
            ${textToHtml(patch.admin_response)}
            <hr />
            <p>Du kannst direkt auf diese E-Mail antworten.</p>
            <p>Viele Grüße,<br />das BaitBuddy-Team</p>
          `,
        });
        emailed = true;
      } catch (e) {
        emailError = e.message;
        console.error('[superadmin] Ticket-Antwort nicht versendet:', e.message);
      }
    }
  }

  return res.json({ ticket, emailed, email_error: emailError });
}));

router.delete('/superadmin/tickets/:id', safe(async (req, res) => {
  const { error } = await supabase.from('support_tickets').delete().eq('id', req.params.id);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
}));

// ── Rundmail an alle Nutzer ─────────────────────────────────────────────────
function mailRecipients(users) {
  const seen = new Set();
  const out = [];
  for (const u of users) {
    const email = typeof u?.email === 'string' ? u.email.trim() : '';
    if (!email || !email.includes('@')) continue;
    if (u.banned_until && new Date(u.banned_until).getTime() > Date.now()) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

// ── Nutzer & Pläne ──────────────────────────────────────────────────────────
// Alle Konten mit Anmeldedaten und dem Plan, der gerade tatsächlich gilt
// (resolvePlan: Abo, Trial oder Pass). Daneben steht der gespeicherte Abo-Plan,
// damit sichtbar ist, warum ein Nutzer z. B. trotz Basic-Abo Ultimate hat.
// Bewusst schmal: keine Tokens, Identitäten oder rohen Metadaten.
function toSuperadminUser(user, now) {
  const meta = user.user_metadata || {};
  const app = user.app_metadata || {};
  const plan = resolvePlan(user, now);
  const providers = Array.isArray(app.providers) && app.providers.length
    ? app.providers
    : (app.provider ? [app.provider] : []);
  return {
    id: user.id,
    email: user.email || '',
    full_name: meta.full_name || meta.nickname || '',
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    email_confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
    providers,
    plan: {
      id: plan.effectiveId,
      source: plan.source,
      expires_at: plan.expiresAt,
    },
    subscription: {
      id: app.premium_plan_id || 'free',
      expires_at: app.premium_expires_at || null,
      payment_method: app.premium_payment_method || null,
      assigned_by: app.premium_assigned_by || null,
    },
  };
}

function byLastSignIn(a, b) {
  // Zuletzt angemeldete zuerst, nie angemeldete ans Ende (nach Registrierung).
  const la = a.last_sign_in_at || '';
  const lb = b.last_sign_in_at || '';
  if (la !== lb) return lb.localeCompare(la);
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

router.get('/superadmin/users', safe(async (req, res) => {
  const { users, error } = await listAllUsers(supabase);
  if (error) return sendDbError(res, error);
  const now = new Date();
  const list = users.map((u) => toSuperadminUser(u, now)).sort(byLastSignIn);
  return res.json({ total: list.length, users: list });
}));

router.post('/superadmin/users/:id/plan', safe(async (req, res) => {
  const { plan_id, duration_days } = req.body || {};
  const result = await assignPlan({
    targetUserId: req.params.id,
    planId: plan_id,
    durationDays: duration_days,
    assignedBy: req.user.email,
  });
  if (result.error) return sendDbError(res, result.error);
  if (result.status !== 200) return res.status(result.status).json(result.body);
  return res.json({ ...result.body, user: toSuperadminUser(result.user, new Date()) });
}));

// ── App-Schalter ────────────────────────────────────────────────────────────
// Werbung an/aus und „alle Tools kostenlos“ für alle Nutzer (lib/appSettings.js).
router.get('/superadmin/settings', safe(async (req, res) => {
  return res.json(await getAppSettings({ fresh: true }));
}));

router.patch('/superadmin/settings', safe(async (req, res) => {
  const patch = {};
  for (const key of ['ads_enabled', 'all_tools_free']) {
    if (key in (req.body || {})) {
      if (typeof req.body[key] !== 'boolean') return res.status(400).json({ error: `${key} muss true oder false sein` });
      patch[key] = req.body[key];
    }
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Keine Einstellung angegeben' });
  const { settings, error } = await updateAppSettings(patch, req.user.email);
  if (error) {
    console.error('[superadmin] Einstellungen speichern fehlgeschlagen:', error.message || error);
    return res.status(503).json({ error: 'Einstellungen konnten nicht gespeichert werden (Tabelle app_config fehlt? Migrationen prüfen).' });
  }
  console.log(`[superadmin] ${req.user.email} setzt App-Schalter`, patch);
  return res.json(settings);
}));

router.get('/superadmin/mail/status', safe(async (req, res) => {
  const { users, error } = await listAllUsers(supabase);
  if (error) return sendDbError(res, error);
  return res.json({
    smtp_configured: Boolean(getMailTransporter()),
    recipients: mailRecipients(users).length,
    reply_to: supportEmail(),
  });
}));

router.post('/superadmin/mail/broadcast', safe(async (req, res) => {
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!subject || subject.length > 200) return res.status(400).json({ error: 'Betreff fehlt oder ist länger als 200 Zeichen' });
  if (!message || message.length > 20000) return res.status(400).json({ error: 'Nachricht fehlt oder ist länger als 20.000 Zeichen' });

  const transporter = getMailTransporter();
  if (!transporter) {
    return res.status(503).json({ error: 'E-Mail-Versand ist nicht eingerichtet (SMTP_HOST, SMTP_USER, SMTP_PASSWORD fehlen).' });
  }

  const { users, error } = await listAllUsers(supabase);
  if (error) return sendDbError(res, error);
  const recipients = mailRecipients(users);
  if (recipients.length === 0) return res.status(400).json({ error: 'Keine Empfänger gefunden' });

  const html = `${textToHtml(message)}
    <hr />
    <p style="font-size:12px;color:#666">Du erhältst diese Nachricht als registrierter Nutzer von BaitBuddy.</p>`;

  // Empfänger nur in BCC: kein Nutzer sieht die Adressen der anderen.
  let sent = 0;
  const failed = [];
  for (let i = 0; i < recipients.length; i += MAIL_BATCH) {
    const batch = recipients.slice(i, i + MAIL_BATCH);
    try {
      await transporter.sendMail({
        from: mailFrom(),
        to: supportEmail(),
        bcc: batch,
        replyTo: supportEmail(),
        subject,
        text: message,
        html,
      });
      sent += batch.length;
    } catch (e) {
      console.error('[superadmin] Rundmail-Batch fehlgeschlagen:', e.message);
      failed.push(...batch);
    }
  }

  return res.status(failed.length && !sent ? 502 : 200).json({
    recipients: recipients.length,
    sent,
    failed: failed.length,
  });
}));

// ── Credit-System (neues Abo/Guthaben, Teilauftrag 3) ───────────────────────
// Nur echte, aus den Teilauftrag-1-Tabellen aggregierte Zahlen — siehe Auftrag
// Abschnitt 4. Ohne AI_CREDIT_SYSTEM_ENABLED sind beide Routen 404, weil es
// dann keine Credit-Daten gibt, die eine Admin-Ansicht sinnvoll füllen könnten.
const VISION_FEATURES = new Set(['vision', 'analyze-photo', 'analyze-catch', 'recognize-gear']);
const VOICE_FEATURES = new Set(['tts', 'realtime-session']);
const SATELLITE_FEATURES = new Set(['satellite-analysis']);

function creditPlanDisplayName(code) {
  return { free: 'Free', basic: 'Basic', premium: 'Premium' }[code] || code;
}

router.get('/superadmin/credits/users', safe(async (req, res) => {
  if (!isCreditSystemEnabled()) return res.status(404).json({ error: 'Credit-System nicht aktiv' });

  const page = clampInt(req.query.page, 1, 1, 100000);
  const pageSize = clampInt(req.query.page_size, 50, 1, 200);

  const { users, error } = await listAllUsers(supabase);
  if (error) return sendDbError(res, error);

  const now = new Date();
  const sorted = users
    .map((u) => ({ user: u, plan: resolvePlan(u, now) }))
    .sort((a, b) => new Date(b.user.last_sign_in_at || 0) - new Date(a.user.last_sign_in_at || 0));
  const total = sorted.length;
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const userIds = pageRows.map((r) => r.user.id);

  if (userIds.length === 0) {
    return res.json({ total, page, page_size: pageSize, users: [] });
  }

  // Aktuelle Wallet je Nutzer: jüngste Zeile je user_id (Perioden können sich
  // theoretisch überschneiden — dieselbe Regel wie getCurrentWallet).
  const [{ data: wallets, error: walletsErr }, { data: costs, error: costsErr }] = await Promise.all([
    supabase.from('credit_wallets').select('*').in('user_id', userIds)
      .lte('billing_period_start', now.toISOString()).gt('billing_period_end', now.toISOString())
      .order('billing_period_start', { ascending: false }),
    supabase.from('provider_cost_periods').select('*').in('user_id', userIds)
      .lte('period_start', now.toISOString()).gt('period_end', now.toISOString())
      .order('period_start', { ascending: false }),
  ]);
  if (walletsErr) return sendDbError(res, walletsErr);
  if (costsErr) return sendDbError(res, costsErr);

  const walletByUser = new Map();
  for (const w of wallets || []) if (!walletByUser.has(w.user_id)) walletByUser.set(w.user_id, w);
  const costByUser = new Map();
  for (const c of costs || []) if (!costByUser.has(c.user_id)) costByUser.set(c.user_id, c);

  // ai_usage-Zeilen der Nutzer im jeweils aktuellen Zeitraum. Ein gemeinsames
  // Zeitfenster (älteste Periodenstart bis jetzt) reicht für diese Zusammenfassung
  // und vermeidet N Einzelabfragen; die Feineinteilung passiert unten in JS.
  let usageRows = [];
  const earliestStart = [...walletByUser.values()].reduce((min, w) => {
    const t = new Date(w.billing_period_start).getTime();
    return Number.isFinite(t) && t < min ? t : min;
  }, now.getTime());
  const { data: usage, error: usageErr } = await supabase
    .from('ai_usage')
    .select('user_id, feature, voice_seconds, created_at, status')
    .in('user_id', userIds)
    .gte('created_at', new Date(earliestStart).toISOString())
    .eq('status', 'finalized');
  if (usageErr) {
    console.warn('[superadmin] ai_usage laden fehlgeschlagen:', usageErr.message);
  } else {
    usageRows = usage || [];
  }

  const result = pageRows.map(({ user, plan }) => {
    const wallet = walletByUser.get(user.id) || null;
    const cost = costByUser.get(user.id) || null;
    const creditPlan = mapPlanCodeToCreditPlan(plan.effectiveId);
    const periodStart = wallet ? new Date(wallet.billing_period_start).getTime() : null;
    const rows = periodStart != null
      ? usageRows.filter((r) => r.user_id === user.id && new Date(r.created_at).getTime() >= periodStart)
      : [];
    const voiceSeconds = rows.filter((r) => VOICE_FEATURES.has(r.feature))
      .reduce((sum, r) => sum + (Number(r.voice_seconds) || 0), 0);

    const totalCredits = wallet
      ? (wallet.included_credits || 0) + (wallet.bonus_credits || 0) + (wallet.purchased_credits || 0)
      : null;

    return {
      id: user.id,
      email: user.email,
      plan: creditPlan,
      plan_name: creditPlanDisplayName(creditPlan),
      billing_period_start: wallet?.billing_period_start || null,
      billing_period_end: wallet?.billing_period_end || null,
      credits_total: totalCredits,
      credits_used: wallet?.used_credits ?? null,
      credits_remaining: totalCredits != null && wallet ? Math.max(totalCredits - (wallet.used_credits || 0), 0) : null,
      provider_cost_eur: cost ? Number(cost.cost_eur) : null,
      cost_limit_eur: cost ? Number(cost.cost_limit_eur) : null,
      cost_limit_ratio: cost && cost.cost_limit_eur > 0 ? Number(cost.cost_eur) / Number(cost.cost_limit_eur) : null,
      ai_requests: rows.length,
      voice_minutes: Math.round((voiceSeconds / 60) * 10) / 10,
      vision_requests: rows.filter((r) => VISION_FEATURES.has(r.feature)).length,
      satellite_analyses: rows.filter((r) => SATELLITE_FEATURES.has(r.feature)).length,
    };
  });

  return res.json({ total, page, page_size: pageSize, users: result });
}));

router.get('/superadmin/credits/stats', safe(async (req, res) => {
  if (!isCreditSystemEnabled()) return res.status(404).json({ error: 'Credit-System nicht aktiv' });

  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const [{ data: usageRows, error: usageErr }, { data: txRows, error: txErr }] = await Promise.all([
    supabase.from('ai_usage')
      .select('feature, actual_cost_eur, estimated_cost_eur, created_at, status')
      .gte('created_at', since)
      .range(0, MAX_STAT_ROWS - 1),
    supabase.from('credit_transactions')
      .select('type, amount, created_at')
      .gte('created_at', since)
      .range(0, MAX_STAT_ROWS - 1),
  ]);
  if (usageErr) return sendDbError(res, usageErr);
  if (txErr) return sendDbError(res, txErr);

  const finalized = (usageRows || []).filter((r) => r.status === 'finalized');

  // Tägliche Kosten der letzten 30 Tage (echte Anbieterkosten, nicht Schätzung).
  const dailyCost = new Map();
  const costByFeature = new Map();
  for (const row of finalized) {
    const day = dayKey(row.created_at);
    const cost = Number(row.actual_cost_eur ?? row.estimated_cost_eur) || 0;
    if (day) dailyCost.set(day, (dailyCost.get(day) || 0) + cost);
    costByFeature.set(row.feature, (costByFeature.get(row.feature) || 0) + cost);
  }
  const dailyCostSeries = [...dailyCost.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, cost_eur]) => ({ day, cost_eur: Math.round(cost_eur * 10000) / 10000 }));
  const costByFeatureList = [...costByFeature.entries()]
    .map(([feature, cost_eur]) => ({ feature, cost_eur: Math.round(cost_eur * 10000) / 10000 }))
    .sort((a, b) => b.cost_eur - a.cost_eur);

  const creditsSold = (txRows || []).filter((t) => t.type === 'topup').reduce((s, t) => s + t.amount, 0);
  const creditsUsed = (txRows || []).filter((t) => t.type === 'usage').reduce((s, t) => s + Math.abs(t.amount), 0);

  // Umsatz aus Topups: Preis pro Credits-Betrag aus TOPUP_PACKAGES zurückgerechnet
  // (Topup-Transaktionen speichern den Credits-Betrag, nicht den Preis direkt).
  const priceByCredits = new Map(TOPUP_PACKAGES.map((p) => [p.credits, p.priceCents]));
  const topupRevenueCents = (txRows || [])
    .filter((t) => t.type === 'topup')
    .reduce((sum, t) => sum + (priceByCredits.get(t.amount) || 0), 0);

  // Kosten pro Plan: benötigt eine Plan-Historie (welchen Plan hatte der Nutzer
  // zum Zeitpunkt der Nutzung) — die gibt es nicht, `resolvePlan` liefert nur
  // den AKTUELLEN Plan. Bewusst nicht umgesetzt, siehe Bericht/Doku statt einer
  // erfundenen Zuordnung. Kosten pro Feature (oben) ist der ehrliche Ersatz.

  // Warnungen: Nutzer über 80%/90% ihres internen Kostenlimits in der aktuellen Periode.
  const nowIso = new Date().toISOString();
  const { data: costPeriods, error: costPeriodsErr } = await supabase
    .from('provider_cost_periods')
    .select('user_id, cost_eur, cost_limit_eur')
    .lte('period_start', nowIso).gt('period_end', nowIso)
    .range(0, MAX_STAT_ROWS - 1);
  const warnings = { over_80_percent: 0, over_90_percent: 0 };
  if (!costPeriodsErr) {
    for (const row of costPeriods || []) {
      const limit = Number(row.cost_limit_eur);
      if (!(limit > 0)) continue;
      const ratio = Number(row.cost_eur) / limit;
      if (ratio > 0.9) warnings.over_90_percent += 1;
      else if (ratio > 0.8) warnings.over_80_percent += 1;
    }
  } else {
    console.warn('[superadmin] provider_cost_periods laden fehlgeschlagen:', costPeriodsErr.message);
  }

  return res.json({
    daily_cost_eur: dailyCostSeries,
    cost_by_feature_eur: costByFeatureList,
    cost_by_plan_note: 'Nicht umgesetzt: benötigt eine Plan-Historie je Nutzung, die aktuell nicht gespeichert wird.',
    credits_sold: creditsSold,
    credits_used: creditsUsed,
    topup_revenue_eur: Math.round(topupRevenueCents) / 100,
    warnings,
    abuse_detection_note: 'Keine dedizierte Missbrauchserkennung umgesetzt (siehe Dokumentation) — nur die Cost-Limit-Warnungen oben.',
  });
}));

export default router;
