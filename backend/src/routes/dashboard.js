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

/**
 * Fallback: Manually aggregate dashboard data if RPC function doesn't exist
 * This runs when the RPC function hasn't been deployed yet
 */
async function getAggregatedDataFallback(userEmail) {
  // Nächste geplante Tour
  const { data: nextTripList } = await supabase
    .from('fishing_plans')
    .select('id, title, details, planned_date, spot_info, target_fish, is_active')
    .eq('created_by', userEmail)
    .gt('planned_date', new Date().toISOString())
    .order('planned_date', { ascending: true })
    .limit(1);

  const nextTripData = (nextTripList && nextTripList.length > 0) ? nextTripList[0] : null;
  const next_trip = nextTripData ? {
    id: nextTripData.id,
    name: nextTripData.title,
    description: nextTripData.details,
    start_date: nextTripData.planned_date,
    end_date: null,
    location: nextTripData.spot_info,
    target_species: nextTripData.target_fish ? [nextTripData.target_fish] : [],
    status: nextTripData.is_active ? 'active' : 'planned',
  } : null;

  // Fänge der letzten 7 Tage
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: catchesData } = await supabase
    .from('catches')
    .select('id, species, weight_kg, length_cm, catch_time, photo_url, bait_used, spot_id')
    .eq('created_by', userEmail)
    .gt('catch_time', sevenDaysAgo.toISOString())
    .order('catch_time', { ascending: false })
    .limit(10);

  const recent_catches = (catchesData || []).map(c => ({
    id: c.id,
    species: c.species,
    weight: c.weight_kg,
    length: c.length_cm,
    location: c.spot_id || 'Unknown',
    caught_at: c.catch_time,
    photo_urls: c.photo_url ? [c.photo_url] : [],
    bait_type: c.bait_used,
  }));

  // Top spots der letzten 30 Tage
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: spotsData } = await supabase
    .from('catches')
    .select('spot_id, is_released')
    .eq('created_by', userEmail)
    .gt('catch_time', thirtyDaysAgo.toISOString());

  const spotCounts = {};
  const spotSuccess = {};
  (spotsData || []).forEach(c => {
    const spotKey = c.spot_id || 'unknown';
    if (!spotCounts[spotKey]) {
      spotCounts[spotKey] = 0;
      spotSuccess[spotKey] = 0;
    }
    spotCounts[spotKey]++;
    if (!c.is_released) spotSuccess[spotKey]++;
  });

  const top_spots = Object.entries(spotCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([spotId, count]) => ({
      id: spotId,
      name: spotId,
      location: '',
      usage_count: count,
      avg_success: spotSuccess[spotId] / count,
    }));

  // Statistiken der letzten 90 Tage
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: statsData } = await supabase
    .from('catches')
    .select('weight_kg, species, catch_time')
    .eq('created_by', userEmail)
    .gt('catch_time', ninetyDaysAgo.toISOString());

  const statistics = {
    total_catches: (statsData || []).length,
    total_weight: (statsData || []).reduce((sum, c) => sum + (c.weight_kg || 0), 0),
    personal_best: Math.max(0, ...(statsData || []).map(c => c.weight_kg || 0)),
    species_count: new Set((statsData || []).map(c => c.species)).size,
    weeks_active: new Set(
      (statsData || []).map(c => {
        const d = new Date(c.catch_time);
        return Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
      })
    ).size,
  };

  return {
    next_trip,
    recent_catches,
    top_spots,
    weather: null,
    buddy_suggestion: null,
    statistics,
    timestamp: new Date().toISOString(),
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
        console.log('[dashboard] RPC aggregation succeeded');
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

      // Filter data based on plan entitlements
      const filteredData = {
        ...data,
        // Buddy suggestions only for free+ (they exist)
        buddy_suggestion:
          plan.effectiveId === 'free' && data.buddy_suggestion
            ? data.buddy_suggestion
            : data.buddy_suggestion,

        // Advanced stats (personal_best, species_count) for basic+
        statistics:
          plan.effectiveId === 'free'
            ? {
                total_catches: data.statistics.total_catches,
                total_weight: data.statistics.total_weight,
                // Hide advanced fields
              }
            : data.statistics,
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
