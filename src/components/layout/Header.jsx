import React, { useState, useEffect } from "react";
import { Bell, ArrowLeft, Menu } from "lucide-react";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useSound } from "@/components/utils/SoundManager";
import { User } from "@/entities/User";
import { FishingPlan } from "@/entities/FishingPlan";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import WakeWordIndicator from "@/components/header/WakeWordIndicator";
import EventTimer from "@/components/header/EventTimer";
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
  const [canGoBack, setCanGoBack] = useState(false);

  const loadInitialData = async () => {
    try {
      const [currentUser, planStatusResponse, plans] = await Promise.all([
        User.me().catch(() => null),
        functions.invoke('getPlanStatus').catch(() => null),
        FishingPlan.filter({ is_active: true }).catch(() => [])
      ]);

      if (currentUser) setUser(currentUser);
      setActiveTripsCount(plans?.length || 0);

      const planPayload = planStatusResponse?.data ?? planStatusResponse;
      if (planPayload?.plan) setCurrentPlan(planPayload.plan);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
    }
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

  useEffect(() => {
    const updateCanGoBack = () => setCanGoBack(mobileStack.canGoBack());
    updateCanGoBack();
    const listener = mobileStack.subscribe(updateCanGoBack);
    return () => { if (listener) listener(); };
  }, []);

  const handleBack = () => {
    triggerHaptic('light');
    playSound('click');
    if (mobileStack.handleAndroidBack()) {
      navigate(mobileStack.getCurrentPathname());
    }
  };

  const handleMenuOpen = () => {
    triggerHaptic('selection');
    playSound('click');
    setIsSidebarOpen(!isSidebarOpen);
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : null;

  return (
    <header className="bb-header">
      <div className="bb-header-inner">
        {/* Left — back or logo */}
        <div className="bb-header-left">
          {canGoBack ? (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Zurueck zur vorherigen Seite"
              className="bb-header-icon-btn"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleMenuOpen}
              aria-label={isSidebarOpen ? 'Menue schliessen' : 'Menue oeffnen'}
              aria-expanded={isSidebarOpen}
              className="bb-header-icon-btn"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          )}
          <Link to="/Dashboard" className="bb-header-logo" aria-label="BaitBuddy Startseite">
            BaitBuddy
          </Link>
          {currentPlan && currentPlan.id !== 'free' && (
            <span
              className="bb-header-badge"
              style={{
                '--badge-bg': currentPlan.id === 'basic' ? 'rgba(59,130,246,.20)' :
                              currentPlan.id === 'pro'   ? 'rgba(168,85,247,.20)' :
                                                           'rgba(251,191,36,.15)',
                '--badge-color': currentPlan.id === 'basic' ? '#93c5fd' :
                                 currentPlan.id === 'pro'   ? '#d8b4fe' : '#fcd34d',
              }}
            >
              {currentPlan.name}
            </span>
          )}
        </div>

        {/* Right — notifications, events, avatar */}
        <div className="bb-header-right">
          <EventTimer />
          <EventHeaderWidget />
          <WakeWordIndicator />

          {activeTripsCount > 0 && (
            <Link
              to={createPageUrl('TripPlanner')}
              className="bb-header-icon-btn bb-header-bell"
              aria-label={`${activeTripsCount} aktive Angeltouren`}
              onClick={() => { triggerHaptic('light'); playSound('click'); }}
            >
              <Bell size={20} aria-hidden="true" />
              <span className="bb-header-bell-count">{activeTripsCount}</span>
            </Link>
          )}

          {isDemo && (
            <span className="bb-header-badge" style={{ '--badge-bg': 'rgba(245,158,11,.20)', '--badge-color': '#fbbf24' }}>
              DEMO
            </span>
          )}

          <Link
            to="/Profile"
            className="bb-header-avatar"
            aria-label="Profil oeffnen"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="bb-header-avatar-img" />
            ) : initials ? (
              <span className="bb-header-avatar-initials">{initials}</span>
            ) : (
              <span className="bb-header-avatar-initials">?</span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
