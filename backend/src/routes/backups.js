import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';

const router = Router();

const RESTORABLE = ['catches', 'spots', 'water_scenes'];

async function buildSnapshot(email) {
  const [catches, spots, waterScenes, bathymetryMaps] = await Promise.all([
    supabase.from('catches').select('*').eq('created_by', email),
    supabase.from('spots').select('*').eq('created_by', email),
    supabase.from('water_scenes').select('*').eq('created_by', email),
    supabase.from('bathymetric_maps').select('*').eq('user_email', email),
  ]);
  const errors = [catches, spots, waterScenes, bathymetryMaps].map(r => r.error).filter(Boolean);
  if (errors.length) throw new Error(errors[0].message);
  return {
    catches: catches.data || [],
    spots: spots.data || [],
    water_scenes: waterScenes.data || [],
    bathymetric_maps: bathymetryMaps.data || [],
  };
}

router.get('/backups', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_backups')
    .select('id, kind, size_bytes, catches_count, spots_count, water_scenes_count, bathymetric_maps_count, note, created_at')
    .eq('created_by', req.user.email)
    .order('created_at', { ascending: false });
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.get('/backups/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_backups')
    .select('*')
    .eq('id', req.params.id)
    .eq('created_by', req.user.email)
    .single();
  if (error) return res.status(404).json({ error: 'Backup nicht gefunden' });
  return res.json(data);
});

router.post('/backups', requireAuth, async (req, res) => {
  const { kind = 'manual', note = null } = req.body || {};
  if (!['manual', 'auto'].includes(kind)) return res.status(400).json({ error: `Unbekannte kind: ${kind}` });
  try {
    const snapshot = await buildSnapshot(req.user.email);
    const payload = { version: 1, snapshot_at: new Date().toISOString(), data: snapshot };
    const size_bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const row = {
      created_by: req.user.email,
      kind,
      payload,
      size_bytes,
      catches_count: snapshot.catches.length,
      spots_count: snapshot.spots.length,
      water_scenes_count: snapshot.water_scenes.length,
      bathymetric_maps_count: snapshot.bathymetric_maps.length,
      note,
    };
    const { data, error } = await supabase
      .from('user_backups')
      .insert(row)
      .select('id, kind, size_bytes, catches_count, spots_count, water_scenes_count, bathymetric_maps_count, note, created_at')
      .single();
    if (error) return sendDbError(res, error);
    return res.json(data);
  } catch (e) {
    return sendDbError(res, e);
  }
});

router.post('/backups/:id/restore', requireAuth, async (req, res) => {
  const { tables = RESTORABLE, mode = 'merge' } = req.body || {};
  if (!Array.isArray(tables) || tables.some(t => !RESTORABLE.includes(t))) {
    return res.status(400).json({ error: 'Nur erlaubt: ' + RESTORABLE.join(', ') });
  }
  if (!['merge', 'replace'].includes(mode)) return res.status(400).json({ error: `Unbekannter mode: ${mode}` });

  const { data: backup, error: getErr } = await supabase
    .from('user_backups')
    .select('payload')
    .eq('id', req.params.id)
    .eq('created_by', req.user.email)
    .single();
  if (getErr) return res.status(404).json({ error: 'Backup nicht gefunden' });

  // Sicherheitsnetz: mode=replace loescht Tabellen VOR dem Insert der
  // Snapshot-Daten. Schlaegt der Insert danach fehl, waeren die geloeschten
  // Zeilen sonst unwiederbringlich weg. Deshalb wird der aktuelle Stand vorher
  // als automatisches Backup gesichert — schlaegt das fehl, wird der ganze
  // Restore abgebrochen, statt destruktiv fortzufahren.
  if (mode === 'replace') {
    try {
      const safetySnapshot = await buildSnapshot(req.user.email);
      const payload = { version: 1, snapshot_at: new Date().toISOString(), data: safetySnapshot };
      const size_bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      const { error: safetyErr } = await supabase.from('user_backups').insert({
        created_by: req.user.email,
        kind: 'auto',
        payload,
        size_bytes,
        catches_count: safetySnapshot.catches.length,
        spots_count: safetySnapshot.spots.length,
        water_scenes_count: safetySnapshot.water_scenes.length,
        bathymetric_maps_count: safetySnapshot.bathymetric_maps.length,
        note: `Automatisches Sicherheits-Backup vor Restore von Backup ${req.params.id}`,
      });
      if (safetyErr) throw new Error(safetyErr.message);
    } catch (e) {
      console.error('[Backup Safety-Snapshot Error]', e.message);
      return res.status(500).json({
        error: 'Sicherheits-Backup vor dem Restore fehlgeschlagen — Restore abgebrochen'
      });
    }
  }

  // IDs bleiben erhalten: catches.spot_id verweist auf spots.id. Mit neu
  // vergebenen IDs zeigten nach einem Restore alle Fänge ins Leere (Dashboard,
  // Top-Spots, Fangbuch-Ortsangaben). Der Snapshot stammt ausschließlich aus den
  // eigenen Zeilen (buildSnapshot), fremde IDs können nicht enthalten sein.
  // - replace: eigene Zeilen löschen, dann mit Original-IDs einfügen.
  // - merge:   nur fehlende Zeilen ergänzen (ON CONFLICT DO NOTHING). Früher
  //            legte merge jede noch vorhandene Zeile ein zweites Mal an.
  const snapshot = backup?.payload?.data || {};
  const results = {};
  for (const table of tables) {
    const rows = Array.isArray(snapshot[table]) ? snapshot[table] : [];
    const sanitized = rows.filter(r => r && r.id).map(r => ({ ...r, created_by: req.user.email }));
    if (mode === 'replace') {
      const { error: delErr } = await supabase.from(table).delete().eq('created_by', req.user.email);
      if (delErr) {
        console.error(`[Backup Restore] delete ${table} failed:`, delErr.message);
        results[table] = { ok: false, error: 'Löschen fehlgeschlagen' };
        continue;
      }
    }
    if (sanitized.length === 0) { results[table] = { ok: true, inserted: 0 }; continue; }
    const { error: insErr, count } = await supabase.from(table)
      .upsert(sanitized, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' });
    if (insErr) {
      console.error(`[Backup Restore] insert ${table} failed:`, insErr.message);
      results[table] = { ok: false, error: 'Wiederherstellen fehlgeschlagen' };
      continue;
    }
    results[table] = { ok: true, inserted: count ?? sanitized.length };
  }
  return res.json({ restoredAt: new Date().toISOString(), mode, tables, results });
});

router.delete('/backups/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('user_backups')
    .delete()
    .eq('id', req.params.id)
    .eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

export default router;
