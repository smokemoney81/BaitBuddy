import React, { Suspense, useEffect } from 'react'
import './App.css'
import './globals.css'
import './styles/baitbuddy-v2.css'
import { BuddyPreferencesProvider } from '@/lib/BuddyPreferencesContext';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { NavigationProvider } from '@/lib/NavigationContext'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { initializeDeepLinking } from '@/lib/deepLinkHandler';
import { AnimatePresence } from 'framer-motion';
import PageNotFound from './lib/PageNotFound';

import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import { GuidedTourProvider } from '@/contexts/GuidedTourContext';
import SplashIntro from '@/components/intro/SplashIntro';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ErrorBoundary from '@/lib/ErrorBoundary';
import { initAutoSync } from '@/components/utils/offlineSync';
import { initNetworkStatus } from '@/utils/networkStatus';
import { prefetchAllPages } from '@/lib/prefetchPages';
import { lazyPage } from '@/lib/lazyPage';
const CatchStats = lazyPage(() => import('@/pages/CatchStats'));
const AdminTracking = lazyPage(() => import('@/pages/AdminTracking'));
const Help = lazyPage(() => import('@/pages/Help'));
const EventCatalog = lazyPage(() => import('@/pages/EventCatalog'));
const EventDetails = lazyPage(() => import('@/pages/EventDetails'));
const EventCreate = lazyPage(() => import('@/pages/EventCreate'));
const MonthlyLeaderboard = lazyPage(() => import('@/pages/MonthlyLeaderboard'));
const Koeder3D = lazyPage(() => import('@/pages/Koeder3D'));
import PageViewTracker from '@/components/utils/PageViewTracker';

const LazyPageFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-950">
    <div className="w-8 h-8 border-4 border-gray-700 border-t-cyan-400 rounded-full animate-spin" />
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <LazyPageFallback />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // AnimatePresence needs location from inside Router
  return <AnimatedRoutes />;
};

const AnimatedRoutes = () => {
  const location = useLocation();
  const { Pages, Layout, mainPage } = pagesConfig;
  const mainPageKey = mainPage ?? Object.keys(Pages)[0];
  const MainPage = mainPageKey ? Pages[mainPageKey] : null;

  // Erstes Pfadsegment statt kompletter Rest-Pfad: bei den zusätzlichen
  // verschachtelten Routen (/events/create, /events/:id, /leaderboards/monthly)
  // lieferte .slice(1) z.B. "events/create" — das matcht keinen PAGES-Key und
  // machte Sidebar-Hervorhebung, Gast-Zugriffsprüfung und die
  // Scroll-Position-Logik in Layout.jsx für diese Routen wirkungslos.
  const currentPageName = location.pathname === '/'
    ? mainPageKey
    : location.pathname.split('/')[1];

  const routeContent = (
    <Suspense fallback={<LazyPageFallback />}>
      <AnimatePresence initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <ErrorBoundary>
              {MainPage && <MainPage />}
            </ErrorBoundary>
          } />
          {Object.entries(Pages).map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <ErrorBoundary>
                  <Page />
                </ErrorBoundary>
              }
            />
          ))}
          <Route path="/CatchStats" element={
            <ErrorBoundary><CatchStats /></ErrorBoundary>
          } />
          <Route path="/AdminTracking" element={
            <ErrorBoundary><AdminTracking /></ErrorBoundary>
          } />
          <Route path="/Help" element={
            <ErrorBoundary><Help /></ErrorBoundary>
          } />
          <Route path="/events-catalog" element={
            <ErrorBoundary><EventCatalog /></ErrorBoundary>
          } />
          <Route path="/events/create" element={
            <ErrorBoundary><EventCreate /></ErrorBoundary>
          } />
          <Route path="/events/:eventId" element={
            <ErrorBoundary><EventDetails /></ErrorBoundary>
          } />
          <Route path="/leaderboards/monthly" element={
            <ErrorBoundary><MonthlyLeaderboard /></ErrorBoundary>
          } />
          <Route path="/Koeder3D" element={
            <ErrorBoundary><Koeder3D /></ErrorBoundary>
          } />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );

  if (!Layout) return routeContent;

  return (
    <Layout currentPageName={currentPageName}>
      {routeContent}
    </Layout>
  );
};


function App() {
  // Initialize deep-linking, network status and offline sync on app startup
  useEffect(() => {
    initializeDeepLinking().catch(err => {
      console.error('[App] Deep-link init failed:', err);
    });
    initNetworkStatus().catch(err => {
      console.error('[App] Network status init failed:', err);
    });
    initAutoSync();
    // Alle Seiten-Chunks im Hintergrund vorladen, damit sie offline verfügbar
    // sind (der SW cached sie per Stale-While-Revalidate erst nach dem Abruf).
    prefetchAllPages();
  }, []);

  return (
    <ErrorBoundary>
      <SplashIntro />
      <AuthProvider>
        <BuddyPreferencesProvider>
        <ThemeProvider>
          <GuidedTourProvider>
            <QueryClientProvider client={queryClientInstance}>
                <Router>
                  <NavigationProvider>
                    <NavigationTracker />
                    <PageViewTracker />
                    <AuthenticatedApp />
                  </NavigationProvider>
                </Router>
              <Toaster />
              <VisualEditAgent />
            </QueryClientProvider>
          </GuidedTourProvider>
        </ThemeProvider>
        </BuddyPreferencesProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
