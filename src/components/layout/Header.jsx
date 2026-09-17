import React, { useState, useEffect } from "react";
import { Bell, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useSound } from "@/components/utils/SoundManager";
import { User } from "@/entities/User";
import { FishingPlan } from "@/entities/FishingPlan";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import WakeWordIndicator from "@/components/header/WakeWordIndicator";
import EventTimer from "@/components/header/EventTimer";
import LastBuddyMessage from "@/components/header/LastBuddyMessage";
import EventHeaderWidget from "@/components/header/EventHeaderWidget";
import { functions } from "@/api/frontendClient";
import { mobileStack } from "@/lib/MobileStackManager";

export default function Header({
  isSidebarOpen,
  setIsSidebarOpen,
  isDemo
}) {
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();
  const navigate = useNavigate();
  const [activeTripsCount, setActiveTripsCount] = useState(0);
  const [user, setUser] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const loadInitialData = async () => {
    setPlanLoading(true);
    try {
      const [currentUser, planStatusResponse, plans] = await Promise.all([
        User.me().catch(() => null),
        functions.invoke('getPlanStatus').catch(() => null),
        FishingPlan.filter({ is_active: true }).catch(() => [])
      ]);

      if (currentUser) {
        setUser(currentUser);
      }
      setActiveTripsCount(plans?.length || 0);

      const planPayload = planStatusResponse?.data ?? planStatusResponse;
      if (planPayload?.plan) {
        setCurrentPlan(planPayload.plan);
      }
    } catch (error) {
      console.error("Fehler beim Laden:", error);
    }
    setPlanLoading(false);
  };

  useEffect(() => {
    loadInitialData();

    window.addEventListener('weather-alerts-updated', loadInitialData);
    window.addEventListener('active-trips-updated', loadInitialData);
    window.addEventListener('user-refresh-request', loadInitialData);

    return () => {
      window.removeEventListener('weather-alerts-updated', loadInitialData);
      window.removeEventListener('active-trips-updated', loadInitialData);
      window.removeEventListener('user-refresh-request', loadInitialData);
    };
  }, []);

  // Track navigation stack for back button visibility
  useEffect(() => {
    const updateCanGoBack = () => {
      setCanGoBack(mobileStack.canGoBack());
    };

    updateCanGoBack();

    // Listen for navigation changes
    const listener = mobileStack.subscribe(updateCanGoBack);
    return () => {
      if (listener) listener();
    };
  }, []);

  const handleLeftSidebarToggle = () => {
    triggerHaptic('selection');
    playSound('click');
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleBack = () => {
    triggerHaptic('light');
    playSound('click');
    if (mobileStack.handleAndroidBack()) {
      navigate(mobileStack.getCurrentPathname());
    }
  };

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'rgba(6, 14, 24, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderColor: 'rgba(0, 229, 255, 0.12)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="px-3 h-14 flex items-center gap-2">

        {/* Left — back or menu */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canGoBack ? (
            <motion.button
              type="button"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={handleBack}
              aria-label="Zurueck zur vorherigen Seite"
              className="bb-back-btn"
              style={{ minWidth: 40, minHeight: 40 }}
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </motion.button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLeftSidebarToggle}
              aria-label={isSidebarOpen ? 'Menü schliessen' : 'Menü öffnen'}
              aria-expanded={isSidebarOpen}
              style={{
                color: '#00E5FF',
                minWidth: 44,
                minHeight: 44,
                borderRadius: 12,
                background: 'rgba(0,229,255,0.08)',
                border: '1px solid rgba(0,229,255,0.20)',
              }}
            >
              <span className="text-sm font-bold" aria-hidden="true">Menü</span>
            </Button>
          )}

          {/* Plan badge */}
          {!planLoading && currentPlan && currentPlan.id !== 'free' && (
            <Badge
              className="text-[10px] font-semibold whitespace-nowrap border-0"
              style={{
                background: currentPlan.id === 'basic' ? 'rgba(59,130,246,.25)' :
                            currentPlan.id === 'pro'   ? 'rgba(168,85,247,.25)' :
                                                         'rgba(251,191,36,.20)',
                color: currentPlan.id === 'basic' ? '#93c5fd' :
                       currentPlan.id === 'pro'   ? '#d8b4fe' : '#fcd34d',
              }}
            >
              {currentPlan.name}
            </Badge>
          )}
          <EventTimer />
        </div>

        {/* Center — buddy message / demo badge */}
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <LastBuddyMessage />
          {isDemo && (
            <Badge className="bg-amber-500 text-black text-xs font-bold border-0">
              DEMO
            </Badge>
          )}
        </div>

        {/* Right — alerts + wake word */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {activeTripsCount > 0 && (
            <Link to={createPageUrl('TripPlanner')}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${activeTripsCount} aktive Angeltouren`}
                style={{ color: '#00FF9D', minWidth: 44, minHeight: 44, position: 'relative' }}
                onClick={() => { triggerHaptic('light'); playSound('click'); }}
              >
                <Bell aria-hidden="true" className="w-5 h-5" />
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: '#00FF9D', color: '#04111a',
                    fontSize: 10, fontWeight: 700,
                    borderRadius: '50%', width: 18, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {activeTripsCount}
                </motion.span>
              </Button>
            </Link>
          )}
          <EventHeaderWidget />
          <WakeWordIndicator />
        </div>
      </div>
    </header>
  );
}