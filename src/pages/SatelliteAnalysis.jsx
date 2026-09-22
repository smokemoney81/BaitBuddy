import React, { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, Satellite, Thermometer, Eye, Wind,
  AlertTriangle, CheckCircle, MapPin, RefreshCw, MessageCircle,
  TrendingUp, TrendingDown, Minus, Navigation, Info, Calendar,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { ai } from "@/api/frontendClient";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import PremiumGuard from "@/components/premium/PremiumGuard";
import SubPageHeader from "@/components/layout/SubPageHeader";

const TURBIDITY_STYLE = {
  gering: { color: '#4ade80', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)' },
  mittel: { color: '#fbbf24', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)' },
  hoch:   { color: '#f87171', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)' },
};

const RISK_LEVEL_COLOR = {
  gering:   '#4ade80',
  mittel:   '#fbbf24',
  kritisch: '#f87171',
};

const FISHING_STYLE = {
  gut:     { background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.4)', color: '#86efac' },
  mittel:  { background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.4)', color: '#fcd34d' },
  schlecht:{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', color: '#fca5a5' },
};

const CONFIDENCE_LABEL = {
  hoch:   "Hoch",
  mittel: "Mittel",
  gering: "Gering",
};

function TrendIcon({ values }) {
  if (!values || values.length < 2) return <Minus size={14} style={{ color: 'var(--bb-muted)' }} />;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (last == null || prev == null) return <Minus size={14} style={{ color: 'var(--bb-muted)' }} />;
  if (last > prev + 0.5) return <TrendingUp size={14} style={{ color: '#f87171' }} />;
  if (last < prev - 0.5) return <TrendingDown size={14} style={{ color: '#60a5fa' }} />;
  return <Minus size={14} style={{ color: 'var(--bb-muted)' }} />;
}

function ScoreGauge({ score }) {
  const pct = Math.max(0, Math.min(100, score || 0));
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs w-8 text-right" style={{ color: 'var(--bb-muted)' }}>{pct}</span>
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
      toast.error("GPS nicht verfuegbar");
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
    <div className="bb-page">
      <SubPageHeader
        title="Satellitenanalyse"
        subtitle="Gewaesserqualitaet & Angelbedingungen"
        icon={Satellite}
        iconColor="var(--bb-cyan)"
        rightAction={result ? (
          <button
            onClick={() => coords && analyze(coords.lat, coords.lng, spotName)}
            className="p-1.5 rounded-lg transition"
            style={{ color: 'var(--bb-muted)' }}
          >
            <RefreshCw size={16} />
          </button>
        ) : undefined}
      />

      {/* Standort-Karte */}
      <div className="bb-card grid gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bb-muted)' }}>Gewaesser / Spot (optional)</label>
          <input
            type="text"
            value={spotName}
            onChange={e => setSpotName(e.target.value)}
            placeholder="z.B. Chiemsee, Rhein bei Koeln ..."
            className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none"
            style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--bb-border)' }}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="bb-secondary flex items-center gap-1.5 text-sm flex-shrink-0"
            onClick={getLocation}
            disabled={locating}
          >
            {locating ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
            GPS
          </button>
          {coords && (
            <div className="flex items-center gap-1.5 text-xs flex-1 min-w-0" style={{ color: 'var(--bb-muted)' }}>
              <MapPin size={12} className="flex-shrink-0" />
              <span className="truncate">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>
            </div>
          )}
          <button
            className="bb-action flex items-center gap-1.5 text-sm ml-auto"
            onClick={() => coords && analyze(coords.lat, coords.lng, spotName)}
            disabled={!coords || loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Satellite size={14} />}
            Analysieren
          </button>
        </div>
        {!coords && !locating && (
          <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>GPS-Standort ermitteln oder Koordinaten aus der Karte uebergeben.</p>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Satellite size={40} className="animate-pulse" style={{ color: 'var(--bb-cyan)' }} />
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>KI analysiert Gewaesserbedingungen ...</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,.25)' }}>Wetter-, Niederschlags- und Temperaturdaten werden ausgewertet</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)' }}>
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
        </div>
      )}

      {result && a && !loading && (
        <>
          {/* Angelbedingungen Banner */}
          <div className="flex items-start gap-3 p-3 rounded-xl" style={FISHING_STYLE[a.fishing_conditions] || FISHING_STYLE.mittel}>
            {a.fishing_conditions === "gut"
              ? <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
              : a.fishing_conditions === "schlecht"
                ? <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
                : <Info size={20} className="flex-shrink-0 mt-0.5" />
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

          {/* Wasserqualitaets-Score */}
          {a.water_quality_score != null && (
            <div className="bb-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bb-muted)' }}>Gewaesserqualitaet</p>
                <span className="px-2 py-0.5 rounded-full text-xs" style={{ border: '1px solid var(--bb-border)', color: 'var(--bb-muted)' }}>
                  {a.water_quality_score >= 70 ? "Gut" : a.water_quality_score >= 40 ? "Mittel" : "Eingeschraenkt"}
                </span>
              </div>
              <ScoreGauge score={a.water_quality_score} />
            </div>
          )}

          {/* Kernwerte */}
          <div className="bb-stat-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="bb-stat-card">
              <div className="flex items-center gap-1.5 mb-1">
                <Thermometer size={14} style={{ color: '#fb923c' }} />
                <span className="bb-stat-label">Wasseroberflaeche</span>
              </div>
              <div className="bb-stat-value">
                {a.surface_temperature_c != null ? `${a.surface_temperature_c} °C` : "–"}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <TrendIcon values={trendTemps} />
                <span className="text-xs" style={{ color: 'var(--bb-muted)' }}>5-Tage-Trend</span>
              </div>
            </div>

            <div className="bb-stat-card">
              <div className="flex items-center gap-1.5 mb-1">
                <Eye size={14} style={{ color: '#60a5fa' }} />
                <span className="bb-stat-label">Sichttiefe</span>
              </div>
              <div className="bb-stat-value">
                {a.visibility_depth_m != null ? `${a.visibility_depth_m} m` : "–"}
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--bb-muted)' }}>geschaetzt</p>
            </div>

            <div className="bb-stat-card">
              <div className="flex items-center gap-1.5 mb-1">
                <Wind size={14} style={{ color: 'var(--bb-muted)' }} />
                <span className="bb-stat-label">Truebung</span>
              </div>
              {a.turbidity && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs mt-1" style={TURBIDITY_STYLE[a.turbidity] || {}}>
                  {a.turbidity.charAt(0).toUpperCase() + a.turbidity.slice(1)}
                </span>
              )}
              {a.turbidity_index != null && (
                <p className="text-xs mt-1" style={{ color: 'var(--bb-muted)' }}>Index: {a.turbidity_index}</p>
              )}
            </div>

            <div className="bb-stat-card">
              <div className="flex items-center gap-1.5 mb-1">
                <Satellite size={14} style={{ color: '#4ade80' }} />
                <span className="bb-stat-label">Algenrisiko</span>
              </div>
              {a.algae_risk && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs mt-1" style={TURBIDITY_STYLE[a.algae_risk] || {}}>
                  {a.algae_risk.charAt(0).toUpperCase() + a.algae_risk.slice(1)}
                </span>
              )}
              {a.algae_risk_index != null && (
                <p className="text-xs mt-1" style={{ color: 'var(--bb-muted)' }}>Index: {a.algae_risk_index}</p>
              )}
            </div>
          </div>

          {/* Risikohinweise */}
          {Array.isArray(a.risk_indicators) && a.risk_indicators.length > 0 && (
            <div className="bb-card">
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--bb-muted)' }}>
                Risikohinweise
              </p>
              <div className="space-y-2">
                {a.risk_indicators.map((r, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: RISK_LEVEL_COLOR[r.level] || 'var(--bb-muted)' }} />
                    <div className="flex-1">
                      <span className="text-xs font-medium" style={{ color: RISK_LEVEL_COLOR[r.level] || '#d1d5db' }}>{r.type}</span>
                      {r.description && <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>{r.description}</p>}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs flex-shrink-0 ml-auto" style={TURBIDITY_STYLE[r.level] || { border: '1px solid var(--bb-border)', color: 'var(--bb-muted)' }}>
                      {r.level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5-Tage Verlauf */}
          {trend.length > 0 && (
            <div className="bb-card">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={14} style={{ color: 'var(--bb-muted)' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bb-muted)' }}>
                  5-Tage Verlauf
                </p>
              </div>
              <div className="space-y-1.5">
                {trend.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-16 flex-shrink-0" style={{ color: 'var(--bb-muted)' }}>
                      {new Date(d.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                    </span>
                    {d.avg_temp != null && (
                      <span style={{ color: '#fdba74' }} className="w-14">{d.avg_temp} °C</span>
                    )}
                    {d.total_precip != null && (
                      <span style={{ color: d.total_precip > 5 ? '#60a5fa' : 'var(--bb-muted)' }}>
                        {d.total_precip} mm
                      </span>
                    )}
                    {trendPrecip[i] > 5 && (
                      <span className="px-2 py-0.5 rounded-full text-xs ml-auto" style={{ color: '#60a5fa', border: '1px solid rgba(59,130,246,.3)' }}>Regen</span>
                    )}
                  </div>
                ))}
              </div>
              {a.trend_summary && (
                <p className="text-xs mt-3 pt-2" style={{ color: 'var(--bb-muted)', borderTop: '1px solid var(--bb-border)' }}>{a.trend_summary}</p>
              )}
            </div>
          )}

          {/* Buddy-Erklaerung */}
          {a.buddy_explanation && (
            <div className="bb-card" style={{ borderColor: 'rgba(0,229,255,.2)', background: 'rgba(0,229,255,.05)' }}>
              <div className="flex items-start gap-2">
                <MessageCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--bb-cyan)' }} />
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--bb-cyan)' }}>Buddy-Einschaetzung</p>
                  <p className="text-sm" style={{ color: 'rgba(0,229,255,.7)' }}>{a.buddy_explanation}</p>
                </div>
              </div>
              <button
                className="mt-3 text-xs flex items-center gap-1"
                style={{ color: 'var(--bb-cyan)' }}
                onClick={() => navigate("/KiBuddyBeta")}
              >
                Buddy fragen
                <ArrowLeft size={12} className="rotate-180" />
              </button>
            </div>
          )}

          {/* Empfehlungen */}
          {Array.isArray(a.recommendations) && a.recommendations.length > 0 && (
            <div className="bb-card">
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--bb-muted)' }}>
                Empfehlungen
              </p>
              <div className="space-y-1.5">
                {a.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#22c55e' }} />
                    <p className="text-sm" style={{ color: '#d1d5db' }}>{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trip planen */}
          <button
            className="bb-secondary w-full flex items-center justify-center gap-2"
            onClick={() => navigate(`/TripPlanner${coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ""}`)}
          >
            <MapPin size={16} />
            Trip zu diesem Gewaesser planen
          </button>

          <button
            className="w-full text-center text-xs py-2"
            style={{ color: 'var(--bb-muted)' }}
            onClick={() => navigate(`/MapPage${coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ""}`)}
          >
            Auf Karte anzeigen
          </button>

          {/* Datenquelle */}
          <div className="p-3 rounded-xl space-y-1.5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--bb-border)' }}>
            <div className="flex items-start gap-2">
              <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'rgba(255,255,255,.3)' }} />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,.35)' }}>
                Datenquelle: {result.data_source} — Basiert auf Wetterdaten (Temperatur, Niederschlag, UV-Index). Keine echten Satellitenbild-Daten.
                Kein Ersatz fuer offizielle Gewaesseranalysen.
              </p>
            </div>
            {a.data_confidence && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,.35)' }}>
                <span>Datenkonfidenz: <span style={{ color: 'var(--bb-muted)' }}>{CONFIDENCE_LABEL[a.data_confidence] || a.data_confidence}</span></span>
                {a.data_confidence_reason && <span style={{ color: 'rgba(255,255,255,.2)' }}>— {a.data_confidence_reason}</span>}
              </div>
            )}
            {fetchedDate && (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,.2)' }}>Abgerufen: {fetchedDate}</p>
            )}
          </div>
        </>
      )}

      {/* Leer-Zustand */}
      {!loading && !result && !error && (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <Satellite size={48} style={{ color: 'rgba(255,255,255,.15)' }} />
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
            GPS-Standort ermitteln und Gewaesserbedingungen analysieren.
          </p>
          <p className="text-xs max-w-xs" style={{ color: 'rgba(255,255,255,.25)' }}>
            Truebung, Algenrisiko, Wassertemperatur und Sichttiefe werden aus Wetter- und Klimadaten berechnet.
          </p>
          <button
            className="bb-action mt-2 flex items-center gap-1.5"
            onClick={getLocation}
            disabled={locating}
          >
            {locating ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
            Standort ermitteln
          </button>
        </div>
      )}
    </div>
  );
}
