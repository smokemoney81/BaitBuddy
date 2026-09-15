import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { parseCoordinates } from '../lib/coordinates.js';

const router = Router();

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

router.get('/spots/public', async (req, res) => {
  const { data, error } = await supabase.from('spots').select('id,name,latitude,longitude,water_type').limit(100);
  if (error) return sendDbError(res, error);
  return res.json(data);
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
