import { Router } from 'express';
import { requireAuth, optionalAuth, requireAdmin } from '../middleware/auth.js';
import { supabase, toPublicStorageUrl } from '../lib/supabase.js';
import { Buffer } from 'buffer';
import path from 'path';
import { parseDepthFile } from '../lib/depthParser.js';
import { isInClosedSeason } from '../lib/closedSeason.js';
import { isAllowedFetchUrl } from '../lib/urlSafety.js';
import { deleteUserAccount } from '../lib/accountDeletion.js';
import { sendDbError } from '../lib/errorResponse.js';
import { parseCoordinates } from '../lib/coordinates.js';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';
import { listAllUsers, toAdminUserSummary } from '../lib/adminUsers.js';

const router = Router();

const UPSTREAM_TIMEOUT_MS = 10000;

// Maskiert %, _ und \ für PostgREST-ilike-Muster (Nutzereingaben).
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

// Spalten von fishing_plans (siehe supabase/schema.sql + Live-Schema-Audit).
// War zuvor auf ['name','date','location','target_species','notes',
// 'forecast_data'] gesetzt — keine dieser Spalten existiert in der Tabelle,
// wodurch filterBody() bei jedem POST/PATCH ein praktisch leeres Objekt
// erzeugte und z.B. der KI-Buddy-Trip-Erstellung (buddyActions.js) sowie das
// Aktivieren/Deaktivieren eines Trips (TripPlanner.jsx) stillschweigend
// keine Daten speicherten.
const ALLOWED_PLAN_FIELDS = ['title', 'target_fish', 'spot_info', 'steps', 'planned_date', 'is_active', 'details'];

const filterBody = (body, allowedFields) => {
  const filtered = {};
  for (const key of allowedFields) {
    if (key in body) {
      filtered[key] = body[key];
    }
  }
  return filtered;
};

