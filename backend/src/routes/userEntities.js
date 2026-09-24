import { Router } from 'express';
import { requireAuth, isAdminEmail } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { loadProfileDirectory, publicAuthor } from '../lib/publicProfiles.js';

const router = Router();

// Generische CRUD-Anbindung für user-eigene Entities (user_id = Supabase-Auth-UUID).
// Diese Tabellen existierten bereits, hatten aber keine Backend-Routen — die
// zugehörigen Frontend-Features (Gebrauchtmarkt, Funktions-Bewertungen,
// Köder-Rezepte) liefen daher ins Leere. Schreiboperationen sind immer auf den
// Eigentümer beschränkt; `publicRead` öffnet nur das Lesen (z. B. Marktplatz).

const RESERVED = new Set(['order', 'limit', 'offset']);
// Sortier-Whitelist: das Frontend sendet teils base44-Legacy-Order-Felder
// (z. B. -analyzed_at, -reviewed_at, -created_date), die es als Spalte nicht in
// jeder Tabelle gibt. created_at existiert überall und ist die zuverlässige
// Erstellungszeit; unbekannte Order-Spalten fallen darauf zurück (statt 500er).
const SAFE_SORT = new Set(['created_at', 'valid_until']);

const coerce = (v) => {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
};

// E-Mail-Spalten, die bei öffentlich lesbaren Entities aus FREMDEN Zeilen
// entfernt werden. Sonst las jeder angemeldete Nutzer über Gebrauchtmarkt,
// Bewertungen, Likes oder Tiefenkarten die Adressen aller anderen Nutzer aus.
const PRIVATE_EMAIL_COLS = ['user_email', 'created_by'];

const looksLikeEmail = (value) => typeof value === 'string' && value.includes('@');

// Manche Tabellen (voting_likes, von /community/voting/:id/like befüllt)
// tragen die E-Mail in user_id statt der Auth-UUID — Eigentum deshalb über
// beide Kennungen prüfen.
function isOwnRow(row, user) {
  if (!row || !user) return false;
  const email = String(user.email || '').toLowerCase();
  return row.user_id === user.id
    || (!!email && String(row.user_id || '').toLowerCase() === email)
    || (!!email && String(row.user_email || '').toLowerCase() === email);
}

function redactForeignEmails(row, user, keep) {
  if (!row || typeof row !== 'object') return row;
  const own = isOwnRow(row, user);
  const copy = { ...row, is_own: own };
  if (own) return copy;
  for (const col of PRIVATE_EMAIL_COLS) {
    if (!keep.has(col)) delete copy[col];
  }
  if (looksLikeEmail(copy.user_id)) delete copy.user_id;
  return copy;
}

// Optionen:
// - publicRead: alle angemeldeten Nutzer lesen alle Zeilen (fremde E-Mails
//   werden entfernt, außer den in `publicEmailCols` genannten Spalten).
// - adminRead: nur Admins lesen alle Zeilen; alle anderen nur die eigenen.
// - forceOwnerEmail: Spalten, die beim Schreiben immer auf die E-Mail des
//   angemeldeten Nutzers gesetzt werden (nicht vom Client wählbar).
function registerEntity(path, table, allowedFields, {
  publicRead = false,
  adminRead = false,
  readOnly = false,
  ownerEmailCols = ['user_email'],
  publicEmailCols = [],
  forceOwnerEmail = [],
} = {}) {
  const allow = new Set(allowedFields);
  const keepEmails = new Set(publicEmailCols);
  const readsAll = (req) => publicRead || (adminRead && isAdminEmail(req.user?.email));
  // Öffentlich lesbare Zeilen bekommen ein Autorenprofil (Name/Avatar) statt
  // der E-Mail-Adresse; eigene Zeilen behalten ihre Felder (is_own=true).
  const present = async (req, rows) => {
    if (!publicRead) return rows;
    const directory = await loadProfileDirectory();
    return rows.map((row) => {
      const email = row?.user_email || row?.created_by
        || (typeof row?.user_id === 'string' && row.user_id.includes('@') ? row.user_id : null);
      const out = redactForeignEmails(row, req.user, keepEmails);
      return out && typeof out === 'object' ? { ...out, author: publicAuthor(email, directory) } : out;
    });
  };

  const pack = (body = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(body)) {
      if (allow.has(k)) out[k] = v;
    }
    return out;
  };

  // LIST / FILTER
  router.get(path, requireAuth, async (req, res) => {
    try {
      let q = supabase.from(table).select('*');
      if (!readsAll(req)) q = q.eq('user_id', req.user.id);

      for (const [k, v] of Object.entries(req.query)) {
        if (RESERVED.has(k)) continue;
        if (allow.has(k)) q = q.eq(k, coerce(v));
      }

      const order = req.query.order ? String(req.query.order) : null;
      const col = order ? order.replace(/^-/, '') : null;
      if (col && (allow.has(col) || SAFE_SORT.has(col))) {
        q = q.order(col, { ascending: !order.startsWith('-') });
      } else {
        q = q.order('created_at', { ascending: false });
      }
      if (req.query.limit) q = q.limit(Math.min(Number(req.query.limit) || 50, 500));

      const { data, error } = await q;
      if (error) return sendDbError(res, error);
      return res.json(await present(req, data || []));
    } catch (e) {
      return sendDbError(res, e);
    }
  });

  // GET by id (private Entities: nur eigene)
  router.get(`${path}/:id`, requireAuth, async (req, res) => {
    let q = supabase.from(table).select('*').eq('id', req.params.id);
    if (!readsAll(req)) q = q.eq('user_id', req.user.id);
    const { data, error } = await q.single();
    if (error) return res.status(404).json({ error: 'Nicht gefunden' });
    return res.json((await present(req, [data]))[0]);
  });

  if (readOnly) return;

  // CREATE
  router.post(path, requireAuth, async (req, res) => {
    const row = { ...pack(req.body), user_id: req.user.id };
    for (const c of [...ownerEmailCols, ...forceOwnerEmail]) row[c] = req.user.email;
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) return sendDbError(res, error);
    return res.json(data);
  });

  // UPDATE (nur eigene). maybeSingle statt single: ein Update auf eine fremde
  // oder geloeschte ID trifft 0 Zeilen — mit single() wurde daraus ein 500er
  // ("Cannot coerce the result to a single JSON object") statt eines 404.
  router.patch(`${path}/:id`, requireAuth, async (req, res) => {
    const patch = pack(req.body);
    for (const c of forceOwnerEmail) if (c in patch) patch[c] = req.user.email;
    const { data, error } = await supabase.from(table)
      .update(patch)
      .eq('id', req.params.id).eq('user_id', req.user.id)
      .select().maybeSingle();
    if (error) return sendDbError(res, error);
    if (!data) return res.status(404).json({ error: 'Nicht gefunden' });
    return res.json(data);
  });

  // DELETE (nur eigene)
  router.delete(`${path}/:id`, requireAuth, async (req, res) => {
    const { error } = await supabase.from(table).delete()
      .eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) return sendDbError(res, error);
    return res.json({ ok: true });
  });
}

