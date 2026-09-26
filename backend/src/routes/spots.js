import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { parseCoordinates, parseOptionalCoordinates } from '../lib/coordinates.js';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';
import { rankSpots } from '../lib/spotRecommendation.js';
import { isJevSpotsActive } from '../lib/jevClient.js';
import { runSpotRankingShadow, resolveActiveRanking } from '../lib/jevSpotRanking.js';

const router = Router();

// open-meteo ist optional/schnell — kurzes Timeout, damit ein hängender
// Wetterdienst nie die Empfehlung blockiert (analog zu ai.js).
const WEATHER_TIMEOUT_MS = 8000;
const MAX_CONTENT_CHARS = 200;

const ALLOWED_SPOT_FIELDS = ['name', 'latitude', 'longitude', 'water_type', 'notes', 'photo_url', 'is_favorite', 'depth_meters'];

const filterSpotBody = (body) => {
  const filtered = {};
  for (const key of ALLOWED_SPOT_FIELDS) {
    if (key in body) {
      filtered[key] = body[key];
    }
  }
  return filtered;
};

router.get('/spots', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('spots').select('*').eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

// Ohne Anmeldung erreichbar — deshalb strikt nur Spots, die als öffentlich
// markiert sind. Vorher lieferte der Endpunkt jeden Spot aller Nutzer samt
// exakter Koordinaten aus, also auch private Angelplätze (is_public=false).
router.get('/spots/public', async (req, res) => {
  const { data, error } = await supabase.from('spots')
    .select('id,name,latitude,longitude,water_type')
    .eq('is_public', true)
    .limit(100);
  if (error) return sendDbError(res, error);
  return res.json(data);
});

// GET /api/spots/recommended?species=Zander&latitude=...&longitude=...
//
// Neue deterministische Empfehlungs-Basis (siehe CLAUDE.md „Jev Decision
// Layer" — es gab vorher keine Spot-Rankinglogik im Code). Harter Filter
// (nur eigene Spots) passiert HIER, bevor irgendeine Bewertung greift; Jev
// (falls aktiviert) re-rankt danach höchstens die Reihenfolge, siehe
// `jevSpotRanking.js`.
router.get('/spots/recommended', requireAuth, async (req, res) => {
  const targetSpecies = typeof req.query.species === 'string'
    ? req.query.species.slice(0, MAX_CONTENT_CHARS).trim() || null
    : null;

  const coords = parseOptionalCoordinates(req.query.latitude, req.query.longitude);
  if (!coords.ok) return res.status(400).json({ error: coords.error });

  const [spotsResult, catchesResult, rulesResult, weather] = await Promise.all([
    supabase.from('spots').select('id,name,water_type,is_favorite,depth_meters').eq('created_by', req.user.email),
    supabase.from('catches').select('species,water_body,spot_name').eq('created_by', req.user.email).limit(500),
    targetSpecies
      ? supabase.from('rule_entries').select('fish,closed_from,closed_to').ilike('fish', targetSpecies)
      : Promise.resolve({ data: [], error: null }),
    coords.latitude != null
      ? fetchWithTimeout(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=wind_speed_10m&timezone=auto`,
          {}, WEATHER_TIMEOUT_MS
        ).then((r) => r.json()).then((w) => (
          typeof w?.current?.wind_speed_10m === 'number' ? { windSpeed: w.current.wind_speed_10m } : null
        )).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (spotsResult.error) return sendDbError(res, spotsResult.error);
  if (!spotsResult.data?.length) return res.json({ spots: [] });

  const ranked = rankSpots({
    spots: spotsResult.data,
    catches: catchesResult.data || [],
    targetSpecies,
    ruleEntries: rulesResult.data || [],
    weather,
  });

  // Jev Decision Layer (siehe CLAUDE.md „Jev Decision Layer"): ohne
  // JEV_ENABLED ist beides ein No-op und die Reihenfolge bleibt exakt die
  // deterministische Sortierung aus `rankSpots`.
  let finalRanking = ranked;
  if (isJevSpotsActive()) {
    finalRanking = await resolveActiveRanking({ ranked, targetSpecies });
  } else {
    runSpotRankingShadow({ ranked, targetSpecies });
  }

  return res.json({
    spots: finalRanking.map(({ spot, breakdown, score }) => ({
      ...spot,
      score: Math.round(score * 100) / 100,
      match: breakdown,
    })),
  });
});

router.post('/spots', requireAuth, async (req, res) => {
  const { name, latitude, longitude, water_type, notes, photo_url, is_favorite, depth_meters } = req.body;
  // Ein Spot ohne gueltige Position ist wertlos (Karte, Distanzberechnung,
  // Wetterabfrage) — und ungeprueft landeten hier auch "999" oder "abc" in der
  // Datenbank.
  const coords = parseCoordinates(latitude, longitude);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  const { data, error } = await supabase.from('spots').insert({
    created_by: req.user.email, name,
    latitude: coords.latitude, longitude: coords.longitude,
    water_type, notes, photo_url,
    is_favorite: is_favorite ?? false,
    depth_meters: depth_meters ?? null,
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.patch('/spots/:id', requireAuth, async (req, res) => {
  const filteredBody = filterSpotBody(req.body);
  // Beim Teil-Update duerfen Koordinaten fehlen — wenn sie mitkommen, muessen
  // sie aber gueltig sein.
  if ('latitude' in filteredBody || 'longitude' in filteredBody) {
    const coords = parseCoordinates(filteredBody.latitude, filteredBody.longitude);
    if (!coords.ok) return res.status(400).json({ error: coords.error });
    filteredBody.latitude = coords.latitude;
    filteredBody.longitude = coords.longitude;
  }
  const { data, error } = await supabase.from('spots')
    .update(filteredBody)
    .eq('id', req.params.id)
    .eq('created_by', req.user.email)
    .select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.delete('/spots/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('spots').delete()
    .eq('id', req.params.id).eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

export default router;
