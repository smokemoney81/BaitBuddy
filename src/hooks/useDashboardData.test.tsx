import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardData, useNextTrip, useRecentCatches, useTopSpots } from './useDashboardData';
import { api, dashboard } from '@/api/frontendClient';
import * as AuthContext from '@/lib/AuthContext';

// Mock the API
vi.mock('@/api/frontendClient', () => ({
  api: {
    get: vi.fn(),
  },
  dashboard: {
    getData: vi.fn(),
    refresh: vi.fn(),
  },
  auth: {
    me: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock('@/lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('useDashboardData Hook', () => {
  let queryClient: QueryClient;

  const mockDashboardData = {
    data: {
      next_trip: {
        id: 'trip-1',
        name: 'Test Trip',
        location: 'Lake Test',
        start_date: '2026-09-20T08:00:00Z',
        target_species: ['Karpfen'],
        status: 'active',
      },
      recent_catches: [
        {
          id: 'catch-1',
          species: 'Karpfen',
          weight: 12.5,
          location: 'Lake Test',
          caught_at: '2026-09-16T14:30:00Z',
        },
      ],
      top_spots: [
        {
          id: 'spot-1',
          name: 'Test Spot',
          location: 'Lake Test',
          usage_count: 5,
          avg_success: 0.6,
        },
      ],
      weather: {
        temperature: 18,
        condition: 'Sunny',
        wind_speed: 5,
      },
      statistics: {
        total_catches: 10,
        total_weight: 87.3,
        personal_best: 15.2,
        species_count: 3,
        weeks_active: 8,
      },
      timestamp: '2026-09-16T12:00:00Z',
    },
    metadata: {
      plan: 'basic',
      cached_at: '2026-09-16T12:00:00Z',
      ttl_seconds: 300,
    },
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.clearAllMocks();

    // Setup default mock user
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      plan: { effectiveId: 'basic' },
    } as any);
  });

  const renderHookWithQuery = (hook: any) => {
    return renderHook(hook, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
  };

  describe('Basic Data Loading', () => {
    it('should fetch dashboard data on mount', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result } = renderHookWithQuery(() => useDashboardData());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(dashboard.getData).toHaveBeenCalledOnce();
      expect(result.current.data).toEqual(mockDashboardData.data);
    });

    it('should handle loading state', async () => {
      vi.mocked(dashboard.getData).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve(mockDashboardData), 100)
          )
      );

      const { result } = renderHookWithQuery(() => useDashboardData());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockDashboardData.data);
    });

    // TODO: These tests need better mock setup for error cases
    // it('should handle API errors gracefully', async () => { ... });
    // it('should not fetch when user is not authenticated', async () => { ... });
  });

  describe('Fallback ohne /api/dashboard', () => {
    const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

    it('setzt die Daten aus den Einzel-Endpunkten zusammen, wenn die Route fehlt (404)', async () => {
      vi.mocked(dashboard.getData).mockRejectedValue(httpError(404));
      const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const upcoming = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      vi.mocked(api.get).mockImplementation(async (path: string) => {
        if (path.startsWith('/api/catches')) {
          return [{ id: 'c1', species: 'Hecht', weight_kg: 4, catch_time: recent, spot_id: 's1', is_released: false }];
        }
        if (path === '/api/spots') return [{ id: 's1', name: 'Nordufer', latitude: 50, longitude: 7 }];
        if (path === '/api/fishing/plans') return [{ id: 'p1', title: 'Hechttour', planned_date: upcoming }];
        throw new Error(`unerwartet: ${path}`);
      });

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.data?.next_trip?.name).toBe('Hechttour');
      expect(result.current.data?.top_spots[0]).toMatchObject({ id: 's1', name: 'Nordufer', usage_count: 1 });
      expect(result.current.data?.recent_catches[0]).toMatchObject({ id: 'c1', location: 'Nordufer' });
    });

    it('meldet den ursprünglichen Fehler, wenn auch die Einzel-Endpunkte scheitern', async () => {
      vi.mocked(dashboard.getData).mockRejectedValue(httpError(404));
      vi.mocked(api.get).mockRejectedValue(httpError(503));

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      }, { timeout: 3000 });

      expect(result.current.error?.message).toBe('HTTP 404');
    });

    it('weicht bei Auth-Fehlern nicht aus', async () => {
      vi.mocked(dashboard.getData).mockRejectedValue(httpError(401));

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      }, { timeout: 3000 });

      expect(api.get).not.toHaveBeenCalled();
    });
  });

  describe('Caching', () => {
    it('should respect 5-minute stale time', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result: result1 } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result1.current.data).toBeDefined();
      });

      const callCount1 = vi.mocked(dashboard.getData).mock.calls.length;

      // Render again - should use cache
      const { result: result2 } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result2.current.data).toBeDefined();
      });

      const callCount2 = vi.mocked(dashboard.getData).mock.calls.length;
      expect(callCount2).toBe(callCount1); // No additional call
    });

    it('should refetch when invalidateCache is called', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const callsBefore = vi.mocked(dashboard.getData).mock.calls.length;

      // Manually invalidate cache
      if (result.current.invalidateCache) {
        result.current.invalidateCache();
      }

      // Wait for refetch
      await waitFor(() => {
        const callsAfter = vi.mocked(dashboard.getData).mock.calls.length;
        expect(callsAfter).toBeGreaterThan(callsBefore);
      });
    });
  });

  describe('Optimistic Updates', () => {
    it('should update cache with new catch', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const initialCatchCount = result.current.data?.statistics.total_catches || 0;

      const newCatch = {
        id: 'catch-new',
        species: 'Hecht',
        weight: 8.0,
        location: 'Lake Test',
        caught_at: new Date().toISOString(),
      };

      if (result.current.updateWithNewCatch) {
        result.current.updateWithNewCatch(newCatch);
      }

      await waitFor(() => {
        expect(result.current.data?.recent_catches[0]).toEqual(newCatch);
        expect(result.current.data?.statistics.total_catches).toBe(initialCatchCount + 1);
      });
    });

    it('should update cache with new trip', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const newTrip = {
        id: 'trip-new',
        name: 'New Trip',
        location: 'Lake New',
        start_date: '2026-09-25T08:00:00Z',
        target_species: ['Hecht'],
        status: 'active',
      };

      if (result.current.updateWithNewTrip) {
        result.current.updateWithNewTrip(newTrip);
      }

      await waitFor(() => {
        expect(result.current.data?.next_trip).toEqual(newTrip);
      });
    });
  });

  describe('Convenience Hooks', () => {
    it('useNextTrip should return next trip', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result } = renderHookWithQuery(() => useNextTrip());

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      expect(result.current?.name).toBe('Test Trip');
      expect(result.current?.location).toBe('Lake Test');
    });

    // TODO: These convenience hook tests need better query client setup
    // it('useRecentCatches should return catches array', async () => { ... });
    // it('useTopSpots should return spots array', async () => { ... });
  });

  describe('Refetch Capability', () => {
    it('should manually refetch data', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const callsBefore = vi.mocked(dashboard.getData).mock.calls.length;

      // Manual refetch
      await result.current.refetch();

      const callsAfter = vi.mocked(dashboard.getData).mock.calls.length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });

    it('should handle refetch with new data', async () => {
      vi.mocked(dashboard.getData).mockResolvedValue(mockDashboardData);

      const { result } = renderHookWithQuery(() => useDashboardData());

      await waitFor(() => {
        expect(result.current.data).toBeDefined();
      });

      const updatedData = {
        ...mockDashboardData,
        data: {
          ...mockDashboardData.data,
          statistics: {
            ...mockDashboardData.data.statistics,
            total_catches: 15,
          },
        },
      };

      vi.mocked(dashboard.getData).mockResolvedValueOnce(updatedData);

      const newData = await result.current.refetch();

      expect(newData?.statistics.total_catches).toBe(15);
    });
  });
});
