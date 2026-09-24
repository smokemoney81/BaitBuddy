import React, { useState, useEffect } from "react";
import TabBar from "@/components/layout/TabBar";
import { useLocation } from "@/components/location/LocationManager";
import { InvokeLLM } from "@/integrations/Core";
import { events } from "@/api/frontendClient";
import { useEventActivityTracking } from "@/hooks/useEventActivityTracking";
import WeatherWarnings from "@/components/weather/WeatherWarnings";
import SafetyMode from "@/components/weather/SafetyMode";
import { toast } from "sonner";
import { speakWithFallback, cancelElevenLabs } from "@/components/utils/elevenLabsTTS";
import { timeoutSignal } from "@/lib/abortCompat";
import { MapPin, AlertCircle, Thermometer, Wind, Droplets, Eye, Gauge, Cloud, Loader2 } from "lucide-react";

import PremiumGuard from "@/components/premium/PremiumGuard";
import WeatherRadarMap from "@/components/weather/WeatherRadarMap";
import PageTitle from "@/components/layout/PageTitle";

export default function Weather() {
  return (
    <PremiumGuard requiredPlan="basic" feature="Wetter 5-Tage">
      <WeatherInner />
    </PremiumGuard>
  );
}

function WeatherInner() {
  const { currentLocation, requestGpsLocation, loading: locationLoading } = useLocation();
  const { trackWeatherCheck } = useEventActivityTracking();
  const [weatherData, setWeatherData] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiTips, setAiTips] = useState(null);
  const [loadingTips, setLoadingTips] = useState(false);
  const [activeTab, setActiveTab] = useState("current");
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);

  useEffect(() => {
    if (currentLocation?.lat && currentLocation?.lon) {
      loadWeatherData(currentLocation.lat, currentLocation.lon);
    }
  }, [currentLocation]);

  useEffect(() => {
    const loadActiveEvent = async () => {
      try {
        const event = await events.getActiveEvent();
        if (event?.active_event?.id) {
          setActiveEventId(event.active_event.id);
        }
      } catch {
        // Event loading non-critical
      }
    };
    loadActiveEvent();
  }, []);

  const loadWeatherData = async (lat, lon) => {
    setLoading(true);
    setWeatherError(null);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,dew_point_2m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max&timezone=auto`;
      // Hartes 15s-Timeout: ohne Signal konnte der Fetch (z. B. Funkloch am
      // Wasser) minutenlang haengen und die Seite blieb im Lade-Spinner.
      const res = await fetch(url, { signal: timeoutSignal(15000) });
      const data = await res.json();

      if (data.error) {
        throw new Error(data.reason || "Wetterdaten konnten nicht geladen werden");
      }

      setWeatherData(data);
      toast.success("Wetterdaten geladen", {
        duration: 2000
      });
    } catch (error) {
      const message = error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'Zeitüberschreitung beim Laden der Wetterdaten. Bitte Verbindung prüfen und erneut versuchen.'
        : (error.message || 'Wetterdaten konnten nicht geladen werden');
      setWeatherError(message);
      toast.error("Wetterdaten konnten nicht geladen werden", {
        description: message,
        duration: 4000
      });
    }
    setLoading(false);
  };

  const handleRequestLocation = async () => {
    await requestGpsLocation();
  };

  const generateAITips = async () => {
    if (!weatherData) return;

    setLoadingTips(true);
    try {
      const current = weatherData.current;
      const daily = weatherData.daily;

      const prompt = `Du bist ein erfahrener Angel-Experte. Analysiere die folgenden Wetterdaten und gib detaillierte Angel-Empfehlungen:

**Aktuelle Bedingungen:**
- Temperatur: ${current.temperature_2m}°C (gefühlt: ${current.apparent_temperature}°C)
- Luftdruck: ${current.pressure_msl} hPa
- Luftfeuchtigkeit: ${current.relative_humidity_2m}%
- Wind: ${current.wind_speed_10m} m/s (Böen: ${current.wind_gusts_10m} m/s)
- Bewölkung: ${current.cloud_cover}%
- Sichtweite: ${(current.visibility/1000).toFixed(1)} km
- Taupunkt: ${current.dew_point_2m}°C

**Vorhersage:**
- Max/Min Temp: ${daily.temperature_2m_max[0]}°C / ${daily.temperature_2m_min[0]}°C
- Regenwahrscheinlichkeit: ${daily.precipitation_probability_max[0]}%
- UV-Index: ${daily.uv_index_max[0]}

Gib eine strukturierte Analyse mit folgenden Punkten:

1. **Gesamtbewertung** (Gut/Mittel/Schwierig zum Angeln)
2. **Beste Angelzeit heute** (konkrete Uhrzeiten)
3. **Empfohlene Zielfische** (welche Arten sind jetzt aktiv?)
4. **Köder-Empfehlungen** (was funktioniert bei diesen Bedingungen?)
5. **Technik-Tipps** (Führung, Tiefe, Spots)
6. **Wichtige Hinweise** (Sicherheit, Ausrüstung, etc.)

Sei konkret, praktisch und detailliert!`;

      const result = await InvokeLLM({ prompt });
      setAiTips(result);
      if (activeEventId) {
        trackWeatherCheck(activeEventId);
      }
    } catch {
      toast.error("KI-Analyse fehlgeschlagen");
    }
    setLoadingTips(false);
  };

  const handleReadAloud = async () => {
    if (!aiTips || isReadingAloud) return;

    setIsReadingAloud(true);

    try {
      const cleanText = aiTips
        .replace(/[\*#_~`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Vorlesen ausschließlich mit der natürlichen ElevenLabs-Stimme
      // (zentrale Utility inkl. gewählter Stimme aus den Einstellungen);
      // bei Fehlern bleibt es still — kein Browser-Roboterstimmen-Fallback.
      await speakWithFallback(cleanText, { voiceEnabled: true, rate: 1.0 });
      setIsReadingAloud(false);
    } catch {
      toast.error("Vorlesen fehlgeschlagen");
      setIsReadingAloud(false);
    }
  };

  // Beim Verlassen der Seite eine laufende Sprachausgabe stoppen.
  useEffect(() => {
    return () => cancelElevenLabs();
  }, []);

  const getWeatherDescription = (code) => {
    if ([0, 1].includes(code)) return "Sonnig & klar";
    if ([2, 3].includes(code)) return "Teilweise bewölkt";
    if ([45, 48].includes(code)) return "Nebelig";
    if ([51, 53, 55].includes(code)) return "Nieselregen";
    if ([61, 63, 65].includes(code)) return "Regen";
    if ([71, 73, 75, 77].includes(code)) return "Schneefall";
    if ([80, 81, 82].includes(code)) return "Schauer";
    if ([95, 96, 99].includes(code)) return "Gewitter";
    return "Wechselhaft";
  };

  const getFishingCondition = () => {
    if (!weatherData) return { rating: "...", color: "text-gray-400", score: 0, reasons: [] };

    const current = weatherData.current;
    let score = 0;
    const reasons = [];

    if (current.pressure_msl > 1020) {
      score += 2;
      reasons.push("Stabiler Hochdruck");
    } else if (current.pressure_msl < 1000) {
      score += 3;
      reasons.push("Tiefdruck - Fische aktiv!");
    } else {
      score += 1;
    }

    if (current.wind_speed_10m < 5) {
      score += 2;
      reasons.push("Wenig Wind");
    } else if (current.wind_speed_10m > 15) {
      score -= 1;
      reasons.push("Starker Wind");
    } else {
      score += 1;
    }

    if (current.cloud_cover > 50 && current.cloud_cover < 90) {
      score += 1;
      reasons.push("Optimale Bewölkung");
    }

    if (current.temperature_2m >= 10 && current.temperature_2m <= 22) {
      score += 1;
      reasons.push("Gute Temperatur");
    }

    if (score >= 5) return { rating: "Ausgezeichnet", color: "text-green-400", score, reasons };
    if (score >= 3) return { rating: "Gut", color: "text-emerald-400", score, reasons };
    if (score >= 1) return { rating: "Mittel", color: "text-yellow-400", score, reasons };
    return { rating: "Schwierig", color: "text-red-400", score, reasons };
  };

  // Wenn kein Standort verfügbar ist
  if (!currentLocation && !locationLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 pb-32" style={{ background: 'var(--bb-bg)' }}>
        <div className="bb-card max-w-md" style={{ borderColor: 'rgba(245,158,11,.3)' }}>
          <div className="flex items-center gap-2 mb-4" style={{ color: '#fbbf24' }}>
            <AlertCircle size={20} />
            <span className="text-lg font-bold">Standort erforderlich</span>
          </div>
          <p style={{ color: 'var(--bb-muted)' }} className="mb-4">
            Um Wetterdaten anzuzeigen, benötigt die App deinen aktuellen Standort.
          </p>
          <button onClick={handleRequestLocation} className="bb-action w-full flex items-center justify-center gap-2">
            <MapPin size={16} />
            Standort abrufen
          </button>
          <p className="text-xs text-center mt-3" style={{ color: 'var(--bb-muted)' }}>
            Du kannst auch auf der Karten-Seite einen Spot auswählen, um das Wetter für diesen Ort anzuzeigen.
          </p>
        </div>
      </div>
    );
  }

  // Laden fehlgeschlagen: Fehlermeldung mit Retry statt endlosem Spinner
  // (vorher blieb die Seite bei einem Fetch-Fehler dauerhaft im Ladezustand,
  // weil weatherData nie gesetzt wurde).
  if (!loading && !locationLoading && !weatherData && weatherError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 pb-32" style={{ background: 'var(--bb-bg)' }}>
        <div className="bb-card max-w-md" style={{ borderColor: 'rgba(239,68,68,.3)' }}>
          <div className="flex items-center gap-2 mb-4" style={{ color: '#f87171' }}>
            <AlertCircle size={20} />
            <span className="text-lg font-bold">Wetterdaten nicht verfügbar</span>
          </div>
          <p style={{ color: 'var(--bb-muted)' }} className="mb-4">{weatherError}</p>
          <button
            onClick={() => currentLocation && loadWeatherData(currentLocation.lat, currentLocation.lon)}
            className="bb-action w-full"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (loading || !weatherData || locationLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4" style={{ background: 'var(--bb-bg)' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--bb-cyan)' }} />
        <p style={{ color: 'var(--bb-muted)' }} className="font-medium">
          {locationLoading ? "Ermittle Standort..." : "Lade Wetterdaten..."}
        </p>
        {currentLocation && (
          <p className="text-sm flex items-center gap-1" style={{ color: 'var(--bb-muted)' }}>
            <MapPin size={12} />
            {currentLocation.name}
          </p>
        )}
      </div>
    );
  }

  const current = weatherData.current;
  const daily = weatherData.daily;
  const hourly = weatherData.hourly;
  const condition = getFishingCondition();

  // open-meteo liefert die Stundenwerte ab 00:00 des aktuellen Tages. Fuer
  // "Naechste 24 Stunden" ab der aktuellen Stunde einsteigen, sonst zeigt die
  // Liste bereits vergangene Stunden des heutigen Tages.
  const nowHour = new Date();
  nowHour.setMinutes(0, 0, 0);
  let hourlyStart = (hourly?.time || []).findIndex(t => new Date(t).getTime() >= nowHour.getTime());
  if (hourlyStart < 0) hourlyStart = 0;

  const weatherTabs = [
    { key: 'current', label: 'Aktuell' },
    { key: 'radar', label: 'Radar' },
    { key: 'forecast', label: 'Vorhersage' },
  ];

  return (
    <div className="bb-page">

      <div className="flex items-start justify-between gap-4">
        <div>
          <PageTitle title="Wetter & Prognosen" />
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin size={14} style={{ color: 'rgba(0,229,255,.5)' }} />
            <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
              {currentLocation?.name || "Standort nicht verfügbar"}
            </p>
          </div>
        </div>
        <button onClick={handleRequestLocation} className="bb-secondary flex items-center gap-2 shrink-0">
          <MapPin size={16} style={{ color: 'var(--bb-cyan)' }} />
          Aktualisieren
        </button>
      </div>

      <TabBar tabs={weatherTabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'current' && (
        <>
          <div className="bb-card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-5xl font-bold text-white">{Math.round(current.temperature_2m)}°C</div>
                <div className="mt-1" style={{ color: 'var(--bb-muted)' }}>{getWeatherDescription(current.weather_code)}</div>
                <div className="text-sm" style={{ color: 'var(--bb-muted)' }}>Gefühlt: {Math.round(current.apparent_temperature)}°C</div>
              </div>

              <div className="text-right">
                <div className="text-sm mb-1" style={{ color: 'var(--bb-muted)' }}>Angel-Bedingungen</div>
                <div className={`text-3xl font-bold ${condition.color}`}>
                  {condition.rating}
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full"
                      style={{ background: i < condition.score ? '#34d399' : 'var(--bb-border)' }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              <WeatherStat label="Luftdruck" value={`${Math.round(current.pressure_msl)} hPa`} trend={current.pressure_msl > 1013 ? "up" : "down"} icon={Gauge} color="#60a5fa" />
              <WeatherStat label="Wind" value={`${Math.round(current.wind_speed_10m * 3.6)} km/h`} subtitle={`Böen: ${Math.round(current.wind_gusts_10m * 3.6)} km/h`} icon={Wind} color="#38bdf8" />
              <WeatherStat label="Luftfeuchtigkeit" value={`${current.relative_humidity_2m}%`} icon={Droplets} color="#22d3ee" />
              <WeatherStat label="Sichtweite" value={`${(current.visibility/1000).toFixed(1)} km`} icon={Eye} color="#34d399" />
              <WeatherStat label="Bewölkung" value={`${current.cloud_cover}%`} icon={Cloud} color="#94a3b8" />
              <WeatherStat label="Taupunkt" value={`${Math.round(current.dew_point_2m)}°C`} icon={Thermometer} color="#fb923c" />
              <WeatherStat label="UV-Index" value={daily.uv_index_max[0]} icon={Eye} color="#facc15" />
              <WeatherStat label="Regen heute" value={`${daily.precipitation_probability_max[0]}%`} icon={Droplets} color="#60a5fa" />
            </div>

            <div className="flex items-center justify-center gap-8 mt-6 pt-6" style={{ borderTop: '1px solid var(--bb-border)' }}>
              <div>
                <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>Sonnenaufgang</div>
                <div className="text-sm font-medium text-white">
                  {new Date(daily.sunrise[0]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>Sonnenuntergang</div>
                <div className="text-sm font-medium text-white">
                  {new Date(daily.sunset[0]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>

          <div className="bb-card" style={{ borderColor: 'rgba(16,185,129,.3)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-lg font-bold" style={{ color: '#34d399' }}>KI Angel-Assistent</span>
              <div className="flex items-center gap-2">
                {aiTips && (
                  <button onClick={handleReadAloud} disabled={isReadingAloud || loadingTips} className="bb-secondary text-sm">
                    {isReadingAloud ? 'Liest vor...' : 'Vorlesen'}
                  </button>
                )}
                <button onClick={generateAITips} disabled={loadingTips} className="bb-action text-sm">
                  {loadingTips ? 'Analysiere...' : 'Analyse starten'}
                </button>
              </div>
            </div>
            {aiTips ? (
              <div className="whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--bb-text-secondary)' }}>
                {aiTips}
              </div>
            ) : (
              <div className="text-center py-8" style={{ color: 'var(--bb-muted)' }}>
                <p>Klicke auf "Analyse starten" für detaillierte Angel-Empfehlungen basierend auf den aktuellen Wetterbedingungen</p>
              </div>
            )}
          </div>

          <div className="bb-card">
            <div className="text-base font-bold text-white mb-3">Bewertungs-Faktoren</div>
            <div className="grid gap-2">
              {condition.reasons.map((reason, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />
                  <span style={{ color: 'var(--bb-text-secondary)' }}>{reason}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'radar' && (
        <div className="bb-card overflow-hidden" style={{ padding: 0 }}>
          <div className="px-5 pt-5 pb-3">
            <div className="text-base font-bold text-white">Wetter-Radar</div>
          </div>
          <div style={{ height: 600 }}>
            <WeatherRadarMap />
          </div>
        </div>
      )}

      {activeTab === 'forecast' && (
        <>
          <div className="bb-card">
            <div className="text-base font-bold text-white mb-4">7-Tage Vorhersage</div>
            <div className="grid gap-3">
              {daily.time.slice(0, 7).map((date, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(0,0,0,.25)' }}>
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-16" style={{ color: 'var(--bb-muted)' }}>
                      {new Date(date).toLocaleDateString('de-DE', { weekday: 'short' })}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm" style={{ color: 'var(--bb-text-secondary)' }}>{getWeatherDescription(daily.weather_code[i])}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm" style={{ color: '#60a5fa' }}>
                      {daily.precipitation_probability_max[i]}%
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: 'var(--bb-muted)' }}>{Math.round(daily.temperature_2m_min[i])}°</span>
                      <div className="w-16 h-1 rounded-full" style={{ background: 'linear-gradient(to right, #3b82f6, #ef4444)' }} />
                      <span className="text-white font-medium">{Math.round(daily.temperature_2m_max[i])}°</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bb-card">
            <div className="text-base font-bold text-white mb-4">Nächste 24 Stunden</div>
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-2">
                {hourly.time.slice(hourlyStart, hourlyStart + 24).map((time, idx) => {
                  const i = hourlyStart + idx;
                  return (
                    <div key={i} className="shrink-0 w-20 text-center p-3 rounded-xl" style={{ background: 'rgba(0,0,0,.25)' }}>
                      <div className="text-xs mb-2" style={{ color: 'var(--bb-muted)' }}>
                        {new Date(time).toLocaleTimeString('de-DE', { hour: '2-digit' })}
                      </div>
                      <div className="text-sm font-medium text-white mb-1">
                        {Math.round(hourly.temperature_2m[i])}°
                      </div>
                      <div className="text-xs" style={{ color: '#60a5fa' }}>
                        {hourly.precipitation_probability[i]}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {currentLocation?.lat && currentLocation?.lon && (
            <>
              <SafetyMode lat={currentLocation.lat} lon={currentLocation.lon} className="mb-2" />
              <WeatherWarnings lat={currentLocation.lat} lon={currentLocation.lon} />
            </>
          )}
        </>
      )}

    </div>
  );
}

function WeatherStat({ label, value, subtitle, trend, icon: Icon, color = 'var(--bb-cyan)' }) {
  return (
    <div className="bb-stat-card">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon size={14} style={{ color }} />}
        <div className="text-xs font-medium" style={{ color: 'var(--bb-muted)' }}>{label}</div>
        {trend && (
          <span className="text-xs ml-auto font-bold" style={{ color: trend === 'up' ? '#34d399' : '#60a5fa' }}>
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      {subtitle && <div className="text-xs mt-0.5" style={{ color: 'var(--bb-muted)' }}>{subtitle}</div>}
    </div>
  );
}