import DashboardOverview from '@/components/dashboard/DashboardOverview';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import React, { useState, useEffect } from "react";
import { integrations } from "@/api/frontendClient";
import { functions } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import MiniKarte from "@/components/home/MiniKarte";
import { Brain, Users, Loader2 } from "lucide-react";
import SchonzeitWarner from "@/components/dashboard/SchonzeitWarner";
import { toast } from "sonner";
import OfflineCacheIndicator from "@/components/dashboard/OfflineCacheIndicator";
import FishingRecommendationCard from "@/components/dashboard/FishingRecommendationCard";
import NextTripHero from "@/components/dashboard/NextTripHero";
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
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

  const handleAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const savedLocation = localStorage.getItem("fm_current_location");
      let location = null;
      
      if (savedLocation) {
        try {
          location = JSON.parse(savedLocation);
        } catch (e) {
          console.warn('Dashboard: gespeicherter Standort ist ungültig:', e);
        }
      }

      if (!location || !location.lat || !location.lon) {
        toast.error("Kein Standort verfuegbar. Bitte Standort aktivieren.");
        setIsAnalyzing(false);
        return;
      }

      const [weatherData, osmData] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover&timezone=auto`
        ).then(r => r.json()).catch(() => null),
        fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: `[out:json][timeout:10];(way["natural"="water"](around:1500,${location.lat},${location.lon});way["waterway"~"river|stream|canal"](around:1500,${location.lat},${location.lon});relation["natural"="water"](around:1500,${location.lat},${location.lon}););out center 8;`
        }).then(r => r.json()).catch(() => null)
      ]);

      const waterBodies = osmData?.elements
        ?.filter(el => el.tags?.name)
        ?.map(el => {
          const dlat = (el.center?.lat || el.lat || location.lat) - location.lat;
          const dlon = (el.center?.lon || el.lon || location.lon) - location.lon;
          const distM = Math.round(Math.sqrt(dlat * dlat + dlon * dlon) * 111320);
          const type = el.tags?.waterway ? `Fließgewässer (${el.tags.waterway})` : 'Stillgewässer';
          return `${el.tags.name} (${type}, ca. ${distM < 1000 ? distM + ' m' : (distM / 1000).toFixed(1) + ' km'})`;
        }) || [];

      const gewaesserInfo = waterBodies.length > 0
        ? `Gefundene Gewässer in der Nähe (aus OpenStreetMap):\n${waterBodies.slice(0, 5).map(w => `- ${w}`).join('\n')}`
        : 'Laut OpenStreetMap wurden innerhalb von 1,5 km KEINE benannten Gewässer gefunden.';

      const wetter = weatherData?.current;
      const prompt = `Du bist ein erfahrener Angel-Experte.

Standort des Anglers: ${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}

${gewaesserInfo}

Aktuelle Wetterbedingungen:
- Temperatur: ${wetter?.temperature_2m ?? '?'}°C
- Luftfeuchtigkeit: ${wetter?.relative_humidity_2m ?? '?'}%
- Luftdruck: ${wetter?.surface_pressure ?? '?'} hPa
- Wind: ${wetter?.wind_speed_10m ?? '?'} m/s aus ${wetter?.wind_direction_10m ?? '?'}°
- Bewölkung: ${wetter?.cloud_cover ?? '?'}%
- Niederschlag: ${wetter?.precipitation ?? '?'} mm

Aufgabe: ${waterBodies.length > 0
  ? 'Nenne das nächste Gewässer und gib konkrete Angel-Tipps für genau dieses Gewässer basierend auf den Wetterbedingungen (Fischarten, Köder, Taktik, beste Uhrzeit).'
  : 'Teile dem Angler mit, dass er gerade nicht an einem Gewässer ist. Nenne die nächsten bekannten Angelgewässer der Region und grobe Entfernung.'}

Antworte auf Deutsch, direkt und praxisnah, in max 6 Sätzen.`;

      const response = await integrations.Core.InvokeLLM({ prompt });
      const analysisText = typeof response === 'string'
        ? response
        : response?.reply || response?.message || response || 'Keine Analyse verfügbar.';

      setAiAnalysis(analysisText);
      setShowAnalysis(true);
      if (statusAnnouncementRef?.current) {
        statusAnnouncementRef.current.textContent = "KI-Analyse abgeschlossen";
      }
      toast.success("KI-Analyse abgeschlossen");
    } catch (error) {
      console.error("KI-Analyse Fehler:", error);
      if (statusAnnouncementRef?.current) {
        statusAnnouncementRef.current.textContent = "KI-Analyse fehlgeschlagen";
      }
      toast.error("KI-Analyse fehlgeschlagen");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const nearestSpots = dashboardData?.top_spots || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
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
      <div className="bb-dashboard bb-app">
        {error && <div className="bb-card" role="alert"><p>Dashboard-Daten konnten nicht geladen werden.</p><button type="button" className="bb-secondary mt-3" onClick={loadData}>Erneut versuchen</button></div>}
        <SuspenseWithErrorBoundary isMinimal={true}><WeatherWarningBanner /></SuspenseWithErrorBoundary>
        <DashboardOverview
          user={user}
          nearestSpots={nearestSpots}
          nextTrip={dashboardData?.next_trip || null}
          tripsError={!!error}
          onRetryTrips={refetch}
        />
        <SuspenseWithErrorBoundary isMinimal={true}><NextTripHero /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><BuddyInsightCard /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><SchonzeitWarner /></SuspenseWithErrorBoundary>
        <div className="flex items-center flex-wrap gap-3 justify-between"><button type="button" onClick={handleAiAnalysis} disabled={isAnalyzing} className="bb-secondary"><Brain size={18}/>{isAnalyzing ? 'Standort wird analysiert …' : 'KI Standort-Analyse'}</button><OfflineCacheIndicator /></div>
        {showAnalysis && aiAnalysis && <section className="bb-card" aria-label="KI-Analyse Ergebnis" aria-live="polite"><div className="flex justify-between items-center mb-4"><h2 className="text-lg font-semibold">Deine Standort-Analyse</h2><button type="button" className="bb-secondary" onClick={() => setShowAnalysis(false)}>Schließen</button></div><p className="whitespace-pre-wrap text-sm leading-relaxed">{aiAnalysis}</p></section>}
        <section className="bb-card overflow-hidden"><h2 className="text-lg font-semibold mb-4">Gewässer entdecken</h2><SuspenseWithErrorBoundary isMinimal={true}><MiniKarte /></SuspenseWithErrorBoundary></section>
        <SuspenseWithErrorBoundary isMinimal={true}><FishingRecommendationCard /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><AudioNotesWidget /></SuspenseWithErrorBoundary>
        <button type="button" className="bb-secondary justify-center" onClick={() => setShowCommunityDialog(true)}><Users size={18}/>Erlebnis mit der Community teilen</button>
      </div>
      <CommunityPostDialog isOpen={showCommunityDialog} onOpenChange={setShowCommunityDialog}/>
    </PageContainer>
  );
}
