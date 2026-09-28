import DashboardOverview from '@/components/dashboard/DashboardOverview';
import BuddyInputField from '@/components/dashboard/BuddyInputField';
import DashboardQuickActions from '@/components/dashboard/DashboardQuickActions';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import React, { useState, useEffect } from "react";
import { functions } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { Link } from "react-router-dom";
import { Users, Loader2, ShieldCheck, ChevronRight } from "lucide-react";
import SchonzeitWarner from "@/components/dashboard/SchonzeitWarner";
import OfflineCacheIndicator from "@/components/dashboard/OfflineCacheIndicator";
import FishingRecommendationCard from "@/components/dashboard/FishingRecommendationCard";
import BuddyInsightCard from "@/components/dashboard/BuddyInsightCard";
import AudioNotesWidget from "@/components/dashboard/AudioNotesWidget";
import { useQueryClient } from "@tanstack/react-query";
import { usePredictivePrefetch } from "@/hooks/usePredictivePrefetch";
import PageContainer from "@/components/layout/PageContainer";
import CommunityPostDialog from "@/components/community/CommunityPostDialog";
import WeatherWarningBanner from "@/components/weather/WeatherWarningBanner";
import SuspenseWithErrorBoundary from "@/components/utils/SuspenseWithErrorBoundary";
import ReferralInvitePopup from "@/components/referral/ReferralInvitePopup";
import { useDashboardData } from "@/hooks/useDashboardData";

export default function Dashboard() {
  const { buddy } = useBuddyPreferences();
  const _queryClient = useQueryClient();
  usePredictivePrefetch('Dashboard');
  const { data: dashboardData, isLoading, error, refetch, invalidateCache: _invalidateCache } = useDashboardData();
  const [user, setUser] = useState(null);
  const statusAnnouncementRef = React.useRef(null);
  const [showCommunityDialog, setShowCommunityDialog] = useState(false);
  const isMountedRef = React.useRef(true);

  const loadData = async () => {
    try {
      if (!isMountedRef.current) return;

      // Load user data
      const currentUser = await auth.me().catch(authError => {
        console.error('[Dashboard] auth.me() failed:', authError?.message, 'status:', authError?.status);
        return null;
      });

      if (isMountedRef.current && currentUser) {
        setUser(currentUser);
      }

      // Refresh dashboard data (aggregated endpoint handles spots, weather, etc.)
      await refetch();
    } catch (error) {
      console.error('[Dashboard] Daten konnten nicht geladen werden:', error);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const cleanupSessions = async () => {
      try {
        await functions.invoke('cleanupOldSessions');
      } catch {
        // Session cleanup errors are non-critical
      }
    };

    cleanupSessions();
    loadData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const nearestSpots = dashboardData?.top_spots || [];

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <div className="text-cyan-400/70 text-sm font-medium tracking-wide">Dashboard lädt...</div>
        </div>
      </div>
    );
  }

  return (
    <PageContainer maxWidth="max-w-7xl" enableSwipeRefresh={true} onRefresh={loadData}>
      {buddy.chosen && <ReferralInvitePopup />}
      <div ref={statusAnnouncementRef} role="status" aria-live="polite" className="sr-only" />
      <div className="bb-dashboard">
        {error && user && <div className="bb-card" role="alert"><p>Dashboard-Daten konnten nicht geladen werden.</p><button type="button" className="bb-secondary mt-3" onClick={loadData}>Erneut versuchen</button></div>}
        {/* Einziger Einstieg in den Admin-Bereich — nur für den Superuser (Server prüft zusätzlich). */}
        {user?.is_superuser === true && (
          <Link to="/Admin" className="bb-card bb-dash-row">
            <span className="bb-dash-row-media"><ShieldCheck size={30} aria-hidden="true" /></span>
            <span className="flex-1 min-w-0">
              <span className="bb-dash-row-label">Superuser</span>
              <strong className="bb-dash-row-title">Admin-Bereich</strong>
              <span className="bb-dash-row-meta">Nutzer, Pläne, Werbung, Statistik, Tickets</span>
            </span>
            <ChevronRight size={22} aria-hidden="true" />
          </Link>
        )}
        <BuddyInputField
          weather={dashboardData?.weather?.current}
          catches={dashboardData?.recent_catches}
          trips={dashboardData?.next_trip ? [dashboardData.next_trip] : []}
          targetSpecies={user?.settings?.fishing?.targetSpecies}
        />
        <DashboardQuickActions />
        <SuspenseWithErrorBoundary isMinimal={true}><WeatherWarningBanner /></SuspenseWithErrorBoundary>
        <DashboardOverview
          user={user}
          nearestSpots={nearestSpots}
          nextTrip={dashboardData?.next_trip || null}
          tripsError={!!error}
          onRetryTrips={refetch}
        />
        <SuspenseWithErrorBoundary isMinimal={true}><BuddyInsightCard /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><SchonzeitWarner /></SuspenseWithErrorBoundary>
        <div className="flex items-center flex-wrap gap-3 justify-end"><OfflineCacheIndicator /></div>
        <SuspenseWithErrorBoundary isMinimal={true}><FishingRecommendationCard /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><AudioNotesWidget /></SuspenseWithErrorBoundary>
        <button type="button" className="bb-secondary justify-center" onClick={() => setShowCommunityDialog(true)}><Users size={18}/>Erlebnis mit der Community teilen</button>
      </div>
      <CommunityPostDialog isOpen={showCommunityDialog} onOpenChange={setShowCommunityDialog}/>
    </PageContainer>
  );
}
