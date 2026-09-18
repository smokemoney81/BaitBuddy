/**
 * Dashboard BFF (Backend For Frontend) API
 *
 * Single aggregated endpoint for all dashboard data.
 * Replaces multiple scattered requests with one efficient call.
 *
 * GET /api/dashboard
 *   Returns aggregated dashboard data via Supabase RPC
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { supabase } from '../lib/supabase.js';
import { resolvePlan } from '../lib/planResolver.js';

const router = Router();

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

    try {
      let data = null;
      let rpcError = null;

      // Versuch 1: Nutze RPC-Funktion (schneller, wenn sie existiert)
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_dashboard_data', {
        user_email_param: userEmail,
      });

      if (!rpcErr && rpcData) {
        data = rpcData;
      } else {
        rpcError = rpcErr;
        console.warn('[dashboard] RPC failed, falling back to direct queries:', rpcErr?.message);

        // Fallback: Sammle Daten direkt aus den Tabellen
        const [nextTripResult, catchesResult, spotsResult, statsResult] = await Promise.all([
          // Nächste geplante Tour
          supabase
            .from('fishing_plans')
            .select('id, title, details, planned_date, spot_info, target_fish, is_active')
            .eq('created_by', userEmail)
            .gt('planned_date', new Date().toISOString())
            .order('planned_date', { ascending: true })
            .limit(1)
            .single()
            .catch(() => ({ data: null })),

          // Fänge der letzten 7 Tage
          supabase
            .from('catches')
            .select('id, species, weight_kg, length_cm, spot_name, catch_time, photo_url, bait_used')
            .eq('created_by', userEmail)
            .gt('catch_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('catch_time', { ascending: false })
            .limit(10),

          // Top-Spots der letzten 30 Tage
          supabase
            .from('catches')
            .select('spot_name, spot_id')
            .eq('created_by', userEmail)
            .gt('catch_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

          // Statistiken der letzten 90 Tage
          supabase
            .from('catches')
            .select('species, weight_kg, catch_time, is_released')
            .eq('created_by', userEmail)
            .gt('catch_time', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
        ]);

        // Formatiere die Ergebnisse
        const nextTrip = nextTripResult.data ? {
          id: nextTripResult.data.id,
          name: nextTripResult.data.title,
          description: nextTripResult.data.details,
          start_date: nextTripResult.data.planned_date,
          end_date: null,
          location: nextTripResult.data.spot_info,
          target_species: nextTripResult.data.target_fish ? [nextTripResult.data.target_fish] : [],
          status: nextTripResult.data.is_active ? 'active' : 'planned',
        } : null;

        const recentCatches = (catchesResult.data || []).map(c => ({
          id: c.id,
          species: c.species,
          weight: c.weight_kg,
          length: c.length_cm,
          location: c.spot_name,
          caught_at: c.catch_time,
          photo_urls: c.photo_url ? [c.photo_url] : [],
          bait_type: c.bait_used,
        }));

        // Gruppiere Spots
        const spotMap = new Map();
        (spotsResult.data || []).forEach(c => {
          if (c.spot_name) {
            spotMap.set(c.spot_name, (spotMap.get(c.spot_name) || 0) + 1);
          }
        });
        const topSpots = Array.from(spotMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({
            id: name,
            name,
            location: '',
            usage_count: count,
            avg_success: 0.5,
          }));

        // Berechne Statistiken
        const stats = {
          total_catches: (statsResult.data || []).length,
          total_weight: (statsResult.data || []).reduce((sum, c) => sum + (c.weight_kg || 0), 0),
          personal_best: Math.max(0, ...(statsResult.data || []).map(c => c.weight_kg || 0)),
          species_count: new Set((statsResult.data || []).map(c => c.species)).size,
          weeks_active: new Set(
            (statsResult.data || []).map(c => {
              const d = new Date(c.catch_time);
              return Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
            })
          ).size,
        };

        data = {
          next_trip: nextTrip,
          recent_catches: recentCatches,
          top_spots: topSpots,
          weather: null,
          buddy_suggestion: null,
          statistics: stats,
          timestamp: new Date().toISOString(),
        };
      }

      if (!data) {
        return res.status(500).json({
          error: 'Failed to load dashboard',
          message: process.env.NODE_ENV === 'development' ? rpcError?.message : undefined,
        });
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
        statistics:
          plan.effectiveId === 'free'
            ? {
                total_catches: data.statistics.total_catches,
                total_weight: data.statistics.total_weight,
              }
            : data.statistics,
      };

      // Set cache headers
      res.set('Cache-Control', 'private, max-age=300');
      res.json({
        data: filteredData,
        metadata: {
          plan: plan.effectiveId,
          cached_at: new Date().toISOString(),
          ttl_seconds: 300,
        },
      });
    } catch (err) {
      console.error('[dashboard] Fatal error fetching dashboard data:', err.message, err.stack);

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