router.get('/fishing/rules', optionalAuth, async (req, res) => {
  const { data, error } = await supabase.from('rule_entries').select('*').limit(200);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.get('/fishing/rules/active', optionalAuth, async (req, res) => {
  // Schonzeiten sind jaehrlich wiederkehrend, aber mit konkretem Jahr gespeichert.
  // Daher alle Regeln laden und jahres-agnostisch nach Monat/Tag filtern statt per
  // Volldatum-Vergleich in der DB (der nur im geseedeten Jahr getroffen haette).
  const { data, error } = await supabase.from('rule_entries').select('*').limit(500);
  if (error) return sendDbError(res, error);
  const active = (data || []).filter(r => isInClosedSeason(r.closed_from, r.closed_to));
  return res.json(active);
});

// Angelvereine aus der Tabelle fishing_clubs (148 Einträge in Produktion).
// Beide Routen lieferten bisher fest [] — auf Karte und MiniKarte fehlten
// damit alle Vereine aus der Datenbank. Ausgabe im Format der statischen
// Vereinsliste (src/data/fishingClubsCSVExport.json), die die Karte mischt.
const CLUB_COLUMNS = 'id, name, description, latitude, longitude, region, contact, website';
const MAX_CLUBS = 2000;
const NEARBY_DEFAULT_RADIUS_KM = 50;
const NEARBY_MAX_RADIUS_KM = 500;
const NEARBY_LIMIT = 20;

function toClubPayload(row) {
  return {
    id: row.id,
    name: row.name,
    category: 'club',
    city: row.region || null,
    description: row.description || null,
    coordinates: { lat: row.latitude, lng: row.longitude },
    latitude: row.latitude,
    longitude: row.longitude,
    website: row.website || null,
    contact: row.contact || null,
    source: 'database',
  };
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

router.get('/fishing/clubs', optionalAuth, async (req, res) => {
  let query = supabase.from('fishing_clubs').select(CLUB_COLUMNS)
    .not('latitude', 'is', null).not('longitude', 'is', null)
    .order('name', { ascending: true }).limit(MAX_CLUBS);
  const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
  if (city) query = query.ilike('region', `%${escapeLike(city)}%`);
  const { data, error } = await query;
  if (error) return sendDbError(res, error);
  return res.json((data || []).map(toClubPayload));
});

router.post('/fishing/clubs/nearby', optionalAuth, async (req, res) => {
  const coords = parseCoordinates(req.body?.latitude, req.body?.longitude);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  const radius = Math.min(Number(req.body?.radius_km) || NEARBY_DEFAULT_RADIUS_KM, NEARBY_MAX_RADIUS_KM);

  const { data, error } = await supabase.from('fishing_clubs').select(CLUB_COLUMNS)
    .not('latitude', 'is', null).not('longitude', 'is', null).limit(MAX_CLUBS);
  if (error) return sendDbError(res, error);

  const nearby = (data || [])
    .map((row) => ({
      ...toClubPayload(row),
      distance_km: Math.round(distanceKm(coords.latitude, coords.longitude, row.latitude, row.longitude) * 10) / 10,
    }))
    .filter((club) => club.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, NEARBY_LIMIT);
  return res.json(nearby);
});

// /api/fishing/licenses (GET/POST) wurden entfernt: sie nutzten die Spalten
// created_by/license_type/issue_date/expiration_date, die in der `licenses`-
// Tabelle nicht existieren (echtes Schema: user_id/user_email/type/
// valid_from/valid_until/number/issuer) — jeder Aufruf endete in einem
// 500er. Ungenutzt vom Frontend (LicensesSection.jsx nutzt entities.License
// -> /api/licenses in userEntities.js, das die richtigen Spalten kennt).

router.get('/fishing/plans', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('fishing_plans').select('*').eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

router.post('/fishing/plans', requireAuth, async (req, res) => {
  const filteredBody = filterBody(req.body, ALLOWED_PLAN_FIELDS);
  const { data, error } = await supabase.from('fishing_plans').insert({
    ...filteredBody, created_by: req.user.email
  }).select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.patch('/fishing/plans/:id', requireAuth, async (req, res) => {
  const patch = filterBody(req.body, ALLOWED_PLAN_FIELDS);
  const { data, error } = await supabase.from('fishing_plans')
    .update(patch).eq('id', req.params.id).eq('created_by', req.user.email)
    .select().single();
  if (error) return sendDbError(res, error);
  return res.json(data);
});

router.delete('/fishing/plans/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('fishing_plans').delete()
    .eq('id', req.params.id).eq('created_by', req.user.email);
  if (error) return sendDbError(res, error);
  return res.json({ ok: true });
});

// Öffentliche Karte: nur als öffentlich markierte Spots (siehe /spots/public).
router.get('/fishing/hotspots', optionalAuth, async (req, res) => {
  const { data, error } = await supabase.from('spots')
    .select('id,name,latitude,longitude,water_type')
    .eq('is_public', true);
  if (error) return sendDbError(res, error);
  return res.json({ hotspots: data || [] });
});

// /api/gear (GET/POST/PATCH/DELETE) wurden entfernt: sie referenzierten eine
// `gear`-Tabelle, die in der Datenbank ueberhaupt nicht existiert (jeder
// Aufruf endete in "relation gear does not exist", 500er). Ungenutzt vom
// Frontend — das echte Gear-Feature (TackleManager.jsx) nutzt
// entities.GearItem/-Category/-Rule -> /api/gear/items etc. in gear.js,
// deren Tabellen (gear_items/gear_categories/gear_rules) real existieren.

// Tiefendaten-Upload (Bathymetrie-Crowdsourcing): lädt die zuvor hochgeladene
// CSV/GPX-Datei, parst lat/lon/Tiefe und legt eine Bathymetrie-Karte samt
// Tiefenpunkten an. Wird vom Frontend über processDepthData aufgerufen.
const DEPTH_MAX_POINTS = 5000;
router.post('/water/bathymetry', requireAuth, async (req, res) => {
  try {
    const { file_url, water_body_name, device_type, is_public } = req.body || {};
    if (!file_url) return res.status(400).json({ error: 'file_url erforderlich' });
    if (!water_body_name?.trim()) return res.status(400).json({ error: 'water_body_name erforderlich' });
    if (!isAllowedFetchUrl(file_url)) {
      return res.status(400).json({ error: 'file_url muss aus dem eigenen Supabase-Storage stammen' });
    }

    const fileRes = await fetchWithTimeout(file_url, {}, UPSTREAM_TIMEOUT_MS).catch(() => null);
    if (!fileRes || !fileRes.ok) {
      return res.status(400).json({ error: 'Datei konnte nicht geladen werden' });
    }
    const text = await fileRes.text();

    const points = parseDepthFile(text, file_url);
    if (!points.length) {
      return res.status(422).json({
        error: 'Keine gültigen Tiefenpunkte gefunden (erwartet: CSV mit lat,lng,tiefe oder GPX mit <depth>)',
      });
    }
    const limited = points.slice(0, DEPTH_MAX_POINTS);

    const { data: map, error: mapErr } = await supabase.from('bathymetric_maps').insert({
      user_id: req.user.id,
      user_email: req.user.email,
      name: water_body_name.trim(),
      map_data: {
        device_type: device_type || 'unknown',
        is_public: is_public !== false,
        point_count: limited.length,
        source_points: points.length,
        max_depth: Math.round(Math.max(...limited.map((p) => p.depth)) * 10) / 10,
      },
    }).select().single();
    if (mapErr) return sendDbError(res, mapErr);

    const rows = limited.map((p) => ({
      map_id: map.id, user_id: req.user.id, user_email: req.user.email,
      latitude: p.lat, longitude: p.lon, depth_m: p.depth,
    }));
    const { error: ptErr } = await supabase.from('depth_data_points').insert(rows);
    if (ptErr) return sendDbError(res, ptErr);

    const note = points.length > limited.length ? ` (von ${points.length}, auf ${DEPTH_MAX_POINTS} begrenzt)` : '';
    return res.json({
      ok: true,
      message: `${limited.length} Tiefenpunkte importiert${note}`,
      map_id: map.id,
      point_count: limited.length,
    });
  } catch (e) {
    console.error('[Bathymetry Upload Error]', e);
    return sendDbError(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Community-Tiefenkarte je Gewässer (Admin). Das Frontend rief diesen
// Endpunkt schon länger auf (BathymetricCrowdsourcing/BathymetricMapCard),
// er existierte aber nicht — jede Berechnung endete mit 404.
//
// Aggregiert alle ÖFFENTLICHEN Uploads (map_data.is_public !== false) mit
// demselben Gewässernamen zu einer Community-Karte (map_data.kind =
// 'community'): Maximal-/Durchschnittstiefe, Messpunkte, Beitragende und
// zwei berechnete Hotspots (tiefste Stelle, steilste Kante) aus einem Raster.
const COMMUNITY_MAP_KIND = 'community';
const BATHY_MAX_POINTS = 50000;
// ~11 m Rasterweite (4 Nachkommastellen Breite); reicht für Kanten-Erkennung
// bei Echolot-Daten und hält die Rasterzahl klein.
const BATHY_GRID_DECIMALS = 4;

const round1 = (n) => Math.round(n * 10) / 10;

export function summarizeDepthPoints(points) {
  const depths = points.map((p) => Number(p.depth_m)).filter((d) => Number.isFinite(d) && d >= 0);
  if (depths.length === 0) {
    return { max_depth: null, avg_depth: null, data_points_count: 0, contributors_count: 0, hotspots: [] };
  }

  const factor = 10 ** BATHY_GRID_DECIMALS;
  const cells = new Map();
  for (const p of points) {
    const depth = Number(p.depth_m);
    const lat = Number(p.latitude);
    const lon = Number(p.longitude);
    if (!Number.isFinite(depth) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const i = Math.round(lat * factor);
    const j = Math.round(lon * factor);
    const key = `${i}:${j}`;
    const cell = cells.get(key) || { i, j, sum: 0, n: 0 };
    cell.sum += depth;
    cell.n += 1;
    cells.set(key, cell);
  }

  const cellDepth = (c) => c.sum / c.n;
  const center = (c) => ({ latitude: c.i / factor, longitude: c.j / factor });
  const hotspots = [];
  let deepest = null;
  for (const c of cells.values()) {
    if (!deepest || cellDepth(c) > cellDepth(deepest)) deepest = c;
  }
  if (deepest) {
    hotspots.push({ label: 'Tiefste Stelle', depth: round1(cellDepth(deepest)), ...center(deepest) });
  }
  let steepest = null;
  for (const c of cells.values()) {
    for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const n = cells.get(`${c.i + di}:${c.j + dj}`);
      if (!n) continue;
      const diff = Math.abs(cellDepth(c) - cellDepth(n));
      if (!steepest || diff > steepest.diff) {
        steepest = { diff, cell: cellDepth(c) > cellDepth(n) ? c : n };
      }
    }
  }
  if (steepest && steepest.diff > 0) {
    hotspots.push({ label: 'Steilste Kante', depth: round1(cellDepth(steepest.cell)), ...center(steepest.cell) });
  }

  return {
    max_depth: round1(Math.max(...depths)),
    avg_depth: round1(depths.reduce((sum, d) => sum + d, 0) / depths.length),
    data_points_count: depths.length,
    contributors_count: new Set(points.map((p) => p.user_id).filter(Boolean)).size,
    hotspots,
  };
}

router.post('/water/bathymetric-map', requireAuth, requireAdmin, async (req, res) => {
  const { water_body_name, map_id } = req.body || {};
  let name = typeof water_body_name === 'string' ? water_body_name.trim() : '';

  if (!name && map_id) {
    const { data: existing, error } = await supabase.from('bathymetric_maps')
      .select('name').eq('id', map_id).maybeSingle();
    if (error) return sendDbError(res, error);
    name = existing?.name?.trim() || '';
  }
  if (!name) return res.status(400).json({ error: 'water_body_name erforderlich' });

  const { data: maps, error: mapsErr } = await supabase.from('bathymetric_maps')
    .select('id, user_id, name, map_data')
    .ilike('name', escapeLike(name));
  if (mapsErr) return sendDbError(res, mapsErr);

  const sources = (maps || []).filter((m) => m.map_data?.kind !== COMMUNITY_MAP_KIND && m.map_data?.is_public !== false);
  const communityMap = (maps || []).find((m) => m.map_data?.kind === COMMUNITY_MAP_KIND) || null;
  if (sources.length === 0) {
    return res.status(404).json({ error: 'Für dieses Gewässer gibt es noch keine öffentlichen Tiefendaten' });
  }

  const { data: points, error: pointsErr } = await supabase.from('depth_data_points')
    .select('latitude, longitude, depth_m, user_id')
    .in('map_id', sources.map((m) => m.id))
    .limit(BATHY_MAX_POINTS);
  if (pointsErr) return sendDbError(res, pointsErr);

  const summary = summarizeDepthPoints(points || []);
  const mapData = {
    kind: COMMUNITY_MAP_KIND,
    status: summary.data_points_count > 0 ? 'ready' : 'error',
    ...summary,
    source_map_count: sources.length,
    generated_at: new Date().toISOString(),
  };

  const query = communityMap
    ? supabase.from('bathymetric_maps').update({ map_data: mapData }).eq('id', communityMap.id)
    : supabase.from('bathymetric_maps').insert({
      user_id: req.user.id,
      user_email: req.user.email,
      name,
      map_data: mapData,
    });
  const { data: saved, error: saveErr } = await query.select().single();
  if (saveErr) return sendDbError(res, saveErr);

  return res.json({ ok: true, id: saved.id, water_body_name: saved.name, ...mapData });
});

router.post('/weather', optionalAuth, async (req, res) => {
  const coords = parseCoordinates(req.body?.latitude, req.body?.longitude);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  const { latitude: lat, longitude: lon } = coords;
  try {
    const w = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code,relative_humidity_2m&hourly=temperature_2m,precipitation_probability&timezone=auto`,
      {}, UPSTREAM_TIMEOUT_MS
    ).then(r => r.json());
    return res.json(w);
  } catch (e) {
    return sendDbError(res, e);
  }
});

// Amtliche Unwetterwarnungen (DWD) für einen Standort. Quelle: Bright Sky –
// eine offene, kostenlose API, die die offiziellen CAP-Warnungen des Deutschen
// Wetterdienstes bereitstellt (analog zu Open-Meteo, kein eigener Backend-Dienst).
const ALERT_SEVERITY_RANK = { extreme: 4, severe: 3, moderate: 2, minor: 1 };

router.post('/weather/alerts', optionalAuth, async (req, res) => {
  const coords = parseCoordinates(req.body?.latitude, req.body?.longitude);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  const { latitude: lat, longitude: lon } = coords;
  try {
    const data = await fetchWithTimeout(
      `https://api.brightsky.dev/alerts?lat=${lat}&lon=${lon}`,
      { headers: { Accept: 'application/json' } },
      UPSTREAM_TIMEOUT_MS
    ).then(r => r.json());

    const raw = Array.isArray(data?.alerts) ? data.alerts : [];
    const now = Date.now();

    const alerts = raw
      // Abgelaufene Warnungen ausblenden
      .filter(a => !a.expires || new Date(a.expires).getTime() >= now)
      .map(a => ({
        id: a.id ?? a.alert_id,
        event: a.event_de || a.event_en || 'Wetterwarnung',
        headline: a.headline_de || a.headline_en || '',
        description: a.description_de || a.description_en || '',
        instruction: a.instruction_de || a.instruction_en || '',
        severity: (a.severity || 'moderate').toLowerCase(),
        urgency: a.urgency || null,
        certainty: a.certainty || null,
        category: a.category || null,
        onset: a.onset || a.effective || null,
        expires: a.expires || null,
      }))
      // Schwerste/aktuellste zuerst
      .sort((x, y) => {
        const s = (ALERT_SEVERITY_RANK[y.severity] || 0) - (ALERT_SEVERITY_RANK[x.severity] || 0);
        if (s !== 0) return s;
        return new Date(x.onset || 0).getTime() - new Date(y.onset || 0).getTime();
      });

    return res.json({
      alerts,
      location: data?.location || null,
      source: 'Deutscher Wetterdienst (DWD) via Bright Sky',
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return sendDbError(res, e);
  }
});

// LiveTrip Cloud-Backup (TripSyncService). Der komplette Trip wird als jsonb
// gespeichert; die id stammt aus dem lokalen IndexedDB-Trip, daher Upsert
// (Idempotenz beim erneuten Synchronisieren). list liefert die Trips 1:1 zurück.
router.post('/trips', requireAuth, async (req, res) => {
  try {
    const trip = req.body || {};
    const id = String(trip.id || Date.now());
    // Upsert über eine vom Client gewählte id: Ohne diese Prüfung überschrieb
    // ein Upsert mit einer fremden Trip-id deren Inhalt UND Eigentümer.
    const { data: existing, error: existingErr } = await supabase.from('live_trips')
      .select('user_id').eq('id', id).maybeSingle();
    if (existingErr) return sendDbError(res, existingErr);
    if (existing && existing.user_id !== req.user.id) {
      return res.status(409).json({ error: 'Trip-ID bereits vergeben' });
    }
    const { data, error } = await supabase.from('live_trips').upsert({
      id, user_id: req.user.id, user_email: req.user.email, trip,
    }, { onConflict: 'id' }).select().single();
    if (error) return sendDbError(res, error);
    return res.json({ ok: true, id: data.id, ...trip });
  } catch (e) {
    return sendDbError(res, e);
  }
});

router.get('/trips', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('live_trips')
    .select('trip').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return sendDbError(res, error);
  return res.json((data || []).map((r) => r.trip));
});

// Loescht wirklich alle eigenen Daten des Nutzers (siehe accountDeletion.js
// fuer die vollstaendige Tabellenliste) sowie den Auth-User selbst. Bislang
// war das ein reiner No-op-Stub, obwohl das Frontend (DeleteAccountDialog,
// DeleteAccountSection) dem Nutzer echte Loeschung verspricht.
router.delete('/user/account', requireAuth, async (req, res) => {
  try {
    const result = await deleteUserAccount({ userId: req.user.id, email: req.user.email });
    if (!result.authUserDeleted) {
      // Der Auth-User selbst konnte nicht geloescht werden — das ist der
      // kritische Teil (sonst kann sich der Nutzer weiter einloggen).
      return res.status(500).json({ success: false, message: 'Account konnte nicht vollstaendig geloescht werden', errors: result.errors });
    }
    return res.json({ success: true, message: 'Account und alle zugehoerigen Daten wurden geloescht', warnings: result.errors });
  } catch (e) {
    console.error('[Account Deletion Error]', e);
    return res.status(500).json({ success: false, message: 'Account konnte nicht geloescht werden' });
  }
});

// Lieferte bis hierher eine fest verdrahtete leere Liste — die
// Admin-Nutzerverwaltung zeigte dadurch nie einen einzigen Nutzer an.
// Optionaler `?search=` filtert über E-Mail und Namen.
router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { users, error } = await listAllUsers(supabase);
  if (error) return sendDbError(res, error);

  const summaries = users.map(toAdminUserSummary);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const filtered = search
    ? summaries.filter(
        (u) => u.email.toLowerCase().includes(search) || u.full_name.toLowerCase().includes(search)
      )
    : summaries;

  filtered.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return res.json(filtered);
});

router.get('/exams', optionalAuth, async (req, res) => {
  const { data, error } = await supabase.from('exam_questions').select('*').limit(200);
  if (error) return sendDbError(res, error);
  return res.json(data || []);
});

// Der Bucket ist öffentlich. Ein frei wählbarer Content-Type hätte erlaubt,
// HTML/SVG mit Skript unter der Storage-Domain auszuliefern (Phishing/XSS).
// Erlaubt sind nur die Medien, die die App tatsächlich hochlädt; Text-Formate
// der Tiefendaten-Uploads (CSV/GPX) werden als text/plain abgelegt, damit
// auch XML-basierte Dateien nie als Dokument gerendert werden.
const UPLOAD_MEDIA_TYPE = /^(image\/(jpeg|png|webp|gif|heic|heif|avif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)$/;
const UPLOAD_TEXT_TYPES = new Set([
  'text/plain', 'text/csv', 'application/csv', 'application/vnd.ms-excel',
  'application/gpx+xml', 'application/xml', 'text/xml',
]);

// Browser melden .gpx/.csv je nach Plattform auch als application/octet-stream;
// dann entscheidet die Dateiendung.
const UPLOAD_TEXT_EXTENSION = /\.(csv|gpx|txt)$/i;

export function resolveUploadContentType(fileType, fileName = '') {
  const base = String(fileType || '').split(';')[0].trim().toLowerCase();
  if (UPLOAD_MEDIA_TYPE.test(base)) return String(fileType).trim();
  if (UPLOAD_TEXT_TYPES.has(base)) return 'text/plain; charset=utf-8';
  if ((base === '' || base === 'application/octet-stream') && UPLOAD_TEXT_EXTENSION.test(fileName)) {
    return 'text/plain; charset=utf-8';
  }
  return null;
}

router.post('/files/upload', requireAuth, async (req, res) => {
  try {
    const { file_base64, file_name, file_type } = req.body;

    if (!file_base64 || !file_name) {
      return res.status(400).json({ error: 'file_base64 und file_name erforderlich' });
    }

    const contentType = resolveUploadContentType(file_type, typeof file_name === 'string' ? file_name : '');
    if (!contentType) {
      return res.status(415).json({ error: 'Dateityp nicht erlaubt' });
    }

    if (typeof file_base64 !== 'string' || !file_base64.match(/^[A-Za-z0-9+/=]+$/)) {
      return res.status(400).json({ error: 'Ungültiges Base64-Format' });
    }

    // Sicherheit: file_name validieren, um Path Traversal zu verhindern
    const sanitized = typeof file_name === 'string' ? path.basename(file_name) : '';
    if (!sanitized || sanitized !== file_name) {
      return res.status(400).json({ error: 'Ungültiger Dateiname' });
    }

    let buffer;
    try {
      buffer = Buffer.from(file_base64, 'base64');
      if (buffer.length === 0) {
        return res.status(400).json({ error: 'Datei ist leer' });
      }
    } catch (bufErr) {
      return res.status(400).json({ error: 'Fehler beim Dekodieren der Datei' });
    }

    const bucket = 'catches';
    const filePath = `${req.user.email}/${Date.now()}-${sanitized}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('[File Upload Error]', error.message);
      return res.status(500).json({ error: 'Upload fehlgeschlagen' });
    }

    if (!data || !data.path) {
      return res.status(500).json({ error: 'Upload erfolgreich, aber kein Pfad zurückgegeben' });
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    if (!urlData || !urlData.publicUrl) {
      return res.status(500).json({ error: 'Konnte öffentliche URL nicht generieren' });
    }

    // Beim Self-Hosting zeigt getPublicUrl auf die containerinterne Adresse
    // (z. B. http://kong:8000) — für den Browser auf die öffentliche umschreiben.
    return res.json({ file_url: toPublicStorageUrl(urlData.publicUrl) });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Unerwarteter Fehler beim Upload' });
  }
});

export default router;
