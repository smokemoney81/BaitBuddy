import React, { useState, useEffect, useRef, lazy, Suspense, startTransition } from "react";
import { usePrefetch } from "@/hooks/usePrefetch";
import SEO from "@/components/pwa/SEO";
import { LocationProvider } from "@/components/location/LocationManager";
import OfflineWrapper from "@/components/utils/OfflineWrapper";
import Header from "@/components/layout/Header";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import BottomTabs from "@/components/layout/BottomTabs";
import SubPageHeader from "@/components/layout/SubPageHeader";
import UpdateNotification from "@/components/pwa/UpdateNotification";
import OfflineIndicator from "@/components/pwa/OfflineIndicator";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import SwipeToRefresh from "@/components/utils/SwipeToRefresh";
import { useQueryClient } from "@tanstack/react-query";
import { HapticProvider } from "@/components/utils/HapticFeedback";
import { SoundProvider } from "@/components/utils/SoundManager";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/components/i18n/LanguageContext";
import { PlanProvider } from "@/components/premium/PlanContext";
import TrialBanner from "@/components/premium/TrialBanner";
import { AnimatePresence } from "framer-motion";
import PageTransition from "@/lib/PageTransitionEnhanced";
import { isGuestAllowedPage } from "@/components/utils/guestMode";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { MobileStackProvider } from "@/components/navigation/MobileStackManager";
import BackButtonHandler from "@/components/navigation/BackButtonHandler";

import ErrorBoundary from "@/lib/ErrorBoundary";
import WaterScene from "@/components/home/WaterScene";

// Lazy-loaded nicht-kritische Komponenten
const Sidebar = lazy(() => import("@/components/layout/Sidebar"));
const QuickCatchDialog = lazy(() => import("@/components/log/QuickCatchDialog"));
const EnhancedTicker = lazy(() => import("@/components/layout/TipTicker"));
const FeedbackManager = lazy(() => import("@/components/feedback/FeedbackManager"));
const AIBuddyWidgetStub = lazy(() => import("@/components/layout/AIBuddyWidgetStub"));
const FirstLoginTutorialPrompt = lazy(() => import("@/components/tutorial/FirstLoginTutorialPrompt"));
const GuidedTourController = lazy(() => import("@/components/guidedTour/GuidedTourController"));

const LazyFallback = () => null;

// Wrapper component to prevent lazy-loaded components from blocking rendering
const SuspenseWithErrorBoundary = ({ children }) => (
  <Suspense fallback={<LazyFallback />}>
    <ErrorBoundary isMinimal={true} isFull={false}>
      {children}
    </ErrorBoundary>
  </Suspense>
);

export default function Layout({ children, currentPageName }) {
  usePrefetch();

  return (
    <MobileStackProvider>
      <LayoutContent currentPageName={currentPageName}>
        {children}
      </LayoutContent>
    </MobileStackProvider>
  );
}

