import React, { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Loader2, Satellite, Thermometer, Eye, Wind,
  AlertTriangle, CheckCircle, MapPin, RefreshCw, MessageCircle,
  TrendingUp, TrendingDown, Minus, Navigation, Info, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { ai } from "@/api/frontendClient";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import PremiumGuard from "@/components/premium/PremiumGuard";

const TURBIDITY_COLOR = {
  gering: "text-green-400 bg-green-900/20 border-green-700/40",
  mittel: "text-amber-400 bg-amber-900/20 border-amber-700/40",
  hoch:   "text-red-400 bg-red-900/20 border-red-700/40",
};

const RISK_LEVEL_COLOR = {
  gering:   "text-green-400",
  mittel:   "text-amber-400",
  kritisch: "text-red-400",
};

const FISHING_COLOR = {
  gut:     "bg-green-900/30 border-green-700/50 text-green-300",
  mittel:  "bg-amber-900/30 border-amber-700/50 text-amber-300",
  schlecht:"bg-red-900/30 border-red-700/50 text-red-300",
};

const CONFIDENCE_LABEL = {
  hoch:   "Hoch",
  mittel: "Mittel",
  gering: "Gering",
};

function TrendIcon({ values }) {
  if (!values || values.length < 2) return <Minus className="w-3.5 h-3.5 text-gray-500" />;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (last == null || prev == null) return <Minus className="w-3.5 h-3.5 text-gray-500" />;
  if (last > prev + 0.5) return <TrendingUp className="w-3.5 h-3.5 text-red-400" />;
  if (last < prev - 0.5) return <TrendingDown className="w-3.5 h-3.5 text-blue-400" />;
  return <Minus className="w-3.5 h-3.5 text-gray-500" />;
}

function ScoreGauge({ score }) {
  const pct = Math.max(0, Math.min(100, score || 0));
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{pct}</span>
    </div>
  );
}

export default function SatelliteAnalysis() {
  return (
    <PremiumGuard requiredPlan="basic" feature="Satellitenanalyse">
      <SatelliteAnalysisInner />
    </PremiumGuard>
  );
}

