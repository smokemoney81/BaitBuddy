import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const PAGE_PREFETCH_MAP = {
  'Home': ['Dashboard', 'Map', 'Login'],
  'Dashboard': ['Log', 'Rank', 'Map', 'Logbook', 'Community'],
  'Logbook': ['Community', 'Rank', 'Analysis', 'Log'],
  'Log': ['Logbook', 'Community', 'Dashboard'],
  'Rank': ['Community', 'Logbook', 'Dashboard'],
  'Community': ['Rank', 'Logbook', 'Dashboard'],
  'Map': ['Dashboard', 'WaterAnalysis', 'Weather'],
  'WaterAnalysis': ['Map', 'Weather', 'Analysis'],
  'Weather': ['WaterAnalysis', 'Analysis', 'Dashboard'],
  'Analysis': ['AI', 'Logbook', 'WaterAnalysis'],
  'AI': ['Analysis', 'Dashboard', 'Logbook'],
  'Shop': ['Premium', 'Dashboard', 'Gear'],
  'Premium': ['Shop', 'Dashboard', 'PremiumPlans'],
  'Gear': ['Logbook', 'Community', 'Dashboard'],
  'Events': ['Community', 'Rank', 'Dashboard'],
  'Quiz': ['Dashboard', 'Logbook'],
  'Devices': ['Dashboard', 'Map'],
  'Settings': ['Dashboard', 'Profile'],
  'Profile': ['Settings', 'Dashboard'],
  'Rank': ['Community', 'Logbook', 'Dashboard'],
  'BaitMixer': ['Logbook', 'Dashboard'],
  'TripPlanner': ['Map', 'Logbook', 'Dashboard'],
  'BathymetricCrowdsourcing': ['Map', 'Devices'],
  'AngelscheinPruefungSchonzeiten': ['Dashboard'],
  'ARKnotenAssistent': ['Gear', 'Dashboard'],
  'CatchCam': ['AI', 'Logbook'],
  'KiBuddyBeta': ['AI', 'Dashboard'],
  'Start': ['Dashboard', 'Home'],
};

// Adaptive prefetch delay based on network conditions
const PREFETCH_DELAY = 5000; // 5 seconds
const SLOW_NETWORK_DELAY = 10000; // 10 seconds for slow connections
const FAST_NETWORK_DELAY = 2000; // 2 seconds for fast connections

function getPrefetchDelay() {
  if ('connection' in navigator) {
    const connection = navigator.connection;
    if (connection.effectiveType === '4g') {
      return FAST_NETWORK_DELAY;
    } else if (connection.effectiveType === '2g' || connection.effectiveType === '3g') {
      return SLOW_NETWORK_DELAY;
    }
  }
  return PREFETCH_DELAY;
}

export function usePredictivePrefetch(currentPageName) {
  const queryClient = useQueryClient();
  const timerRef = useRef(null);
  const prefetchedRef = useRef(new Set());

  const prefetchPage = useCallback(async (pageName) => {
    // Avoid duplicate prefetches
    if (prefetchedRef.current.has(pageName)) {
      return;
    }

    try {
      // Prefetch common query keys for that page
      const queryKeyMap = {
        'Logbook': ['catches', 'spots', 'recent-catches'],
        'Log': ['catches', 'recent-logs'],
        'Rank': ['leaderboard', 'rankings', 'user-stats'],
        'Community': ['posts', 'competitions', 'recent-activity', 'users'],
        'Map': ['mapSpots', 'mapClubs', 'user-locations'],
        'WaterAnalysis': ['waterData', 'satellite-data'],
        'Gear': ['userGear', 'available-gear'],
        'Analysis': ['catches', 'ai-analysis', 'stats'],
        'Weather': ['weatherData', 'forecast'],
        'Dashboard': ['summary-stats', 'recent-activity'],
        'Premium': ['plans', 'user-subscription'],
        'Shop': ['products', 'shop-items'],
        'Events': ['upcoming-events', 'event-details'],
        'Quiz': ['quiz-questions', 'user-progress'],
        'Devices': ['connected-devices', 'device-status'],
        'BaitMixer': ['recipes', 'ingredients'],
        'TripPlanner': ['planned-trips', 'locations'],
        'BathymetricCrowdsourcing': ['depth-data', 'maps'],
        'Profile': ['user-profile', 'user-stats'],
        'Settings': ['user-settings'],
      };

      const keysToFetch = queryKeyMap[pageName] || [];
      
      for (const key of keysToFetch) {
        try {
          await queryClient.prefetchQuery({
            queryKey: [key],
            staleTime: 30000, // 30 seconds
          });
          prefetchedRef.current.add(pageName);
        } catch (e) {
          // Silently fail - prefetch is best-effort
          console.debug(`Prefetch for ${pageName} key ${key} failed:`, e.message);
        }
      }
    } catch (e) {
      console.debug(`Prefetch for ${pageName} failed:`, e.message);
    }
  }, [queryClient]);

  useEffect(() => {
    const nextPages = PAGE_PREFETCH_MAP[currentPageName] || [];
    
    if (nextPages.length === 0) {
      return;
    }

    // Adaptive delay based on network speed
    const delay = getPrefetchDelay();
    
    // Set timer to prefetch after adaptive delay
    timerRef.current = setTimeout(() => {
      nextPages.forEach(pageName => {
        prefetchPage(pageName);
      });
    }, delay);

    // Cleanup on page change or unmount
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentPageName, prefetchPage]);
}