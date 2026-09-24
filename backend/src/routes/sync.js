import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { validateCatchPayload } from './catches.js';
import { parseCoordinates } from '../lib/coordinates.js';

const router = Router();

const CATCH_FIELDS = ['species', 'length_cm', 'weight_kg', 'bait_used', 'notes', 'photo_url', 'is_released', 'spot_id', 'catch_time'];
const SPOT_FIELDS = ['name', 'latitude', 'longitude', 'water_type', 'notes', 'photo_url', 'is_favorite', 'depth_meters'];
const WATER_SCENE_FIELDS = ['spot_id', 'latitude', 'longitude', 'quality', 'sample_count', 'temperature_profile', 'size_bytes', 'source', 'captured_at'];

const ENTITIES = {
  catches: { table: 'catches', fields: CATCH_FIELDS },
  spots: { table: 'spots', fields: SPOT_FIELDS },
  water_scenes: { table: 'water_scenes', fields: WATER_SCENE_FIELDS, priority: 'low' },
};

const OPS = new Set(['insert', 'update', 'delete']);

// Dieselben Prüfungen wie die direkten Routen (POST/PATCH /catches, /spots).
// Ohne sie landeten über die Offline-Queue Fänge ohne Art, negative Maße oder
// Spots mit Koordinaten wie "999" in der Datenbank.
function validatePayload(entityName, payload, { partial }) {
  if (entityName === 'catches') {
    return validateCatchPayload(payload, { partial });
  }
  if (entityName === 'spots' && (!partial || 'latitude' in payload || 'longitude' in payload)) {
    const coords = parseCoordinates(payload.latitude, payload.longitude);
    if (!coords.ok) return { ok: false, error: coords.error };
    return { ok: true, value: { ...payload, latitude: coords.latitude, longitude: coords.longitude } };
  }
  return { ok: true, value: payload };
}

function pick(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

router.get('/sync/status', requireAuth, async (req, res) => {
  return res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    user: req.user.email,
  });
});

router.get('/sync/pending', requireAuth, async (req, res) => {
  return res.json({
    items: [],
    serverTime: new Date().toISOString(),
  });
});

async function applyItem(req, item) {
  const entity = ENTITIES[item.entity];
  if (!entity) {
    return { ok: false, clientId: item.clientId, error: `Unbekannte Entität: ${item.entity}` };
  }
  if (!OPS.has(item.op)) {
    return { ok: false, clientId: item.clientId, error: `Ungültige Operation: ${item.op}` };
  }
  const email = req.user.email;
  try {
    if (item.op === 'insert') {
      const picked = pick(item.payload, entity.fields);
      if (entity.table === 'catches' && !picked.catch_time && item.createdAt) {
        picked.catch_time = item.createdAt;
      }
      const validated = validatePayload(item.entity, picked, { partial: false });
      if (!validated.ok) return { ok: false, clientId: item.clientId, error: validated.error };
      const row = { ...validated.value, created_by: email };
      const { data, error } = await supabase.from(entity.table).insert(row).select().single();
      if (error) { console.error('[Sync insert]', error.message); return { ok: false, clientId: item.clientId, error: 'Speichern fehlgeschlagen' }; }
      return { ok: true, clientId: item.clientId, entity: item.entity, op: item.op, record: data };
    }
    if (item.op === 'update') {
      if (!item.targetId) return { ok: false, clientId: item.clientId, error: 'targetId fehlt' };
      const validated = validatePayload(item.entity, pick(item.payload, entity.fields), { partial: true });
      if (!validated.ok) return { ok: false, clientId: item.clientId, error: validated.error };
      const { data, error } = await supabase.from(entity.table)
        .update(validated.value)
        .eq('id', item.targetId)
        .eq('created_by', email)
        .select().single();
      if (error) { console.error('[Sync update]', error.message); return { ok: false, clientId: item.clientId, error: 'Aktualisieren fehlgeschlagen' }; }
      return { ok: true, clientId: item.clientId, entity: item.entity, op: item.op, record: data };
    }
    if (item.op === 'delete') {
      if (!item.targetId) return { ok: false, clientId: item.clientId, error: 'targetId fehlt' };
      const { error } = await supabase.from(entity.table)
        .delete()
        .eq('id', item.targetId)
        .eq('created_by', email);
      if (error) { console.error('[Sync delete]', error.message); return { ok: false, clientId: item.clientId, error: 'Löschen fehlgeschlagen' }; }
      return { ok: true, clientId: item.clientId, entity: item.entity, op: item.op };
    }
  } catch (e) {
    console.error('[Sync exception]', e.message);
    return { ok: false, clientId: item.clientId, error: 'Interner Fehler' };
  }
  return { ok: false, clientId: item.clientId, error: 'Unbekannter Pfad' };
}

// Obergrenze für die Batch-Größe, damit ein einzelner Request die Funktion
// nicht überlastet, sowie parallele Ausführung mit begrenzter Nebenläufigkeit,
// statt N Items strikt seriell abzuarbeiten (das konnte bei großen Queues in
// den Funktions-Timeout laufen).
const SYNC_MAX_ITEMS = 200;
const SYNC_CONCURRENCY = 5;

router.post('/sync/upload', requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: 'Keine Items zum Hochladen' });
  }
  if (items.length > SYNC_MAX_ITEMS) {
    return res.status(413).json({ error: `Zu viele Items (max. ${SYNC_MAX_ITEMS} pro Upload)` });
  }

  // Ergebnis-Reihenfolge = Eingabe-Reihenfolge beibehalten; Items werden in
  // Fenstern von SYNC_CONCURRENCY parallel verarbeitet.
  const results = new Array(items.length);
  for (let start = 0; start < items.length; start += SYNC_CONCURRENCY) {
    const window = items.slice(start, start + SYNC_CONCURRENCY);
    const settled = await Promise.all(window.map((item) => applyItem(req, item)));
    settled.forEach((r, i) => { results[start + i] = r; });
  }

  const ok = results.filter(r => r.ok).length;
  const failed = results.length - ok;
  return res.json({
    syncedAt: new Date().toISOString(),
    total: results.length,
    ok,
    failed,
    results,
  });
});

export default router;