function LayoutContent({ children, currentPageName }) {
  const queryClient = useQueryClient();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const scrollPositionsRef = useRef({});
  const [previousPage, setPreviousPage] = useState(null);
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [wakeWordDetector, setWakeWordDetector] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState({
    isActive: false,
    mode: null,
    isListening: false,
    error: null
  });

  const refreshUser = async () => {
    try {
      let currentUser = await auth.me();

      if (currentUser && !currentUser.first_open_at) {
        currentUser = await auth.updateMe({ first_open_at: new Date().toISOString() });
      }

      startTransition(() => {
        setUser(currentUser);
        setAuthLoading(false);
      });
      window.dispatchEvent(new CustomEvent('user-refresh-request'));
    } catch (error) {
      startTransition(() => {
        setUser(null);
        setAuthLoading(false);
      });
    }
  };

  // Track total online time via UsageSession
  useEffect(() => {
    if (!user?.email) return;

    const sessionId = `app_general_${user.email}_${Date.now()}`;
    let sessionDbId = null;

    entities.UsageSession.create({
      session_id: sessionId,
      user_id: user.email,
      feature_id: 'app_general',
      started_at: new Date().toISOString(),
      status: 'active',
      last_heartbeat: new Date().toISOString()
    }).then(s => { sessionDbId = s.id; }).catch(error => {
      console.error('Error creating usage session:', error);
    });

    const heartbeat = setInterval(async () => {
      if (!sessionDbId) return;
      try {
        await entities.UsageSession.update(sessionDbId, {
          last_heartbeat: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error updating heartbeat:', error);
      }
    }, 30000);

    const stopSession = async () => {
      if (!sessionDbId) return;
      try {
        await entities.UsageSession.update(sessionDbId, {
          status: 'stopped',
          stopped_at: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error stopping session:', error);
      }
    };

    const handleBeforeUnload = () => {
      if (!sessionDbId) return;
      const payload = JSON.stringify({
        status: 'stopped',
        stopped_at: new Date().toISOString()
      });
      navigator.sendBeacon?.(`/api/usage-sessions/${sessionDbId}`, new Blob([payload], { type: 'application/json' }));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopSession();
    };
  }, [user?.email]);

  useEffect(() => {
    // requestIdleCallback fehlt in manchen WebViews/In-App-Browsern (z. B. iOS
    // Safari < 16.4, Facebook/Messenger-In-App-Browser). Ein nackter Verweis
    // auf die Variable wirft dort "Can't find variable: requestIdleCallback"
    // und crasht die App in die ErrorBoundary — deshalb per typeof absichern.
    const hasIdleCallback = typeof requestIdleCallback !== 'undefined';
    const id = hasIdleCallback
      ? requestIdleCallback(() => refreshUser())
      : setTimeout(() => refreshUser(), 0);
    return () => {
      if (hasIdleCallback && typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (previousPage && previousPage !== currentPageName) {
      scrollPositionsRef.current[previousPage] = window.scrollY;
    }

    const savedPosition = scrollPositionsRef.current[currentPageName];
    if (savedPosition !== undefined) {
      setTimeout(() => window.scrollTo(0, savedPosition), 50);
    } else {
      setTimeout(() => window.scrollTo(0, 0), 50);
    }

    setPreviousPage(currentPageName);
  }, [currentPageName]);

  useEffect(() => {
    const handleToggleVoiceControl = () => {
      // Deaktiviere WakeWordDetector auf VoiceControl Seite
      if (currentPageName === 'VoiceControl') {
        return;
      }

      if (!wakeWordDetector) {
        const detector = new WakeWordDetector(
          'Hey Buddy',
          () => {
            window.dispatchEvent(new CustomEvent('wake-word-detected'));
          },
          (status, error) => {
            setVoiceStatus({
              isActive: true,
              mode: detector.currentMode,
              isListening: detector.isListening,
              error: error
            });
          },
          'auto'
        );
        setWakeWordDetector(detector);
        detector.start();
      } else {
        if (wakeWordDetector.isListening) {
          wakeWordDetector.stop();
          setVoiceStatus({
            isActive: false,
            mode: null,
            isListening: false,
            error: null
          });
          setWakeWordDetector(null);
        } else {
          wakeWordDetector.start();
        }
      }
    };

    const handleWakeWordStatusChange = (event) => {
      if (event.detail) {
        setVoiceStatus(event.detail);
      }
    };

    window.addEventListener('toggle-voice-control', handleToggleVoiceControl);
    window.addEventListener('wake-word-status-change', handleWakeWordStatusChange);

    // Cleanup wenn auf VoiceControl Seite navigiert wird
    if (currentPageName === 'VoiceControl' && wakeWordDetector?.isListening) {
      wakeWordDetector.stop();
      setWakeWordDetector(null);
    }

    return () => {
      window.removeEventListener('toggle-voice-control', handleToggleVoiceControl);
      window.removeEventListener('wake-word-status-change', handleWakeWordStatusChange);
      if (wakeWordDetector) {
        wakeWordDetector.stop();
      }
    };
  }, [wakeWordDetector, currentPageName]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloadedForUpdate = false;
    let updateInterval = null;

    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (!hadController) return;
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        updateInterval = setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('sw-update-available'));
            }
          });
        });
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (updateInterval) clearInterval(updateInterval);
    };
  }, []);

  // Landing Page - nur SEO
  if (currentPageName === 'Home') {
    return (
      <>
        <SEO />
        {children}
        <Toaster
          position="bottom-center"
          offset="80px"
          expand={true}
          richColors={true}
          className="toaster-custom"
          toastOptions={{
            duration: 4000,
            className: 'toast-animated',
          }}
        />
      </>
    );
  }

  // Auth noch nicht aufgelöst Spinner statt Gast-Redirect
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-700 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  const isGuest = !user;
  const isDemo = user?.is_demo_user === true;

  // Gastmodus: Weiterleitung falls Seite nicht erlaubt
  if (isGuest && !isGuestAllowedPage(currentPageName) && currentPageName !== 'Home') {
    return (
      <PlanProvider>
        <LanguageProvider>
          <HapticProvider>
            <SoundProvider>
              <LocationProvider>
                <div className="min-h-screen bg-gray-950 text-slate-50 flex items-center justify-center p-6">
                  <SEO />
                  <Toaster />
                  <div className="max-w-md w-full text-center space-y-6">
                    <div className="text-6xl mb-4">--</div>
                    <h1 className="text-2xl font-bold text-white">Anmeldung erforderlich</h1>
                    <p className="text-gray-400">
                      Diese Funktion ist nur fuer angemeldete Nutzer verfuegbar.
                    </p>
                    <div className="flex flex-col gap-3">
                      <button type="button"
                        onClick={() => auth.redirectToLogin()}
                        className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition-colors"
                      >
                        Jetzt anmelden
                      </button>
                      <Link
                        to={createPageUrl('Dashboard')}
                        className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-semibold transition-colors text-center block"
                      >
                        Zurueck zum Dashboard
                      </Link>
                    </div>
                    <p className="text-xs text-gray-500">
                      Im Gastmodus verfuegbar: Dashboard, KI-Buddy (Demo), Fangbuch, Profil, Einstellungen, Tutorials
                    </p>
                  </div>
                </div>
              </LocationProvider>
            </SoundProvider>
          </HapticProvider>
        </LanguageProvider>
      </PlanProvider>
    );
  }

  return (
    <>
      <BackButtonHandler />
      <PlanProvider>
        <LanguageProvider>
          <HapticProvider>
            <SoundProvider>
              <LocationProvider>
                <OfflineWrapper>
            <div className="bb-app min-h-screen text-slate-50 relative overflow-hidden">
              <SEO />
              
              {/* PWA Components */}
              <InstallPrompt />
              <UpdateNotification />
              <OfflineIndicator />
              
              {/* Unterwasser-Hintergrund (nur auf der Landingpage) */}
              {currentPageName === 'Home' && <WaterScene />}

              {/* Content Layer */}
              <div className="relative" style={{ zIndex: 1 }}>
                {isDemo && (
                  <div className="bg-amber-500 text-black text-center text-xs font-bold py-1 z-50 relative">
                    DEMO-MODUS AKTIV
                  </div>
                )}

                <TrialBanner />

                <SuspenseWithErrorBoundary>
                  <QuickCatchDialog />
                </SuspenseWithErrorBoundary>

                <SuspenseWithErrorBoundary>
                  <FeedbackManager />
                </SuspenseWithErrorBoundary>

                {user && (
                  <SuspenseWithErrorBoundary>
                    <FirstLoginTutorialPrompt />
                  </SuspenseWithErrorBoundary>
                )}

                <SuspenseWithErrorBoundary>
                  <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} currentPageName={currentPageName} user={user} loading={authLoading} />
                </SuspenseWithErrorBoundary>

                <div className="sticky top-0 z-40 bg-[#06223a]/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                  <Header 
                    isSidebarOpen={isSidebarOpen}
                    setIsSidebarOpen={setIsSidebarOpen} 
                    isDemo={isDemo}
                  />
                  <SuspenseWithErrorBoundary>
                    <EnhancedTicker />
                  </SuspenseWithErrorBoundary>
                  <SubPageHeader title={currentPageName} />
                </div>

                <div className="w-full min-h-screen px-0 sm:px-0">
                  <SwipeToRefresh onRefresh={() => queryClient.invalidateQueries()}>
                    <AnimatePresence initial={false}>
                      <PageTransition key={currentPageName}>
                        {children}
                      </PageTransition>
                    </AnimatePresence>
                  </SwipeToRefresh>
                </div>

                <BottomTabs />

                <SuspenseWithErrorBoundary>
                  <AIBuddyWidgetStub />
                </SuspenseWithErrorBoundary>

                <SuspenseWithErrorBoundary>
                  <GuidedTourController />
                </SuspenseWithErrorBoundary>

                <Toaster 
                  position="bottom-center"
                  offset="80px"
                  expand={true}
                  richColors={true}
                  className="toaster-custom"
                  toastOptions={{
                    duration: 4000,
                    className: 'toast-animated',
                  }}
                />
              </div>

              <style>{`
                :root {
                  --radius: 1rem;
                  --background: 11 19 36;
                  --foreground: 248 250 252;
                  --catchly: #165DFF;
                }
                body { 
                  background: rgb(var(--background)); 
                  color: rgb(var(--foreground)); 
                }
                .glass-morphism { 
                  background: rgba(15,23,42,0.7); 
                  backdrop-filter: blur(16px); 
                  border: 1px solid rgba(51,65,85,0.3); 
                }
                html { 
                  scroll-behavior: smooth; 
                }
                
                [data-sonner-toast] {
                  background: rgba(15, 23, 42, 0.9) !important;
                  backdrop-filter: blur(16px);
                  border: 1px solid rgba(51, 65, 85, 0.5) !important;
                  color: rgb(248, 250, 252) !important;
                  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5) !important;
                }

                [data-sonner-toast][data-type="success"] {
                  border-color: rgba(16, 185, 129, 0.5) !important;
                  background: rgba(15, 23, 42, 0.95) !important;
                }

                [data-sonner-toast][data-type="success"]::before {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  bottom: 0;
                  width: 4px;
                  background: linear-gradient(to bottom, #10b981, #059669);
                  border-radius: 1rem 0 0 1rem;
                }

                [data-sonner-toast][data-type="error"] {
                  border-color: rgba(239, 68, 68, 0.5) !important;
                  background: rgba(15, 23, 42, 0.95) !important;
                }

                [data-sonner-toast][data-type="error"]::before {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  bottom: 0;
                  width: 4px;
                  background: linear-gradient(to bottom, #ef4444, #dc2626);
                  border-radius: 1rem 0 0 1rem;
                }

                [data-sonner-toast][data-type="warning"] {
                  border-color: rgba(245, 158, 11, 0.5) !important;
                  background: rgba(15, 23, 42, 0.95) !important;
                }

                [data-sonner-toast][data-type="warning"]::before {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  bottom: 0;
                  width: 4px;
                  background: linear-gradient(to bottom, #f59e0b, #d97706);
                  border-radius: 1rem 0 0 1rem;
                }

                [data-sonner-toast][data-type="info"] {
                  border-color: rgba(34, 211, 238, 0.5) !important;
                  background: rgba(15, 23, 42, 0.95) !important;
                }

                [data-sonner-toast][data-type="info"]::before {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  bottom: 0;
                  width: 4px;
                  background: linear-gradient(to bottom, #22d3ee, #06b6d4);
                  border-radius: 1rem 0 0 1rem;
                }

                [data-sonner-toast] [data-title] {
                  color: rgb(248, 250, 252) !important;
                  font-weight: 600;
                }

                [data-sonner-toast] [data-description] {
                  color: rgba(203, 213, 225, 0.9) !important;
                }

                [data-sonner-toast] [data-button] {
                  background: rgba(34, 211, 238, 0.2) !important;
                  color: rgb(34, 211, 238) !important;
                  border: 1px solid rgba(34, 211, 238, 0.3) !important;
                }

                [data-sonner-toast] [data-button]:hover {
                  background: rgba(34, 211, 238, 0.3) !important;
                }

                [data-sonner-toast] [data-close-button] {
                  color: rgba(203, 213, 225, 0.7) !important;
                }

                [data-sonner-toast] [data-close-button]:hover {
                  color: rgb(248, 250, 252) !important;
                  background: rgba(51, 65, 85, 0.5) !important;
                }

                @keyframes toastSlideInBounce {
                  0% {
                    transform: translateY(100%) scale(0.8);
                    opacity: 0;
                  }
                  50% {
                    transform: translateY(-10px) scale(1.05);
                    opacity: 1;
                  }
                  70% {
                    transform: translateY(5px) scale(0.98);
                  }
                  100% {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                  }
                }

                @keyframes toastSuccessPop {
                  0% {
                    transform: translateY(100%) scale(0.5) rotate(-5deg);
                    opacity: 0;
                  }
                  50% {
                    transform: translateY(-15px) scale(1.1) rotate(2deg);
                    opacity: 1;
                  }
                  70% {
                    transform: translateY(5px) scale(0.95) rotate(-1deg);
                  }
                  100% {
                    transform: translateY(0) scale(1) rotate(0deg);
                    opacity: 1;
                  }
                }

                @keyframes toastErrorShake {
                  0% {
                    transform: translateY(100%) translateX(0);
                    opacity: 0;
                  }
                  40% {
                    transform: translateY(0) translateX(0);
                    opacity: 1;
                  }
                  45% {
                    transform: translateY(0) translateX(-10px);
                  }
                  55% {
                    transform: translateY(0) translateX(10px);
                  }
                  65% {
                    transform: translateY(0) translateX(-8px);
                  }
                  75% {
                    transform: translateY(0) translateX(6px);
                  }
                  85% {
                    transform: translateY(0) translateX(-3px);
                  }
                  100% {
                    transform: translateY(0) translateX(0);
                    opacity: 1;
                  }
                }

                @keyframes toastWarningPulse {
                  0% {
                    transform: translateY(100%) scale(0.7);
                    opacity: 0;
                    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
                  }
                  50% {
                    transform: translateY(-5px) scale(1.08);
                    opacity: 1;
                    box-shadow: 0 0 20px 10px rgba(245, 158, 11, 0.3);
                  }
                  100% {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
                  }
                }

                @keyframes toastInfoSlide {
                  0% {
                    transform: translateX(100%) scale(0.9);
                    opacity: 0;
                  }
                  60% {
                    transform: translateX(-10px) scale(1.02);
                    opacity: 1;
                  }
                  100% {
                    transform: translateX(0) scale(1);
                    opacity: 1;
                  }
                }

                .toast-animated {
                  animation: toastSlideInBounce 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                }

                [data-sonner-toast][data-type="success"] {
                  animation: toastSuccessPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
                }

                [data-sonner-toast][data-type="error"] {
                  animation: toastErrorShake 0.7s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
                }

                [data-sonner-toast][data-type="warning"] {
                  animation: toastWarningPulse 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
                }

                [data-sonner-toast][data-type="info"] {
                  animation: toastInfoSlide 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
                }

                [data-sonner-toast][data-type="success"]::after {
                  content: '';
                  position: absolute;
                  inset: -2px;
                  border-radius: inherit;
                  background: linear-gradient(45deg, transparent, rgba(16, 185, 129, 0.3), transparent);
                  animation: successGlow 0.6s ease-out;
                  pointer-events: none;
                  z-index: -1;
                }

                @keyframes successGlow {
                  0%, 100% {
                    opacity: 0;
                  }
                  50% {
                    opacity: 1;
                  }
                }

                [data-sonner-toast][data-type="error"] {
                  box-shadow: 0 10px 40px -10px rgba(239, 68, 68, 0.5) !important;
                }

                [data-sonner-toast][data-type="warning"] {
                  border: 2px solid rgba(245, 158, 11, 0.5) !important;
                }
              `}</style>
            </div>
              </OfflineWrapper>
            </LocationProvider>
            </SoundProvider>
          </HapticProvider>
          </LanguageProvider>
        </PlanProvider>
        </>
      );
    }
