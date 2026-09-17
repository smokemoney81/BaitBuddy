import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';

const router = Router();

// Generisches Gear-Subsystem (GearV1). Strukturierte Felder liegen in data
// (jsonb); hier wird beim Lesen auf Top-Level abgeflacht und beim Schreiben
// wieder eingepackt. Ownership über created_by (E-Mail).

const META_COLS = new Set(['id', 'created_by', 'created_at', 'updated_date']);
const RESERVED_QUERY = new Set(['order', 'limit', 'offset']);
// data ist ein schemaloses jsonb-Feld — anders als bei userEntities.js gibt es
// hier keine feste Spalten-Allowlist. Stattdessen wird das Key-/Order-Format
// erzwungen, bevor es unverändert in `data->>${key}` interpoliert wird (sonst
// koennte ein Query-Key beliebige PostgREST-Filterausdruecke einschleusen).
const SAFE_KEY = /^[a-zA-Z0-9_]+$/;
const MAX_LIMIT = 500;

// DB-Zeile -> flaches Objekt fürs Frontend.
function flatten(row) {
  if (!row) return row;
  const { data, ...meta } = row;
  return { ...(data || {}), ...meta };
}

// Eingehender Payload -> { data } (Meta-Felder entfernt).
function pack(body = {}) {
  const data = {};
  for (const [k, v] of Object.entries(body)) {
    if (!META_COLS.has(k)) data[k] = v;
  }
  return data;
}

// "-updated_date" -> { column, ascending }. data-Felder werden als data->>feld
// sortiert.
function parseOrder(order) {
  if (!order) return null;
  const ascending = !order.startsWith('-');
  const field = order.replace(/^-/, '');
  if (field === 'updated_date' || field === 'created_at') {
    return { column: field, ascending };
  }
  if (!SAFE_KEY.test(field)) return null;
  return { column: `data->>${field}`, ascending };
}

function registerCrud(table, segment) {
  // LIST (+ Filter über beliebige data-Felder, order, limit)
  router.get(`/gear/${segment}`, requireAuth, async (req, res) => {
    let query = supabase.from(table).select('*').eq('created_by', req.user.email);

    for (const [key, value] of Object.entries(req.query)) {
      if (RESERVED_QUERY.has(key)) continue;
      if (!SAFE_KEY.test(key)) return res.status(400).json({ error: `Ungueltiger Filter-Key: ${key}` });
      query = query.eq(`data->>${key}`, String(value));
    }

    const order = parseOrder(req.query.order);
    if (order) query = query.order(order.column, { ascending: order.ascending });
    else query = query.order('updated_date', { ascending: false });

    if (req.query.limit) {
      const lim = Number(req.query.limit);
      if (Number.isFinite(lim) && lim > 0) query = query.limit(Math.min(lim, MAX_LIMIT));
    }

    const { data, error } = await query;
    if (error) return sendDbError(res, error);
    return res.json((data || []).map(flatten));
  });

  // GET by id
  router.get(`/gear/${segment}/:id`, requireAuth, async (req, res) => {
    const { data, error } = await supabase.from(table).select('*')
      .eq('id', req.params.id).eq('created_by', req.user.email).single();
    if (error) return sendDbError(res, error);
    return res.json(flatten(data));
  });

  // CREATE
  router.post(`/gear/${segment}`, requireAuth, async (req, res) => {
    const { data, error } = await supabase.from(table).insert({
      created_by: req.user.email, data: pack(req.body),
    }).select().single();
    if (error) return sendDbError(res, error);
    return res.json(flatten(data));
  });

  // BULK CREATE
  router.post(`/gear/${segment}/bulk`, requireAuth, async (req, res) => {
    const rows = Array.isArray(req.body) ? req.body : (req.body?.items || []);
    if (!rows.length) return res.json([]);
    const payload = rows.map((r) => ({ created_by: req.user.email, data: pack(r) }));
    const { data, error } = await supabase.from(table).insert(payload).select();
    if (error) return sendDbError(res, error);
    return res.json((data || []).map(flatten));
  });

  // UPDATE (data wird gemerged, damit Teil-Updates erhalten bleiben)
  router.patch(`/gear/${segment}/:id`, requireAuth, async (req, res) => {
    const { data: existing, error: readErr } = await supabase.from(table)
      .select('data').eq('id', req.params.id).eq('created_by', req.user.email).single();
    if (readErr) return sendDbError(res, readErr);

    const merged = { ...(existing?.data || {}), ...pack(req.body) };
    const { data, error } = await supabase.from(table)
      .update({ data: merged, updated_date: new Date().toISOString() })
      .eq('id', req.params.id).eq('created_by', req.user.email)
      .select().single();
    if (error) return sendDbError(res, error);
    return res.json(flatten(data));
  });

  // DELETE
  router.delete(`/gear/${segment}/:id`, requireAuth, async (req, res) => {
    const { error } = await supabase.from(table).delete()
      .eq('id', req.params.id).eq('created_by', req.user.email);
    if (error) return sendDbError(res, error);
    return res.json({ ok: true });
  });
}

registerCrud('gear_categories', 'categories');
registerCrud('gear_items', 'items');
registerCrud('gear_rules', 'rules');
registerCrud('loadouts', 'loadouts');
registerCrud('pack_sessions', 'sessions');

// ──────────────────────────────────────────────────────────────────────────────
// Wartungsprotokoll
// ──────────────────────────────────────────────────────────────────────────────

router.get('/gear/maintenance', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('gear_maintenance_log')
    .select('*')
    .eq('user_id', req.user.id)
    .order('performed_at', { ascending: false })
    .limit(200);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.post('/gear/maintenance', requireAuth, async (req, res) => {
  const { gear_item_id, gear_name, category, action, notes, next_due_at, trip_count_at_time } = req.body;
  if (!gear_item_id || !gear_name || !action) {
    return res.status(400).json({ error: 'gear_item_id, gear_name und action erforderlich' });
  }
  const { data, error } = await supabase
    .from('gear_maintenance_log')
    .insert({
      user_id: req.user.id,
      gear_item_id,
      gear_name,
      category: category || 'Sonstiges',
      action,
      notes: notes || null,
      next_due_at: next_due_at || null,
      trip_count_at_time: trip_count_at_time || 0,
    })
    .select()
    .single();
  if (error) return sendDbError(res, error);
  return res.status(201).json(data);
});

router.delete('/gear/maintenance/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('gear_maintenance_log')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

// Tripzähler
router.post('/gear/usage/increment', requireAuth, async (req, res) => {
  const { gear_item_id, gear_name } = req.body;
  if (!gear_item_id || !gear_name) return res.status(400).json({ error: 'gear_item_id und gear_name erforderlich' });

  const { data: existing } = await supabase
    .from('gear_trip_usage')
    .select('id, trip_count')
    .eq('user_id', req.user.id)
    .eq('gear_item_id', gear_item_id)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('gear_trip_usage')
      .update({ trip_count: (existing.trip_count || 0) + 1, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select().single();
    if (error) return sendDbError(res, error);
    return res.json(data);
  } else {
    const { data, error } = await supabase
      .from('gear_trip_usage')
      .insert({ user_id: req.user.id, gear_item_id, gear_name, trip_count: 1, last_used_at: new Date().toISOString() })
      .select().single();
    if (error) return sendDbError(res, error);
    return res.status(201).json(data);
  }
});

router.get('/gear/usage', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('gear_trip_usage')
    .select('*')
    .eq('user_id', req.user.id)
    .order('trip_count', { ascending: false });
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

export default router;
