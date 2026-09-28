import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { weather } from "@/api/frontendClient";
import { AlertTriangle, ChevronRight } from "lucide-react";

// Kompakte Banner-Stile je Warnstufe
const BANNER_STYLE = {
  extreme: { label: "Extreme Gefahr", border: "border-purple-500/60", bg: "bg-purple-950/60", accent: "text-purple-300" },
  severe: { label: "Unwetterwarnung", border: "border-red-500/60", bg: "bg-red-950/60", accent: "text-red-300" },
  moderate: { label: "Markante Wetterwarnung", border: "border-amber-500/60", bg: "bg-amber-950/60", accent: "text-amber-300" },
  minor: { label: "Wetterhinweis", border: "border-yellow-500/50", bg: "bg-yellow-950/50", accent: "text-yellow-300" },
};

const styleFor = (severity) => BANNER_STYLE[severity] || BANNER_STYLE.moderate;

const readStoredLocation = () => {
  try {
    const raw = localStorage.getItem("fm_current_location");
    if (!raw) return null;
    const loc = JSON.parse(raw);
    if (loc?.lat != null && loc?.lon != null) return { lat: loc.lat, lon: loc.lon };
  } catch {
    // ignore parse errors
  }
  return null;
};

/**
 * Prominenter, aber dezenter Warn-Banner für das Dashboard. Zeigt nur dann etwas
 * an, wenn echte amtliche DWD-Unwetterwarnungen für den Standort vorliegen –
 * ansonsten wird nichts gerendert. Tippen führt zur vollständigen Warnungsseite.
 */
export default function WeatherWarningBanner({ lat, lon }) {
  const [coords, setCoords] = useState(() => {
    if (lat != null && lon != null) return { lat, lon };
    return readStoredLocation();
  });
  const [alerts, setAlerts] = useState([]);

  // Falls Props später eintreffen, übernehmen
  useEffect(() => {
    if (lat != null && lon != null) setCoords({ lat, lon });
  }, [lat, lon]);

  const loadAlerts = useCallback(async () => {
    if (!coords) return;
    try {
      const res = await weather.alerts(coords.lat, coords.lon);
      setAlerts(Array.isArray(res?.alerts) ? res.alerts : []);
    } catch (e) {
      // Banner bei Fehler einfach ausblenden – nicht aufdringlich
      console.error("Unwetterwarnungen konnten nicht geladen werden:", e);
      setAlerts([]);
    }
  }, [coords]);

  useEffect(() => {
    if (!coords) return;
    loadAlerts();
    const id = setInterval(loadAlerts, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [coords, loadAlerts]);

  if (alerts.length === 0) return null;

  const top = alerts[0];
  const s = styleFor(top.severity);
  const extra = alerts.length - 1;

  return (
    <Link
      to={createPageUrl("Weather")}
      className={`flex items-center gap-2.5 rounded-2xl border ${s.border} ${s.bg} backdrop-blur-sm px-3 py-2 transition-colors hover:brightness-110`}
      role="alert"
    >
      <AlertTriangle className={`w-5 h-5 shrink-0 ${s.accent}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] uppercase tracking-wider font-bold ${s.accent}`}>
          {s.label}
        </div>
        <div className="text-white text-sm font-semibold truncate">
          {top.headline || top.event}
        </div>
        {extra > 0 && (
          <div className="text-xs text-gray-300 mt-0.5">
            +{extra} weitere {extra === 1 ? "Warnung" : "Warnungen"} für deinen Standort
          </div>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
    </Link>
  );
}
