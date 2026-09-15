import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';
import { parseCoordinates } from '../lib/coordinates.js';

const router = Router();

const UPSTREAM_TIMEOUT_MS = 10000;

const QUALITY_SAMPLES = { low: 4, med: 8, high: 16, ultra: 24 };
const ALLOWED_QUALITY = new Set(['low', 'med', 'high', 'ultra']);

async function fetchOpenMeteoForecast(lat, lon, hours) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,wind_speed_10m,weather_code,relative_humidity_2m,pressure_msl');
  url.searchParams.set('hourly', 'temperature_2m,soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm');
  url.searchParams.set('past_hours', String(Math.min(hours, 24)));
  url.searchParams.set('forecast_hours', '1');
  url.searchParams.set('timezone', 'auto');
  const res = await fetchWithTimeout(url.toString(), {}, UPSTREAM_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Open-Meteo Forecast Fehler: ${res.status}`);
  return res.json();
}

async function fetchOpenMeteoMarine(lat, lon, hours) {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('hourly', 'wave_height,wave_period,sea_surface_temperature');
  url.searchParams.set('past_hours', String(Math.min(hours, 24)));
  url.searchParams.set('forecast_hours', '1');
  url.searchParams.set('timezone', 'auto');
  const res = await fetchWithTimeout(url.toString(), {}, UPSTREAM_TIMEOUT_MS);
  if (!res.ok) return null;
  return res.json();
}

function buildProfile(forecast, marine, samples) {
  const hourly = forecast?.hourly || {};
  const times = hourly.time || [];
  const sliceN = Math.min(samples, times.length);
  const indices = [];
  if (sliceN > 0) {
    const step = Math.max(1, Math.floor(times.length / sliceN));
    for (let i = 0; i < times.length; i += step) indices.push(i);
  }
  const series = indices.map(i => ({
    time: times[i],
    air_temp: hourly.temperature_2m?.[i] ?? null,
    soil_0: hourly.soil_temperature_0cm?.[i] ?? null,
    soil_6: hourly.soil_temperature_6cm?.[i] ?? null,
    soil_18: hourly.soil_temperature_18cm?.[i] ?? null,
    soil_54: hourly.soil_temperature_54cm?.[i] ?? null,
    sea_surface: marine?.hourly?.sea_surface_temperature?.[i] ?? null,
    wave_height: marine?.hourly?.wave_height?.[i] ?? null,
  }));
  return {
    current: forecast?.current ?? null,
    marine_current: marine?.current ?? null,
    series,
    units: {
      forecast: forecast?.hourly_units ?? null,
      marine: marine?.hourly_units ?? null,
    },
  };
}

router.get('/water-data', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('water_scenes')
    .select('*')
    .eq('created_by', req.user.email)
    .order('captured_at', { ascending: false })
    .limit(100);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.post('/water-data', requireAuth, async (req, res) => {
  const { latitude, longitude, spot_id = null, quality = 'med', temperature_profile = null, source = 'manual' } = req.body || {};
  const coords = parseCoordinates(latitude, longitude);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  if (!ALLOWED_QUALITY.has(quality)) {
    return res.status(400).json({ error: `Unbekannte Quality: ${quality}` });
  }
  const sample_count = Array.isArray(temperature_profile?.series) ? temperature_profile.series.length : 0;
  const size_bytes = temperature_profile ? Buffer.byteLength(JSON.stringify(temperature_profile), 'utf8') : 0;
  const { data, error } = await supabase
    .from('water_scenes')
    .insert({
      created_by: req.user.email,
      spot_id,
      latitude: coords.latitude,
      longitude: coords.longitude,
      quality,
      sample_count,
      size_bytes,
      temperature_profile,
      source,
    })
    .select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.post('/water-data/fetch', requireAuth, async (req, res) => {
  const { latitude, longitude, spot_id = null, quality = 'med' } = req.body || {};
  const coords = parseCoordinates(latitude, longitude);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  if (!ALLOWED_QUALITY.has(quality)) {
    return res.status(400).json({ error: `Unbekannte Quality: ${quality}` });
  }
  const samples = QUALITY_SAMPLES[quality];
  try {
    const [forecast, marine] = await Promise.all([
      fetchOpenMeteoForecast(coords.latitude, coords.longitude, samples),
      fetchOpenMeteoMarine(coords.latitude, coords.longitude, samples).catch(() => null),
    ]);
    const profile = buildProfile(forecast, marine, samples);
    const sample_count = profile.series.length;
    const size_bytes = Buffer.byteLength(JSON.stringify(profile), 'utf8');
    const { data, error } = await supabase
      .from('water_scenes')
      .insert({
        created_by: req.user.email,
        spot_id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        quality,
        sample_count,
        size_bytes,
        temperature_profile: profile,
        source: marine ? 'open-meteo-marine+forecast' : 'open-meteo-forecast',
      })
      .select().single();
    if (error) return sendDbError(res, error);
    return res.json(data);
  } catch (e) {
    console.error('[WaterData fetch]', e.message);
    return res.status(502).json({ error: 'Wetterdaten konnten nicht abgerufen werden' });
  }
});

router.delete('/water-data/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('water_scenes')
    .delete()
    .eq('id', req.params.id)
    .eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

export default router;
