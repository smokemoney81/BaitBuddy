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

router.get('/fishing/clubs', optionalAuth, async (req, res) => {
  return res.json([]);
});

router.post('/fishing/clubs/nearby', optionalAuth, async (req, res) => {
  return res.json([]);
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

router.get('/fishing/hotspots', optionalAuth, async (req, res) => {
  const { data, error } = await supabase.from('spots').select('id,name,latitude,longitude,water_type');
  if (error) return sendDbError(res, error);
  return res.json({ hotspots: data || [] });
});

// /api/gear (GET/POST/PATCH/DELETE) wurden entfernt: sie referenzierten eine
// `gear`-Tabelle, die in der Datenbank ueberhaupt nicht existiert (jeder
// Aufruf endete in "relation gear does not exist", 500er). Ungenutzt vom
// Frontend — das echte Gear-Feature (TackleManager.jsx) nutzt
// entities.GearItem/-Category/-Rule -> /api/gear/items etc. in gear.js,
// deren Tabellen (gear_items/gear_categories/gear_rules) real existieren.

router.get('/water', requireAuth, async (req, res) => {
  return res.json({ analysis: 'Wasseranalyse nicht verfügbar' });
});

router.post('/water', optionalAuth, async (req, res) => {
  return res.json({ analysis: 'Wasseranalyse wird verarbeitet', ok: true });
});

router.get('/water/history', requireAuth, async (req, res) => {
  return res.json([]);
});

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
router.del = router.delete;
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

router.post('/user/sessions/start', requireAuth, async (req, res) => {
  return res.json({ ok: true, session_id: Date.now().toString() });
});

router.post('/user/sessions/:id/end', requireAuth, async (req, res) => {
  return res.json({ ok: true });
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

router.post('/files/upload', requireAuth, async (req, res) => {
  try {
    const { file_base64, file_name, file_type } = req.body;

    if (!file_base64 || !file_name) {
      return res.status(400).json({ error: 'file_base64 und file_name erforderlich' });
    }

    if (!file_base64.match(/^[A-Za-z0-9+/=]+$/)) {
      return res.status(400).json({ error: 'Ungültiges Base64-Format' });
    }

    // Sicherheit: file_name validieren, um Path Traversal zu verhindern
    const sanitized = path.basename(file_name);
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
        contentType: file_type || 'application/octet-stream',
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
