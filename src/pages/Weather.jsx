import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    } catch (error) {
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 pb-32">
        <Card className="glass-morphism border-amber-500/30 bg-amber-500/5 max-w-md">
          <CardHeader>
            <CardTitle className="text-amber-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Standort erforderlich
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-300">
              Um Wetterdaten anzuzeigen, benötigt die App deinen aktuellen Standort.
            </p>
            <Button
              onClick={handleRequestLocation}
              className="w-full bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
            >
              <MapPin className="w-4 h-4" />
              Standort abrufen
            </Button>
            <p className="text-xs text-gray-500 text-center">
              Du kannst auch auf der Karten-Seite einen Spot auswählen, um das Wetter für diesen Ort anzuzeigen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Laden fehlgeschlagen: Fehlermeldung mit Retry statt endlosem Spinner
  // (vorher blieb die Seite bei einem Fetch-Fehler dauerhaft im Ladezustand,
  // weil weatherData nie gesetzt wurde).
  if (!loading && !locationLoading && !weatherData && weatherError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 pb-32">
        <Card className="glass-morphism border-red-500/30 bg-red-500/5 max-w-md">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Wetterdaten nicht verfügbar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-300">{weatherError}</p>
            <Button
              onClick={() => currentLocation && loadWeatherData(currentLocation.lat, currentLocation.lon)}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !weatherData || locationLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 gap-4">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-gray-400 font-medium">
          {locationLoading ? "Ermittle Standort..." : "Lade Wetterdaten..."}
        </p>
        {currentLocation && (
          <p className="text-gray-500 text-sm flex items-center gap-1">
            <MapPin className="w-3 h-3" />
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

  return (
    <div className="min-h-screen bg-gray-950 p-4 pb-32">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400">
              Wetter & Angelprognose
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="w-3.5 h-3.5 text-cyan-500/60" />
              <p className="text-gray-400 text-sm">
                {currentLocation?.name || "Standort nicht verfügbar"}
              </p>
            </div>
          </div>
          <Button
            onClick={handleRequestLocation}
            variant="outline"
            size="sm"
            className="border-gray-700 hover:bg-gray-800 text-gray-300 flex-shrink-0"
          >
            <MapPin className="w-4 h-4 mr-2 text-cyan-400" />
            Aktualisieren
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-800/50">
            <TabsTrigger value="current">Aktuell</TabsTrigger>
            <TabsTrigger value="radar">Radar</TabsTrigger>
            <TabsTrigger value="forecast">Vorhersage</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-6">

            <Card className="glass-morphism border-gray-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-5xl font-bold text-white">{Math.round(current.temperature_2m)}°C</div>
                    <div className="text-gray-400 mt-1">{getWeatherDescription(current.weather_code)}</div>
                    <div className="text-sm text-gray-500">Gefühlt: {Math.round(current.apparent_temperature)}°C</div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-400 mb-1">Angel-Bedingungen</div>
                    <div className={`text-3xl font-bold ${condition.color}`}>
                      {condition.rating}
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            i < condition.score ? 'bg-emerald-400' : 'bg-gray-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <WeatherStat
                    label="Luftdruck"
                    value={`${Math.round(current.pressure_msl)} hPa`}
                    trend={current.pressure_msl > 1013 ? "up" : "down"}
                    icon={Gauge}
                    color="text-blue-400"
                  />
                  <WeatherStat
                    label="Wind"
                    value={`${Math.round(current.wind_speed_10m * 3.6)} km/h`}
                    subtitle={`Böen: ${Math.round(current.wind_gusts_10m * 3.6)} km/h`}
                    icon={Wind}
                    color="text-sky-400"
                  />
                  <WeatherStat
                    label="Luftfeuchtigkeit"
                    value={`${current.relative_humidity_2m}%`}
                    icon={Droplets}
                    color="text-cyan-400"
                  />
                  <WeatherStat
                    label="Sichtweite"
                    value={`${(current.visibility/1000).toFixed(1)} km`}
                    icon={Eye}
                    color="text-emerald-400"
                  />
                  <WeatherStat
                    label="Bewölkung"
                    value={`${current.cloud_cover}%`}
                    icon={Cloud}
                    color="text-gray-400"
                  />
                  <WeatherStat
                    label="Taupunkt"
                    value={`${Math.round(current.dew_point_2m)}°C`}
                    icon={Thermometer}
                    color="text-orange-400"
                  />
                  <WeatherStat
                    label="UV-Index"
                    value={daily.uv_index_max[0]}
                    icon={Eye}
                    color="text-yellow-400"
                  />
                  <WeatherStat
                    label="Regen heute"
                    value={`${daily.precipitation_probability_max[0]}%`}
                    icon={Droplets}
                    color="text-blue-400"
                  />
                </div>

                <div className="flex items-center justify-center gap-8 mt-6 pt-6 border-t border-gray-700">
                  <div>
                    <div className="text-xs text-gray-400">Sonnenaufgang</div>
                    <div className="text-sm font-medium text-white">
                      {new Date(daily.sunrise[0]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Sonnenuntergang</div>
                    <div className="text-sm font-medium text-white">
                      {new Date(daily.sunset[0]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-morphism border-emerald-600/50 bg-emerald-900/10">
              <CardHeader>
                <CardTitle className="text-emerald-400 flex items-center justify-between">
                  <span>KI Angel-Assistent</span>
                  <div className="flex items-center gap-2">
                    {aiTips && (
                      <Button
                        onClick={handleReadAloud}
                        disabled={isReadingAloud || loadingTips}
                        size="sm"
                        variant="outline"
                        className="border-emerald-600/50 hover:bg-emerald-600/20 text-emerald-400"
                      >
                        {isReadingAloud ? 'Liest vor...' : 'Vorlesen'}
                      </Button>
                    )}
                    <Button
                      onClick={generateAITips}
                      disabled={loadingTips}
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {loadingTips ? 'Analysiere...' : 'Analyse starten'}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aiTips ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">
                      {aiTips}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p>Klicke auf "Analyse starten" für detaillierte Angel-Empfehlungen basierend auf den aktuellen Wetterbedingungen</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-morphism border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Bewertungs-Faktoren</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {condition.reasons.map((reason, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-gray-300">{reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="radar" className="space-y-6">
            <Card className="glass-morphism border-gray-800 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-white">Wetter-Radar</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[600px]">
                  <WeatherRadarMap />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forecast" className="space-y-6">

            <Card className="glass-morphism border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">7-Tage Vorhersage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {daily.time.slice(0, 7).map((date, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="text-gray-400 w-16">
                          {new Date(date).toLocaleDateString('de-DE', { weekday: 'short' })}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-300">{getWeatherDescription(daily.weather_code[i])}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-blue-400">
                          {daily.precipitation_probability_max[i]}%
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">{Math.round(daily.temperature_2m_min[i])}°</span>
                          <div className="w-16 h-1 bg-gradient-to-r from-blue-500 to-red-500 rounded-full" />
                          <span className="text-white font-medium">{Math.round(daily.temperature_2m_max[i])}°</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-morphism border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Nächste 24 Stunden</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="flex gap-4 pb-2">
                    {hourly.time.slice(hourlyStart, hourlyStart + 24).map((time, idx) => {
                      const i = hourlyStart + idx;
                      return (
                        <div key={i} className="flex-shrink-0 w-20 text-center p-3 bg-gray-800/30 rounded-lg">
                          <div className="text-xs text-gray-400 mb-2">
                            {new Date(time).toLocaleTimeString('de-DE', { hour: '2-digit' })}
                          </div>
                          <div className="text-sm font-medium text-white mb-1">
                            {Math.round(hourly.temperature_2m[i])}°
                          </div>
                          <div className="text-xs text-blue-400">
                            {hourly.precipitation_probability[i]}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {currentLocation?.lat && currentLocation?.lon && (
              <>
                <SafetyMode
                  lat={currentLocation.lat}
                  lon={currentLocation.lon}
                  className="mb-2"
                />
                <WeatherWarnings lat={currentLocation.lat} lon={currentLocation.lon} />
              </>
            )}

          </TabsContent>

        </Tabs>

      </div>
    </div>
  );
}

function WeatherStat({ label, value, subtitle, trend, icon: Icon, color = "text-cyan-400" }) {
  return (
    <div className="p-3 bg-gray-800/40 hover:bg-gray-800/60 rounded-xl border border-gray-700/40 hover:border-gray-700/60 transition-colors">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon className={`w-3.5 h-3.5 ${color}`} />}
        <div className="text-xs text-gray-400 font-medium">{label}</div>
        {trend && (
          <span className={`text-xs ml-auto font-bold ${trend === "up" ? "text-emerald-400" : "text-blue-400"}`}>
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
    </div>
  );
}