function SatelliteAnalysisInner() {
  useFeatureTracking("satellite_analysis");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initLat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")) : null;
  const initLng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")) : null;
  const initSpot = searchParams.get("spot_name") || null;

  const [coords, setCoords] = useState(
    initLat && initLng ? { lat: initLat, lng: initLng } : null
  );
  const [spotName, setSpotName] = useState(initSpot || "");
  const [locating, setLocating] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("GPS nicht verfügbar");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        toast.error("Standort konnte nicht ermittelt werden");
        setLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, []);

  const analyze = useCallback(async (lat, lng, name) => {
    if (!lat || !lng) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await ai.satelliteAnalysis(lat, lng, name || null);
      setResult(res);
    } catch (e) {
      setError(e?.message || "Analyse fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-analyse wenn Koordinaten per URL übergeben
  useEffect(() => {
    if (initLat && initLng && !result) {
      analyze(initLat, initLng, initSpot);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const a = result?.analysis;
  const trend = result?.trend || [];
  const trendTemps = trend.map(d => d.avg_temp);
  const trendPrecip = trend.map(d => d.total_precip);

  const fetchedDate = result?.fetched_at
    ? new Date(result.fetched_at).toLocaleString("de-DE", {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <Satellite className="w-5 h-5 text-cyan-400" />
          <div>
            <h1 className="text-base font-bold text-white leading-none">Satellitenanalyse</h1>
            <p className="text-xs text-gray-500 mt-0.5">Gewässerqualität & Angelbedingungen</p>
          </div>
          {result && (
            <button
              onClick={() => coords && analyze(coords.lat, coords.lng, spotName)}
              className="ml-auto p-1.5 rounded-lg hover:bg-gray-800 transition"
              title="Neu laden"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Standort-Karte */}
        <Card className="bg-gray-800/60 border-gray-700/60">
          <CardContent className="pt-4 space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-400 mb-1 block">Gewässer / Spot (optional)</label>
                <input
                  type="text"
                  value={spotName}
                  onChange={e => setSpotName(e.target.value)}
                  placeholder="z.B. Chiemsee, Rhein bei Köln …"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={getLocation}
                disabled={locating}
                className="border-gray-600 text-gray-300 hover:text-white flex-shrink-0"
              >
                {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Navigation className="w-3.5 h-3.5 mr-1.5" />}
                GPS
              </Button>
              {coords && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-1 min-w-0">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>
                </div>
              )}
              <Button
                size="sm"
                onClick={() => coords && analyze(coords.lat, coords.lng, spotName)}
                disabled={!coords || loading}
                className="bg-cyan-700 hover:bg-cyan-600 text-white ml-auto"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Satellite className="w-3.5 h-3.5 mr-1.5" />}
                Analysieren
              </Button>
            </div>
            {!coords && !locating && (
              <p className="text-xs text-gray-500">GPS-Standort ermitteln oder Koordinaten aus der Karte übergeben.</p>
            )}
          </CardContent>
        </Card>

        {/* Laden */}
        {loading && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Satellite className="w-10 h-10 text-cyan-400 animate-pulse" />
            <p className="text-sm text-gray-400">KI analysiert Gewässerbedingungen …</p>
            <p className="text-xs text-gray-600">Wetter-, Niederschlags- und Temperaturdaten werden ausgewertet</p>
          </div>
        )}

        {/* Fehler */}
        {error && !loading && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-900/20 border border-red-800/40">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Ergebnisse */}
        {result && a && !loading && (
          <>
            {/* Angelbedingungen Banner */}
            <div className={`flex items-start gap-3 p-3 rounded-xl border ${FISHING_COLOR[a.fishing_conditions] || FISHING_COLOR.mittel}`}>
              {a.fishing_conditions === "gut"
                ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                : a.fishing_conditions === "schlecht"
                  ? <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  : <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              }
              <div>
                <p className="text-sm font-semibold capitalize">
                  Angelbedingungen: {a.fishing_conditions}
                </p>
                {a.fishing_conditions_reason && (
                  <p className="text-xs mt-0.5 opacity-80">{a.fishing_conditions_reason}</p>
                )}
              </div>
            </div>

            {/* Wasserqualitäts-Score */}
            {a.water_quality_score != null && (
              <Card className="bg-gray-800/60 border-gray-700/60">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Gewässerqualität</p>
                    <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                      {a.water_quality_score >= 70 ? "Gut" : a.water_quality_score >= 40 ? "Mittel" : "Eingeschränkt"}
                    </Badge>
                  </div>
                  <ScoreGauge score={a.water_quality_score} />
                </CardContent>
              </Card>
            )}

            {/* Kernwerte */}
            <div className="grid grid-cols-2 gap-3">
              {/* Wassertemperatur */}
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                    <p className="text-xs text-gray-400">Wasseroberfläche</p>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {a.surface_temperature_c != null ? `${a.surface_temperature_c} °C` : "–"}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendIcon values={trendTemps} />
                    <span className="text-xs text-gray-500">5-Tage-Trend</span>
                  </div>
                </CardContent>
              </Card>

              {/* Sichttiefe */}
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <p className="text-xs text-gray-400">Sichttiefe</p>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {a.visibility_depth_m != null ? `${a.visibility_depth_m} m` : "–"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">geschätzt</p>
                </CardContent>
              </Card>

              {/* Trübung */}
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wind className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-xs text-gray-400">Trübung</p>
                  </div>
                  {a.turbidity && (
                    <Badge variant="outline" className={`text-xs mt-1 ${TURBIDITY_COLOR[a.turbidity] || ""}`}>
                      {a.turbidity.charAt(0).toUpperCase() + a.turbidity.slice(1)}
                    </Badge>
                  )}
                  {a.turbidity_index != null && (
                    <p className="text-xs text-gray-500 mt-1">Index: {a.turbidity_index}</p>
                  )}
                </CardContent>
              </Card>

              {/* Algenrisiko */}
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Satellite className="w-3.5 h-3.5 text-green-400" />
                    <p className="text-xs text-gray-400">Algenrisiko</p>
                  </div>
                  {a.algae_risk && (
                    <Badge variant="outline" className={`text-xs mt-1 ${TURBIDITY_COLOR[a.algae_risk] || ""}`}>
                      {a.algae_risk.charAt(0).toUpperCase() + a.algae_risk.slice(1)}
                    </Badge>
                  )}
                  {a.algae_risk_index != null && (
                    <p className="text-xs text-gray-500 mt-1">Index: {a.algae_risk_index}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Risikoindikatore */}
            {Array.isArray(a.risk_indicators) && a.risk_indicators.length > 0 && (
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Risikohinweise
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {a.risk_indicators.map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${RISK_LEVEL_COLOR[r.level] || "text-gray-400"}`} />
                      <div>
                        <span className={`text-xs font-medium ${RISK_LEVEL_COLOR[r.level] || "text-gray-300"}`}>{r.type}</span>
                        {r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                      </div>
                      <Badge variant="outline" className={`ml-auto text-xs flex-shrink-0 ${TURBIDITY_COLOR[r.level] || "border-gray-600 text-gray-400"}`}>
                        {r.level}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 5-Tage Trend */}
            {trend.length > 0 && (
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <CardTitle className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      5-Tage Verlauf
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {trend.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 w-16 flex-shrink-0">
                          {new Date(d.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </span>
                        {d.avg_temp != null && (
                          <span className="text-orange-300 w-14">{d.avg_temp} °C</span>
                        )}
                        {d.total_precip != null && (
                          <span className={`${d.total_precip > 5 ? "text-blue-400" : "text-gray-500"}`}>
                            {d.total_precip} mm
                          </span>
                        )}
                        {trendPrecip[i] > 5 && <Badge variant="outline" className="text-xs border-blue-700/40 text-blue-400 ml-auto">Regen</Badge>}
                      </div>
                    ))}
                  </div>
                  {a.trend_summary && (
                    <p className="text-xs text-gray-400 mt-3 border-t border-gray-700/50 pt-2">{a.trend_summary}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Buddy-Erklärung */}
            {a.buddy_explanation && (
              <Card className="bg-cyan-900/15 border-cyan-800/30">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <MessageCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-cyan-300 mb-1">Buddy-Einschätzung</p>
                      <p className="text-sm text-cyan-200/80">{a.buddy_explanation}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 text-cyan-400 hover:text-cyan-300 text-xs p-0 h-auto"
                    onClick={() => navigate("/KiBuddyBeta")}
                  >
                    Buddy fragen
                    <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Empfehlungen */}
            {Array.isArray(a.recommendations) && a.recommendations.length > 0 && (
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Empfehlungen
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {a.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-300">{r}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Trip planen */}
            <Button
              variant="outline"
              className="w-full border-cyan-700/50 text-cyan-300 hover:bg-cyan-900/20"
              onClick={() => navigate(`/TripPlanner${coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ""}`)}
            >
              <MapPin className="w-4 h-4 mr-2" />
              Trip zu diesem Gewässer planen
            </Button>

            {/* Auf Karte anzeigen */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-gray-500 hover:text-white text-xs"
              onClick={() => navigate(`/MapPage${coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ""}`)}
            >
              Auf Karte anzeigen
            </Button>

            {/* Datenquelle */}
            <div className="p-3 rounded-xl bg-gray-800/30 border border-gray-700/30 space-y-1.5">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500">
                  Datenquelle: {result.data_source} — Basiert auf Wetterdaten (Temperatur, Niederschlag, UV-Index). Keine echten Satellitenbild-Daten.
                  Kein Ersatz für offizielle Gewässeranalysen.
                </p>
              </div>
              {a.data_confidence && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Datenkonfidenz: <span className="text-gray-400">{CONFIDENCE_LABEL[a.data_confidence] || a.data_confidence}</span></span>
                  {a.data_confidence_reason && <span className="text-gray-600">— {a.data_confidence_reason}</span>}
                </div>
              )}
              {fetchedDate && (
                <p className="text-xs text-gray-600">Abgerufen: {fetchedDate}</p>
              )}
            </div>
          </>
        )}

        {/* Leer-Zustand */}
        {!loading && !result && !error && (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <Satellite className="w-12 h-12 text-gray-700" />
            <p className="text-gray-500 text-sm">
              GPS-Standort ermitteln und Gewässerbedingungen analysieren.
            </p>
            <p className="text-gray-600 text-xs max-w-xs">
              Trübung, Algenrisiko, Wassertemperatur und Sichttiefe werden aus Wetter- und Klimadaten berechnet.
            </p>
            <Button
              size="sm"
              onClick={getLocation}
              disabled={locating}
              className="mt-2 bg-cyan-700 hover:bg-cyan-600 text-white"
            >
              {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Navigation className="w-3.5 h-3.5 mr-1.5" />}
              Standort ermitteln
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