// Gebrauchtmarkt (UsedGear) — öffentlich lesbar, eigene Anzeigen verwaltbar.
registerEntity('/gear/listings', 'gear_listings', [
  'title', 'category', 'condition', 'price_cents', 'currency', 'negotiable',
  'location', 'shipping_available', 'description', 'image_urls', 'is_active', 'seller_email',
  // seller_email ist die öffentliche Kontaktadresse der Anzeige — immer die des
  // Verkäufers selbst, sonst ließen sich Anzeigen unter fremder Adresse schalten.
], { publicRead: true, publicEmailCols: ['seller_email'], forceOwnerEmail: ['seller_email'] });

// Funktions-Bewertungen — Auswertung (FunctionRatings.jsx) ist Admin-only;
// Nutzer sehen nur ihre eigenen Bewertungen.
registerEntity('/ratings', 'function_ratings', [
  'function_name', 'rating', 'comment',
], { adminRead: true });

// Köder-Rezepte (BaitMixerPro) — privat pro Nutzer.
registerEntity('/bait-recipes', 'bait_recipes', [
  'name', 'category', 'target_fish', 'ingredients', 'instructions',
  'total_percentage', 'attractiveness_score', 'estimated_cost', 'ai_generated', 'ai_analysis', 'is_public',
], { publicRead: false });

// Gewässer-Bewertungen (ReviewsList, MapView) — öffentlich lesbar.
registerEntity('/water-reviews', 'water_reviews', [
  'spot_id', 'rating', 'review',
], { publicRead: true });

// Wasseranalyse-Verlauf (MiniWaterAnalysis, WaterAnalysisMapLayer) — privat.
registerEntity('/water-analysis-history', 'water_analysis_history', [
  'spot_id', 'latitude', 'longitude', 'spot_name', 'analysis_data',
], { publicRead: false });

// Voting-Likes (VotingEventCard) — öffentlich lesbar (Anzahl/Status).
registerEntity('/voting-likes', 'voting_likes', [
  'submission_id',
], { publicRead: true });

// Bathymetrie-Karten (BathymetricCrowdsourcing) — öffentlich lesbar (Crowdsourcing).
registerEntity('/bathymetric-maps', 'bathymetric_maps', [
  'spot_id', 'name', 'map_data',
], { publicRead: true });

// Tiefendaten-Punkte (MyDepthDataList) — privat pro Nutzer.
registerEntity('/depth-data-points', 'depth_data_points', [
  'map_id', 'latitude', 'longitude', 'depth_m',
], { publicRead: false });

// Angelschein-Verwaltung (LicensesSection) — privat pro Nutzer.
registerEntity('/licenses', 'licenses', [
  'type', 'number', 'valid_from', 'valid_until', 'issuer', 'notes', 'photo_url',
], { publicRead: false });

// Community-Chat-Nachrichten (ChatWidget) — öffentlich im jeweiligen Topic.
// Als Absender rendert das UI das Autorenprofil (author), nicht die E-Mail.
registerEntity('/ai/messages', 'chat_messages', [
  'role', 'content', 'context',
], { publicRead: true, ownerEmailCols: ['created_by', 'user_email'] });

// Chat-Sessions / Online-Status (ChatWidget) — öffentlich lesbar (wer ist online).
registerEntity('/community/sessions', 'chat_sessions', [
  'user_email', 'user_name', 'last_activity', 'is_active',
], { publicRead: true, ownerEmailCols: ['user_email', 'created_by'] });

// Nutzungs-Sessions (Layout-Tracking) — privat pro Nutzer. user_id wird aus der
// Auth gesetzt; ein vom Frontend als user_id übergebener E-Mail-Wert wird
// ignoriert (nicht in der Whitelist) und die Ownership greift über die Auth-UUID.
registerEntity('/user/sessions', 'usage_sessions', [
  'session_id', 'feature_id', 'started_at', 'status', 'last_heartbeat', 'stopped_at',
], { publicRead: false });

// Premium-Wallet (Credits-Anzeige) — privat, nur lesen.
registerEntity('/premium/wallet', 'premium_wallets', [
  'credits',
], { publicRead: false, readOnly: true });

export default router;
