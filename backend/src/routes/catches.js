import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';

const router = Router();

const ALLOWED_CATCH_UPDATE_FIELDS = ['species', 'length_cm', 'weight_kg', 'bait_used', 'notes', 'photo_url', 'is_released', 'spot_id'];

const filterCatchUpdate = (body) => {
  const filtered = {};
  for (const field of ALLOWED_CATCH_UPDATE_FIELDS) {
    if (field in body) filtered[field] = body[field];
  }
  return filtered;
};

// Die Spalten `species`, `length_cm` und `weight_kg` sind in der Datenbank
// nullable bzw. unbeschraenkt. Ohne Pruefung nahm der Server Faenge ohne Art an
// (die dann in Fangliste, Artenstatistik und KI-Kontext als Luecke auftauchen)
// sowie negative oder absurde Masse. Ein ungueltiges `catch_time` erzeugte
// ausserdem einen 500er statt einer verstaendlichen Meldung — fuer die
// Offline-Queue besonders unangenehm, weil ein solcher Fang dort dauerhaft
// haengen bliebe.
const MAX_SPECIES_CHARS = 120;
const MAX_TEXT_CHARS = 2000;
// Grosszuegige Obergrenzen: sie sollen Tippfehler und Manipulation abfangen,
// nicht Rekorde. Der groesste je gefangene Fisch misst rund 20 m / 2000 kg.
const MAX_LENGTH_CM = 2500;
const MAX_WEIGHT_KG = 3000;

function validateNumericField(value, label, max) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const num = Number(value);
  if (typeof value === 'boolean' || !Number.isFinite(num)) {
    return { ok: false, error: `${label} muss eine Zahl sein` };
  }
  if (num < 0) return { ok: false, error: `${label} darf nicht negativ sein` };
  if (num > max) return { ok: false, error: `${label} überschreitet den zulässigen Höchstwert (${max})` };
  return { ok: true, value: num };
}

function validateText(value, label, max) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `${label} muss Text sein` };
  return { ok: true, value: value.slice(0, max).trim() };
}

/**
 * Prueft die Nutzdaten eines Fangs.
 * @param {object} body
 * @param {boolean} partial true fuer Teil-Updates: nur mitgesendete Felder pruefen.
 */
export function validateCatchPayload(body, { partial = false } = {}) {
  const out = {};

  if (!partial || 'species' in body) {
    const species = typeof body.species === 'string' ? body.species.trim() : '';
    if (!species) return { ok: false, error: 'Fischart (species) erforderlich' };
    if (species.length > MAX_SPECIES_CHARS) {
      return { ok: false, error: `Fischart darf höchstens ${MAX_SPECIES_CHARS} Zeichen haben` };
    }
    out.species = species;
  }

  for (const [field, label, max] of [
    ['length_cm', 'Länge', MAX_LENGTH_CM],
    ['weight_kg', 'Gewicht', MAX_WEIGHT_KG],
  ]) {
    if (partial && !(field in body)) continue;
    const result = validateNumericField(body[field], label, max);
    if (!result.ok) return result;
    out[field] = result.value;
  }

  for (const [field, label] of [['bait_used', 'Köder'], ['notes', 'Notiz'], ['photo_url', 'Foto-URL']]) {
    if (partial && !(field in body)) continue;
    const result = validateText(body[field], label, MAX_TEXT_CHARS);
    if (!result.ok) return result;
    out[field] = result.value;
  }

  if (!partial || 'catch_time' in body) {
    const raw = body.catch_time;
    if (raw === undefined || raw === null || raw === '') {
      if (!partial) out.catch_time = new Date().toISOString();
    } else {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: 'catch_time ist kein gültiger Zeitpunkt' };
      }
      out.catch_time = parsed.toISOString();
    }
  }

  if (!partial || 'is_released' in body) {
    out.is_released = body.is_released === true;
  }

  if (!partial || 'spot_id' in body) {
    out.spot_id = body.spot_id || null;
  }

  return { ok: true, value: out };
}

router.get('/catches', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    if (!req.user?.email) {
      return res.status(401).json({ error: 'Benutzer-E-Mail nicht verfügbar' });
    }

    const { data, error } = await supabase
      .from('catches').select('*')
      .eq('created_by', req.user.email)
      .order('catch_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return sendDbError(res, error);

    return res.json(data || []);
  } catch (e) {
    return sendDbError(res, e);
  }
});

router.get('/catches/stats/summary', requireAuth, async (req, res) => {
  const email = req.user.email;
  // Aggregation der DB überlassen statt alle Zeilen ins Backend zu laden:
  // - total via HEAD-Count (überträgt keine Zeilen)
  // - biggest via serverseitigem ORDER BY length_cm DESC LIMIT 1
  // - species: nur die eine Spalte laden und in JS deduplizieren (Supabase-REST
  //   kann kein DISTINCT ohne RPC; eine Spalte bleibt aber schlank)
  // Alle drei Abfragen laufen parallel.
  const [countRes, biggestRes, speciesRes] = await Promise.all([
    supabase.from('catches').select('*', { count: 'exact', head: true }).eq('created_by', email),
    supabase.from('catches')
      .select('species, length_cm, weight_kg, catch_time')
      .eq('created_by', email)
      .order('length_cm', { ascending: false, nullsFirst: false })
      .limit(1),
    supabase.from('catches').select('species').eq('created_by', email),
  ]);

  if (countRes.error) return sendDbError(res, countRes.error);
  if (biggestRes.error) return sendDbError(res, biggestRes.error);
  if (speciesRes.error) return sendDbError(res, speciesRes.error);

  const biggest = (biggestRes.data && biggestRes.data[0]) || null;
  const species = [...new Set((speciesRes.data || []).map(c => c.species).filter(Boolean))];

  return res.json({
    total: countRes.count ?? (countRes.data?.length ?? 0),
    species,
    biggest,
  });
});

router.get('/catches/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('catches').select('*')
    .eq('id', req.params.id).eq('created_by', req.user.email).single();
  if (error) return res.status(404).json({ error: 'Nicht gefunden' });
  return res.json(data);
});

router.post('/catches', requireAuth, async (req, res) => {
  const validated = validateCatchPayload(req.body || {});
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { data, error } = await supabase.from('catches').insert({
    created_by: req.user.email,
    ...validated.value,
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

const updateCatch = async (req, res) => {
  const filtered = filterCatchUpdate(req.body || {});
  const validated = validateCatchPayload(filtered, { partial: true });
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { data, error } = await supabase.from('catches')
    .update(validated.value)
    .eq('id', req.params.id)
    .eq('created_by', req.user.email)
    .select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
};

router.patch('/catches/:id', requireAuth, updateCatch);
router.put('/catches/:id', requireAuth, updateCatch);

router.delete('/catches/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('catches')
    .delete()
    .eq('id', req.params.id)
    .eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

export default router;
