/**
 * Hook for fetching aggregated dashboard data via BFF endpoint
 *
 * Replaces multiple individual data fetches with a single optimized request.
 * Handles caching, error states, and entitlement-based data filtering.
 *
 * Usage:
 *   const { data, isLoading, error, refetch } = useDashboardData();
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorBanner error={error} />;
 *
 *   return (
 *     <>
 *       <NextTripCard trip={data?.next_trip} />
 *       <RecentCatchesList catches={data?.recent_catches} />
 *     </>
 *   );
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, dashboard } from '@/api/frontendClient';
import { useAuth } from '@/lib/AuthContext';
import { aggregateDashboardData, shouldUseDashboardFallback } from '@/lib/dashboardAggregate';
import { useCallback } from 'react';

export interface DashboardStatistics {
  total_catches: number;
  total_weight: number;
  personal_best?: number;
  species_count?: number;
  weeks_active?: number;
}

export interface NextTrip {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  location: string;
  target_species?: string[];
  status: string;
}

export interface RecentCatch {
  id: string;
  species: string;
  weight: number;
  length?: number;
  location: string;
  caught_at: string;
  photo_urls?: string[];
  bait_type?: string;
}

export interface TopSpot {
  id: string;
  name: string;
  location: string;
  usage_count: number;
  avg_success: number;
}

export interface WeatherSummary {
  temperature?: number;
  condition?: string;
  wind_speed?: number;
  precipitation?: number;
  lunar_phase?: string;
  timestamp?: string;
}

export interface BuddySuggestion {
  suggestion: string;
  type: string;
  generated_at: string;
}

export interface DashboardData {
  next_trip?: NextTrip;
  recent_catches: RecentCatch[];
  top_spots: TopSpot[];
  weather?: WeatherSummary;
  buddy_suggestion?: BuddySuggestion;
  statistics: DashboardStatistics;
  timestamp: string;
}

export interface UseDashboardDataResult {
  data?: DashboardData;
  isLoading: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => Promise<DashboardData | undefined>;
}

/**
 * Lädt die Dashboard-Daten. Fehlt `GET /api/dashboard` auf dem ausgelieferten
 * Backend (404) oder scheitert es serverseitig, werden dieselben Daten aus den
 * Einzel-Endpunkten zusammengesetzt (siehe `src/lib/dashboardAggregate.js`).
 * Scheitert auch das, bleibt der ursprüngliche Fehler sichtbar.
 */
export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const response = await dashboard.getData();
    return response?.data || response;
  } catch (error) {
    if (!shouldUseDashboardFallback(error)) throw error;
    console.warn('[dashboard] /api/dashboard nicht verfügbar, nutze Einzel-Endpunkte:', (error as Error)?.message);
    try {
      const [catches, spots, plans] = await Promise.all([
        api.get('/api/catches?limit=500'),
        api.get('/api/spots'),
        api.get('/api/fishing/plans'),
      ]);
      return aggregateDashboardData({
        catches: Array.isArray(catches) ? catches : [],
        spots: Array.isArray(spots) ? spots : [],
        plans: Array.isArray(plans) ? plans : [],
      }) as DashboardData;
    } catch (fallbackError) {
      console.error('[dashboard] Einzel-Endpunkte ebenfalls fehlgeschlagen:', (fallbackError as Error)?.message);
      throw error;
    }
  }
}

/**
 * Fetch aggregated dashboard data from BFF endpoint
 *
 * Features:
 * - Single aggregated request instead of N+1 queries
 * - Automatic client-side caching with 5-minute TTL
 * - Entitlement-based data filtering (handled server-side)
 * - Background refetch on window focus
 * - Optimistic cache updates after mutations
 * - Offline fallback to cached data
 */
export function useDashboardData(): UseDashboardDataResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<DashboardData, Error>({
    queryKey: ['dashboard', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      return fetchDashboardData();
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (cache time)
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: 1000,
  });

  /**
   * Manually invalidate cache (e.g., after mutations)
   * Called from catch creation, trip updates, spot creation, etc.
   */
  const invalidateCache = useCallback(() => {
    return queryClient.invalidateQueries({
      queryKey: ['dashboard', user?.id],
    });
  }, [queryClient, user?.id]);

  /**
   * Optimistically update cache after a catch is logged
   */
  const updateWithNewCatch = useCallback(
    (newCatch: RecentCatch) => {
      queryClient.setQueryData(
        ['dashboard', user?.id],
        (old: DashboardData | undefined) => {
          if (!old) return old;
          return {
            ...old,
            recent_catches: [newCatch, ...old.recent_catches].slice(0, 10),
            statistics: {
              ...old.statistics,
              total_catches: (old.statistics.total_catches || 0) + 1,
              total_weight: (old.statistics.total_weight || 0) + newCatch.weight,
              personal_best: Math.max(
                old.statistics.personal_best || 0,
                newCatch.weight
              ),
            },
            timestamp: new Date().toISOString(),
          };
        }
      );
    },
    [queryClient, user?.id]
  );

  /**
   * Optimistically update cache after a trip is created
   */
  const updateWithNewTrip = useCallback(
    (newTrip: NextTrip) => {
      queryClient.setQueryData(
        ['dashboard', user?.id],
        (old: DashboardData | undefined) => {
          if (!old) return old;
          return {
            ...old,
            next_trip: newTrip,
            timestamp: new Date().toISOString(),
          };
        }
      );
    },
    [queryClient, user?.id]
  );

  return {
    data,
    isLoading,
    error: error || null,
    isFetching,
    refetch: async () => {
      const result = await refetch();
      return result.data;
    },
    // Exposed for mutations
    invalidateCache,
    updateWithNewCatch,
    updateWithNewTrip,
  };
}

/**
 * Convenience hooks for individual dashboard sections
 */

export function useNextTrip() {
  const { data } = useDashboardData();
  return data?.next_trip;
}

export function useRecentCatches() {
  const { data } = useDashboardData();
  return data?.recent_catches || [];
}

export function useTopSpots() {
  const { data } = useDashboardData();
  return data?.top_spots || [];
}

export function useDashboardStatistics() {
  const { data } = useDashboardData();
  return data?.statistics;
}

export function useBuddySuggestion() {
  const { data } = useDashboardData();
  return data?.buddy_suggestion;
}

export function useDashboardWeather() {
  const { data } = useDashboardData();
  return data?.weather;
}
