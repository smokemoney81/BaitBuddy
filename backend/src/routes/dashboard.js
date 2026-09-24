/**
 * Dashboard BFF (Backend For Frontend) API
 *
 * Single aggregated endpoint for all dashboard data.
 * Replaces multiple scattered requests with one efficient call.
 *
 * GET /api/dashboard
 *   Returns aggregated dashboard data via Supabase RPC with fallback to manual aggregation
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { supabase } from '../lib/supabase.js';
import { resolvePlan } from '../lib/planResolver.js';

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

// Supabase liefert Fehler als Wert statt sie zu werfen. Im Fallback würde ein
// verschluckter Fehler als „keine Daten" durchgehen — der Nutzer sähe ein
// leeres Dashboard statt der Fehlermeldung mit „Erneut versuchen".
function unwrap({ data, error }, label) {
  if (error) throw new Error(`${label}: ${error.message || error}`);
  return data || [];
}

/**
 * Fallback: dieselbe Aggregation wie die RPC `get_dashboard_data`
 * (supabase/migrations/20260924200000_fix_dashboard_spot_resolution.sql), falls
 * die Funktion auf dieser Datenbank fehlt (z. B. Self-Hosting ohne Migration).
 *
 * Fänge referenzieren ihren Spot über `spot_id`; `spot_name` ist nur bei
 * Altdaten gesetzt. Aufgelöst wird ausschließlich gegen die Spots desselben
 * Nutzers, damit eine fremde spot_id keine fremden Namen/Koordinaten zeigt.
 */
async function getAggregatedDataFallback(userEmail) {
  const now = Date.now();
  const since = (days) => new Date(now - days * DAY_MS).toISOString();

  const [tripRows, catchRows, spotRows] = await Promise.all([
    supabase
      .from('fishing_plans')
      .select('id, title, details, planned_date, spot_info, target_fish, is_active')
      .eq('created_by', userEmail)
      .gt('planned_date', new Date(now).toISOString())
      .order('planned_date', { ascending: true })
      .limit(1)
      .then((r) => unwrap(r, 'fishing_plans')),
    // Ein Abruf für alle drei Zeitfenster (7/30/90 Tage).
    supabase
      .from('catches')
      .select('id, species, weight_kg, length_cm, catch_time, photo_url, bait_used, spot_id, spot_name, water_body, is_released')
      .eq('created_by', userEmail)
      .gt('catch_time', since(90))
      .order('catch_time', { ascending: false })
      .then((r) => unwrap(r, 'catches')),
    supabase
      .from('spots')
      .select('id, name, latitude, longitude, water_type')
      .eq('created_by', userEmail)
      .then((r) => unwrap(r, 'spots')),
  ]);

  const spotsById = new Map(spotRows.map((sp) => [sp.id, sp]));
  const spotsByName = new Map();
  for (const sp of spotRows) {
    if (sp.name && !spotsByName.has(sp.name)) spotsByName.set(sp.name, sp);
  }
  const resolveSpot = (c) => (c.spot_id
    ? spotsById.get(c.spot_id) || null
    : (c.spot_name && spotsByName.get(c.spot_name)) || null);

  const trip = tripRows[0] || null;
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

  const inWindow = (c, days) => new Date(c.catch_time).getTime() > now - days * DAY_MS;

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

  const weights = catchRows.map((c) => Number(c.weight_kg) || 0);
  // Kalenderwochen ab Montag (wie date_trunc('week') in der RPC).
  const weekKey = (iso) => {
    const d = new Date(iso);
    const day = (d.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
  };
  const statistics = {
    total_catches: catchRows.length,
    total_weight: Math.round(weights.reduce((sum, w) => sum + w, 0) * 100) / 100,
    personal_best: weights.reduce((max, w) => Math.max(max, w), 0),
    species_count: new Set(catchRows.map((c) => c.species).filter(Boolean)).size,
    weeks_active: new Set(catchRows.map((c) => weekKey(c.catch_time))).size,
  };

  return {
    next_trip,
    recent_catches,
    top_spots,
    weather: null,
    buddy_suggestion: null,
    statistics,
    timestamp: new Date(now).toISOString(),
  };
}

/**
 * GET /api/dashboard
 *
 * Returns all dashboard sections in one call:
 * - next_trip: Soonest upcoming trip
 * - recent_catches: Last 7 days of catches
 * - top_spots: Most-used spots in last 30 days
 * - weather: Current weather/lunar data
 * - buddy_suggestion: Latest AI Buddy suggestion
 * - statistics: User's 90-day stats (total catches, weight, species, etc)
 * - timestamp: Server time for cache validation
 *
 * Caching:
 * - Response should be cached client-side with 5-minute TTL
 * - Use timestamp field to invalidate stale cache
 *
 * Entitlements:
 * - Authenticated users can always access their own dashboard
 * - Premium features (advanced stats, AI suggestions) still respect plan gating
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const userEmail = req.user.email;
    let data;

    try {
      // Try to call Supabase RPC for aggregated data (optimal path)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_dashboard_data', {
        user_email_param: userEmail,
      });

      if (!rpcError && rpcData) {
        data = rpcData;
      } else {
        // Fallback: RPC doesn't exist yet or failed — manually aggregate
        console.warn('[dashboard] RPC aggregation unavailable, using fallback:', rpcError?.message);
        data = await getAggregatedDataFallback(userEmail);
      }

      // Get user's plan for entitlement checks
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
        userId
      );

      if (userError) {
        console.error('Failed to fetch user for entitlements:', userError);
      }

      const plan = userData?.user ? resolvePlan(userData.user) : { effectiveId: 'free' };

      // Erweiterte Kennzahlen (personal_best, species_count, weeks_active) erst
      // ab Basic; Free sieht nur Anzahl und Gesamtgewicht.
      const stats = data.statistics || {};
      const filteredData = {
        ...data,
        statistics:
          plan.effectiveId === 'free'
            ? { total_catches: stats.total_catches ?? 0, total_weight: stats.total_weight ?? 0 }
            : stats,
      };

      // Set cache headers
      res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
      res.set('ETag', `"${data.timestamp}"`);

      res.json({
        data: filteredData,
        metadata: {
          plan: plan.effectiveId,
          cached_at: new Date().toISOString(),
          ttl_seconds: 300,
        },
      });
    } catch (err) {
      console.error('[dashboard] Error fetching dashboard data:', err.message);

      // Return minimal fallback if both RPC and manual aggregation fail
      return res.status(500).json({
        error: 'Failed to load dashboard',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  })
);

/**
 * POST /api/dashboard/refresh
 *
 * Force refresh dashboard cache (invalidates client-side cache).
 * Useful after mutations (new catch, trip update, etc).
 *
 * Returns: 204 No Content on success
 */
router.post(
  '/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    // In a real app, this would invalidate cached entries in Redis or similar.
    // For now, just acknowledge the request.
    res.status(204).send();
  })
);

export default router;
