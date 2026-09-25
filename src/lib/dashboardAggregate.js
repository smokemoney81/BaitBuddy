/**
 * Client-seitige Dashboard-Aggregation als Rückfallebene für `GET /api/dashboard`.
 *
 * Frontend und Backend werden getrennt ausgeliefert (SPA über den Cloudflare-
 * Worker, Express-Backend hinter `BACKEND_URL`). Läuft dort ein älterer
 * Backend-Stand ohne die Dashboard-Route, antwortet er mit 404 und das
 * Dashboard stand komplett ohne Daten da. Die Einzel-Endpunkte für Fänge,
 * Spots und Tourenpläne gibt es in jedem Backend-Stand; aus ihnen entsteht hier
 * dieselbe Datenform wie in `getAggregatedDataFallback`
 * (backend/src/routes/dashboard.js) bzw. der RPC `get_dashboard_data`.
 *
 * Die erweiterten Kennzahlen (personal_best, species_count, weeks_active) sind
 * serverseitig ab Basic freigeschaltet. Den Plan kennt nur der Server, deshalb
 * liefert diese Rückfallebene nur die für alle Pläne freigegebenen Werte.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const toTime = (value) => {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * @param {{ catches?: any[], spots?: any[], plans?: any[] }} rows
 * @param {number} [now]
 */
export function aggregateDashboardData({ catches = [], spots = [], plans = [] } = {}, now = Date.now()) {
  const spotsById = new Map();
  const spotsByName = new Map();
  for (const sp of spots) {
    if (sp?.id != null) spotsById.set(sp.id, sp);
    if (sp?.name && !spotsByName.has(sp.name)) spotsByName.set(sp.name, sp);
  }
  const resolveSpot = (c) => (c.spot_id
    ? spotsById.get(c.spot_id) || null
    : (c.spot_name && spotsByName.get(c.spot_name)) || null);

  const catchRows = catches
    .map((c) => ({ ...c, _t: toTime(c.catch_time) }))
    .filter((c) => c._t != null && c._t > now - 90 * DAY_MS)
    .sort((a, b) => b._t - a._t);
  const inWindow = (c, days) => c._t > now - days * DAY_MS;

  const trip = plans
    .map((p) => ({ ...p, _t: toTime(p.planned_date) }))
    .filter((p) => p._t != null && p._t > now)
    .sort((a, b) => a._t - b._t)[0] || null;

  const next_trip = trip ? {
    id: trip.id,
    name: trip.title,
    description: trip.details,
    start_date: trip.planned_date,
    end_date: null,
    location: trip.spot_info,
    target_species: trip.target_fish ? [trip.target_fish] : [],
    status: trip.is_active ? 'active' : 'planned',
  } : null;

  const recent_catches = catchRows
    .filter((c) => inWindow(c, 7))
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      species: c.species,
      weight: c.weight_kg,
      length: c.length_cm,
      location: resolveSpot(c)?.name ?? c.spot_name ?? c.water_body ?? null,
      caught_at: c.catch_time,
      photo_urls: c.photo_url ? [c.photo_url] : [],
      bait_type: c.bait_used,
    }));

  const groups = new Map();
  for (const c of catchRows.filter((row) => inWindow(row, 30))) {
    const spot = resolveSpot(c);
    const key = spot?.id ?? c.spot_name;
    if (!key) continue;
    const g = groups.get(key) || { spot, name: spot?.name ?? c.spot_name, count: 0, kept: 0 };
    g.count += 1;
    if (!c.is_released) g.kept += 1;
    groups.set(key, g);
  }
  const top_spots = [...groups.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([id, g]) => ({
      id,
      name: g.name,
      location: g.spot && g.spot.latitude != null && g.spot.longitude != null
        ? `${g.spot.latitude}, ${g.spot.longitude}`
        : '',
      water_type: g.spot?.water_type ?? null,
      usage_count: g.count,
      avg_success: g.kept / g.count,
    }));

  const totalWeight = catchRows.reduce((sum, c) => sum + (Number(c.weight_kg) || 0), 0);

  return {
    next_trip,
    recent_catches,
    top_spots,
    weather: null,
    buddy_suggestion: null,
    statistics: {
      total_catches: catchRows.length,
      total_weight: Math.round(totalWeight * 100) / 100,
    },
    timestamp: new Date(now).toISOString(),
  };
}

/**
 * Soll bei diesem Fehler von `GET /api/dashboard` auf die Einzel-Endpunkte
 * ausgewichen werden? Ja bei fehlender Route (404) und Serverfehlern (5xx),
 * nein bei Auth-Fehlern (401/403) — die Einzel-Endpunkte scheitern dort genauso.
 */
export function shouldUseDashboardFallback(error) {
  const status = error?.status;
  return status === 404 || (typeof status === 'number' && status >= 500);
}
