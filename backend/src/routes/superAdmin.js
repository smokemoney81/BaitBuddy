import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireSuperuser } from '../middleware/auth.js';
import { listAllUsers } from '../lib/adminUsers.js';
import { sendDbError } from '../lib/errorResponse.js';
import { getMailTransporter, mailFrom, supportEmail, escapeHtml, textToHtml } from '../lib/mailer.js';

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

// ── Statistik: meistgenutzte Tools ──────────────────────────────────────────
// Grundlage sind die Seitenaufrufe, die PageViewTracker als usage_sessions
// (status='view', feature_id='page:<Route>') speichert. Das Backend zählt pro
// Seite; welche Seite ein Tool ist, entscheidet das Frontend über die
// Tool-Registry (src/lib/toolRegistry.ts), die es im Backend-Image nicht gibt.
router.get('/superadmin/stats/tools', safe(async (req, res) => {
  const days = clampInt(req.query.days, 30, 1, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const perPage = new Map();
  let rows = 0;
  for (let offset = 0; offset < MAX_STAT_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('usage_sessions')
      .select('feature_id, user_id')
      .eq('status', 'view')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return sendDbError(res, error);

    const batch = Array.isArray(data) ? data : [];
    for (const row of batch) {
      const id = String(row.feature_id || '');
      if (!id.startsWith('page:')) continue;
      const page = id.slice(5);
      if (!page) continue;
      const entry = perPage.get(page) || { page, views: 0, users: new Set() };
      entry.views += 1;
      if (row.user_id) entry.users.add(row.user_id);
      perPage.set(page, entry);
      rows += 1;
    }
    if (batch.length < PAGE_SIZE) break;
  }

  const pages = [...perPage.values()]
    .map(({ page, views, users }) => ({ page, views, users: users.size }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 100);

  return res.json({ days, total_views: rows, pages });
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

export default router;
