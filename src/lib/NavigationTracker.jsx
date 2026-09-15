import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { appLogs } from "@/api/frontendClient";
import { stackManager } from '@/components/navigation/MobileStackManager';

/**
 * NavigationTracker - One-Way MobileStackManager to React Router Sync
 *
 * MobileStackManager is the SINGLE SOURCE OF TRUTH for navigation.
 * React Router is purely a UI renderer with no history API involvement.
 *
 * Data Flow (ONE-WAY):
 *   1. User/code calls stackManager.push(pageName)
 *   2. StackManager notifies listeners and updates internal state
 *   3. NavigationTracker.useEffect catches change and calls navigate()
 *   4. React Router updates location/UI
 *   5. No feedback loop - changes only flow StackManager -> React Router
 *
 * Key Principles:
 *   - NO react-router history API usage
 *   - NO window.history manipulation
 *   - NO popstate listener (handled by Android/webview)
 *   - Stack-based navigation only
 *   - Single direction: StackManager state drives React Router UI
 */
export default function NavigationTracker() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  /**
   * Listen for StackManager changes and drive React Router UI.
   * This is the PRIMARY mechanism for all navigation.
   */
  useEffect(() => {
    const unsubscribe = stackManager.subscribe((state) => {
      // Convert page name to route path
      const pagePath = state.currentPage === 'Dashboard' 
        ? '/' 
        : `/${state.currentPage}`;

      // Only navigate if path has actually changed
      if (location.pathname !== pagePath) {
        navigate(pagePath, { replace: true });
      }
    });

    return unsubscribe;
  }, [navigate, location.pathname]);

  /**
   * Log app navigation for analytics
   */
  useEffect(() => {
    if (isAuthenticated) {
      appLogs.logUserInApp(location.pathname).catch(() => {});
    }
  }, [location.pathname, isAuthenticated]);

  /**
   * Handle hardware back button (from webview/Android)
   * Direct communication with StackManager - no Router involvement
   */
  useEffect(() => {
    const handlePopState = (event) => {
      event.preventDefault();
      stackManager.handleAndroidBack();
      // StackManager will notify subscribers, which triggers navigate() above
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  /**
   * Handle Escape key as back-button equivalent (for desktop testing)
   */
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        stackManager.handleAndroidBack();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  return null;
}