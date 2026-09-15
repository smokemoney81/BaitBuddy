import DashboardOverview from '@/components/dashboard/DashboardOverview';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import React, { useState, useEffect } from "react";
import { integrations } from "@/api/frontendClient";
import { functions } from "@/api/frontendClient";
import { Spot } from "@/entities/Spot";
import { auth } from "@/api/auth";
import { useAITTS } from "@/hooks/useAITTS";
import MiniKarte from "@/components/home/MiniKarte";
import { Brain, Users, Loader2 } from "lucide-react";
import SchonzeitWarner from "@/components/dashboard/SchonzeitWarner";
import { toast } from "sonner";
import { cacheEntityData, cacheWeatherData, getCachedWeather, getOfflineData } from "@/components/utils/offlineDataCache";
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

export default function Dashboard() {
  const { buddy } = useBuddyPreferences();
  const queryClient = useQueryClient();
  usePredictivePrefetch('Dashboard');
  const { speak } = useAITTS();
  const [user, setUser] = useState(null);
  const [greetingPlayed, setGreetingPlayed] = useState(false);
  const statusAnnouncementRef = React.useRef(null);
  const [weather, setWeather] = useState(null);
  const [nearestSpots, setNearestSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showCommunityDialog, setShowCommunityDialog] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const isMountedRef = React.useRef(true);

  const loadData = async () => {
    try {
      if (!isMountedRef.current) return;

      let authFailed = false;
      let spotsFailed = false;

      // Phase 1: Kritische Daten parallel laden (Auth + Spots)
      const [currentUser, spots] = await Promise.all([
        auth.me().catch(authError => {
          console.error('Dashboard: Authentifizierung fehlgeschlagen:', authError);
          authFailed = true;
          return null;
        }),
        (async () => {
          try {
            const data = await Spot.list('', 100);
            return Array.isArray(data) ? data : [];
          } catch (spotError) {
            console.warn('Dashboard: Spots konnten nicht geladen werden:', spotError);
            spotsFailed = true;
            // Fallback zu gecachten Spots
            try {
              const cachedSpots = await getOfflineData('spots');
              return Array.isArray(cachedSpots) ? cachedSpots : [];
            } catch (cacheError) {
              console.warn('Dashboard: Gecachte Spots nicht verfügbar:', cacheError);
              return [];
            }
          }
        })()
      ]);

      if (isMountedRef.current && currentUser) {
        setUser(currentUser);
      }

      if (isMountedRef.current) {
        setLoadError(authFailed && spotsFailed);
      }

      // Cache Spots im Hintergrund (nicht blockierend)
      if (spots.length > 0 && navigator.onLine) {
        cacheEntityData('spots', spots).catch(() => {});
      }

      // Phase 2: Wetter & Geolocation parallel in Hintergrund (non-blocking)
      const loadWeatherAndLocation = async () => {
        let userLocation = null;
        const savedLocation = localStorage.getItem("fm_current_location");

        // Nutze gespeicherte Location wenn vorhanden
        if (savedLocation) {
          try {
            const location = JSON.parse(savedLocation);
            if (location && location.lat != null && location.lon != null) {
              userLocation = { lat: location.lat, lon: location.lon };
            }
          } catch (parseError) {
            console.warn('Dashboard: Standort ungültig:', parseError);
          }
        }

        // Frische Geolocation nur wenn keine gespeichert (max 2s Timeout)
        if (!userLocation && navigator.geolocation) {
          userLocation = await new Promise((resolve) => {
            const timeoutId = setTimeout(() => resolve(null), 2000);
            navigator.geolocation.getCurrentPosition(
              (position) => {
                clearTimeout(timeoutId);
                const loc = {
                  lat: position.coords.latitude,
                  lon: position.coords.longitude
                };
                try {
                  localStorage.setItem("fm_current_location", JSON.stringify(loc));
                } catch (e) {
                  console.warn('Dashboard: Standort speichern fehlgeschlagen:', e);
                }
                resolve(loc);
              },
              () => {
                clearTimeout(timeoutId);
                resolve(null);
              },
              { timeout: 2000, maximumAge: 300000 }
            );
          });
        }

        // Lade Wetter wenn Standort verfügbar
        if (userLocation) {
          let weatherData = null;

          if (!navigator.onLine) {
            // Offline: Gecachtes Wetter
            try {
              weatherData = await getCachedWeather(userLocation.lat, userLocation.lon);
            } catch (error) {
              console.warn('Dashboard: Gecachtes Wetter nicht verfügbar:', error);
            }
          } else {
            // Online: Frisches Wetter mit 5s Timeout
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);

              const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${userLocation.lat}&longitude=${userLocation.lon}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`,
                { signal: controller.signal }
              );
              clearTimeout(timeoutId);

              weatherData = response.ok ? await response.json() : null;

              // Cache async
              if (weatherData) {
                const current = weatherData.current || weatherData;
                cacheWeatherData(userLocation.lat, userLocation.lon, current).catch(() => {});
              }
            } catch (error) {
              console.warn('Dashboard: Wetter laden fehlgeschlagen:', error);
              // Fallback zu gecachtem Wetter
              try {
                weatherData = await getCachedWeather(userLocation.lat, userLocation.lon);
              } catch (e) {
                console.warn('Dashboard: Gecachtes Wetter Fallback fehlgeschlagen:', e);
              }
            }
          }

          if (isMountedRef.current) {
            if (weatherData && weatherData.current) {
              setWeather(weatherData.current);
            } else if (weatherData && weatherData.temperature_2m !== undefined) {
              setWeather(weatherData);
            }
          }

          // Berechne nächste Spots mit Standort
          if (spots.length > 0) {
            const spotsWithDist = spots
              .filter(spot => spot.latitude != null && spot.longitude != null)
              .map(spot => {
                const R = 6371;
                const dLat = (spot.latitude - userLocation.lat) * Math.PI / 180;
                const dLon = (spot.longitude - userLocation.lon) * Math.PI / 180;
                const a =
                  Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(spot.latitude * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                return { ...spot, distance: R * c };
              })
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 2);

            if (spotsWithDist.length > 0 && isMountedRef.current) {
              setNearestSpots(spotsWithDist);
            }
          }
        } else if (spots.length > 0 && isMountedRef.current) {
          // Fallback ohne Standort
          setNearestSpots(spots.slice(0, 2));
        }
      };

      // Starte Wetter/Location im Hintergrund (nicht warten)
      loadWeatherAndLocation().catch(error => {
        console.warn('Dashboard: Background loading fehlgeschlagen:', error);
      });

    } catch (error) {
      console.error('Dashboard: Daten konnten nicht geladen werden:', error);
      if (isMountedRef.current) {
        setLoadError(true);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Begrüße Nutzer mit KI-Stimme bei Dashboard-Einstieg
  useEffect(() => {
    if (!user || !user.full_name || greetingPlayed || !speak) return;

    setGreetingPlayed(true);

    // Nicht bei jedem Dashboard-Aufruf begrüßen: max. einmal pro Zeitfenster.
    const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 Stunden
    let lastTs = 0;
    let lastGreeting = '';
    try {
      lastTs = Number(localStorage.getItem('bb_last_greeting_ts')) || 0;
      lastGreeting = localStorage.getItem('bb_last_greeting_text') || '';
    } catch (e) {
      // localStorage nicht verfügbar - dann normal begrüßen
    }

    if (Date.now() - lastTs < COOLDOWN_MS) return;

    const firstName = user.full_name.split(' ')[0];
    const hour = new Date().getHours();

    // Tageszeit-abhängige, abwechslungsreiche Begrüßungen
    let pool;
    if (hour >= 5 && hour < 12) {
      pool = [
        `Guten Morgen, ${firstName}. Der frühe Angler fängt den Fisch.`,
        `Morgen, ${firstName}. Die Beißzeit am Morgen ist oft die beste.`,
        `Guten Morgen, ${firstName}. Ein frischer Tag, perfekt zum Angeln.`,
        `Schön, dass du wach bist, ${firstName}. Petri Heil für heute Morgen.`
      ];
    } else if (hour >= 12 && hour < 18) {
      pool = [
        `Hallo ${firstName}, schön dich zu sehen. Die Fische warten schon.`,
        `Willkommen zurück, ${firstName}. Viel Erfolg beim Angeln heute.`,
        `Guten Tag, ${firstName}. Heute könnte dein bester Fangtag werden.`,
        `Hey ${firstName}, bereit für ein paar gute Bisse?`
      ];
    } else if (hour >= 18 && hour < 22) {
      pool = [
        `Guten Abend, ${firstName}. Jetzt werden die Raubfische aktiv.`,
        `Schönen Abend, ${firstName}. Die Dämmerung ist eine starke Beißzeit.`,
        `Hallo ${firstName}, perfekte Zeit für einen Ansitz am Abend.`,
        `Willkommen, ${firstName}. Der Abend gehört den großen Fischen.`
      ];
    } else {
      pool = [
        `Hallo ${firstName}. Auch nachts geht so mancher Räuber an den Haken.`,
        `Noch wach, ${firstName}? Beste Zeit fürs Nachtangeln.`,
        `Hey ${firstName}, plane in Ruhe deinen nächsten Trip.`,
        `Willkommen, ${firstName}. Die Nacht ist still, die Fische nicht.`
      ];
    }

    // Nicht dieselbe Begrüßung wie beim letzten Mal verwenden
    let candidates = pool.filter(g => g !== lastGreeting);
    if (candidates.length === 0) candidates = pool;
    const greeting = candidates[Math.floor(Math.random() * candidates.length)];

    try {
      localStorage.setItem('bb_last_greeting_ts', String(Date.now()));
      localStorage.setItem('bb_last_greeting_text', greeting);
    } catch (e) {
      // ignore
    }

    const timer = setTimeout(() => speak(greeting), 500);
    return () => clearTimeout(timer);
  }, [user, greetingPlayed, speak]);

  useEffect(() => {
    isMountedRef.current = true;

    const cleanupSessions = async () => {
      try {
        await functions.invoke('cleanupOldSessions');
      } catch (error) {
        // Session cleanup errors are non-critical
      }
    };

    cleanupSessions();
    loadData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const getWeatherDesc = (code) => {
    if ([0, 1].includes(code)) return "Sonnig";
    if ([2, 3].includes(code)) return "Bewoelkt";
    if ([45, 48].includes(code)) return "Nebel";
    if ([51, 53, 55, 61, 63, 65].includes(code)) return "Regen";
    return "Wechselhaft";
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.nickname || user?.full_name?.split(' ')[0] || "Angler";
    
    const morningGreetings = [
      `Guten Morgen, ${name}`,
      `Moin ${name}`,
      `Einen schoenen Morgen, ${name}`,
      `Frueh auf den Beinen, ${name}`,
      `Der fruehe Angler faengt den Fisch, ${name}`
    ];
    
    const afternoonGreetings = [
      `Guten Tag, ${name}`,
      `Hallo ${name}`,
      `Willkommen zurueck, ${name}`,
      `Schoen dich zu sehen, ${name}`,
      `Perfekt fuer eine Angelsession, ${name}`
    ];
    
    const eveningGreetings = [
      `Guten Abend, ${name}`,
      `Nabend ${name}`,
      `Zeit fuer die Abendaemmerung, ${name}`,
      `Die besten Bisse kommen jetzt, ${name}`,
      `Bereit fuer die Nachtangelei, ${name}`
    ];
    
    let greetings;
    if (hour >= 5 && hour < 12) greetings = morningGreetings;
    else if (hour >= 12 && hour < 18) greetings = afternoonGreetings;
    else if (hour >= 18 && hour < 22) greetings = eveningGreetings;
    else greetings = [`Hallo, ${name}`];
    
    const randomIndex = Math.floor(Math.random() * greetings.length);
    return greetings[randomIndex];
  };

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

  if (loading) {
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
        {loadError && <div className="bb-card" role="alert"><p>Dashboard-Daten konnten nicht geladen werden.</p><button type="button" className="bb-secondary mt-3" onClick={loadData}>Erneut versuchen</button></div>}
        <SuspenseWithErrorBoundary isMinimal={true}><WeatherWarningBanner /></SuspenseWithErrorBoundary>
        <DashboardOverview user={user} nearestSpots={nearestSpots} />
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
