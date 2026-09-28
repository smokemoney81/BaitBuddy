import React, { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { auth } from "@/api/auth";
import { useBuddyPreferences } from "@/lib/BuddyPreferencesContext";
import { usePredictivePrefetch } from "@/hooks/usePredictivePrefetch";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useFitToViewport } from "@/hooks/useFitToViewport";
import SuspenseWithErrorBoundary from "@/components/utils/SuspenseWithErrorBoundary";
import WeatherWarningBanner from "@/components/weather/WeatherWarningBanner";
import CommunityPostDialog from "@/components/community/CommunityPostDialog";
import ReferralInvitePopup from "@/components/referral/ReferralInvitePopup";
import HomeWeatherRail from "@/components/home/HomeWeatherRail";
import HomeBuddyChat from "@/components/home/HomeBuddyChat";
import HomePromptChips from "@/components/home/HomePromptChips";
import HomeBuddyInput from "@/components/home/HomeBuddyInput";
import HomeOverview from "@/components/home/HomeOverview";
import "@/styles/home-dashboard.css";

// Dashboard (BaitBuddy 2.0, Vorlage 2026-09):
//  Seite 1 füllt genau den Bildschirm — Wetterspalte links, Gespräch mit dem
//  Buddy, Schnellfragen und die Eingabeleiste über der Bottom-Nav.
//  Seite 2 (darunter) fasst alle übrigen Dashboard-Karten kompakt zusammen.
export default function Dashboard() {
  const { buddy, fishing } = useBuddyPreferences();
  usePredictivePrefetch('Dashboard');
  const { data: dashboardData, isLoading, error, refetch } = useDashboardData();
  const [user, setUser] = useState(null);
  const [showCommunityDialog, setShowCommunityDialog] = useState(false);
  const heroRef = useRef(null);
  const overviewRef = useRef(null);
  useFitToViewport(heroRef, { lockScroll: false });

  const loadUser = useCallback(async () => {
    const currentUser = await auth.me().catch(authError => {
      console.error('[Dashboard] auth.me() failed:', authError?.message, 'status:', authError?.status);
      return null;
    });
    setUser(currentUser);
  }, []);

  useEffect(() => {
    let alive = true;
    auth.me()
      .then(currentUser => { if (alive) setUser(currentUser); })
      .catch(authError => {
        console.error('[Dashboard] auth.me() failed:', authError?.message, 'status:', authError?.status);
      });
    return () => { alive = false; };
  }, []);

  // Profiländerungen (neuer Name) sofort in der Begrüßung übernehmen.
  useEffect(() => {
    const onUserUpdated = (event) => {
      const updated = event?.detail;
      setUser(prev => (prev && updated?.id === prev.id ? { ...prev, ...updated } : prev));
    };
    window.addEventListener('bb-user-updated', onUserUpdated);
    return () => window.removeEventListener('bb-user-updated', onUserUpdated);
  }, []);

  const retry = useCallback(async () => {
    await loadUser();
    await refetch();
  }, [loadUser, refetch]);

  const scrollToOverview = () => {
    overviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const targetSpecies = fishing?.targetSpecies?.length ? fishing.targetSpecies : user?.settings?.fishing?.targetSpecies;

  return (
    <div className="bb-home">
      {buddy.chosen && <ReferralInvitePopup />}

      <section ref={heroRef} className="bb-home-hero" aria-label="KI-Buddy">
        <HomeWeatherRail onMore={scrollToOverview} />
        <div className="bb-home-main">
          <SuspenseWithErrorBoundary isMinimal={true}><WeatherWarningBanner /></SuspenseWithErrorBoundary>
          <HomeBuddyChat user={user} />
          <HomePromptChips targetSpecies={targetSpecies} />
        </div>
        <HomeBuddyInput />
      </section>

      <div ref={overviewRef}>
        {isLoading ? (
          <div className="bb-home-loading" role="status">
            <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" aria-hidden="true" />
            <span>Übersicht lädt …</span>
          </div>
        ) : (
          <HomeOverview
            user={user}
            dashboardData={dashboardData}
            error={error}
            onRetry={retry}
            onShare={() => setShowCommunityDialog(true)}
          />
        )}
      </div>

      <CommunityPostDialog isOpen={showCommunityDialog} onOpenChange={setShowCommunityDialog} />
    </div>
  );
}
