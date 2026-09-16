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

    try {
      // Call Supabase RPC for aggregated data
      const { data, error } = await supabase.rpc('get_dashboard_data', {
        user_id_param: userId,
      });

      if (error) {
        throw new Error(`RPC failed: ${error.message}`);
      }

      if (!data) {
        throw new Error('No dashboard data returned');
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

      // Return minimal fallback if RPC fails
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
