import React, { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Shield, MapPin, Phone, Pause, X, ChevronRight, Wind, Zap, Thermometer, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { weather } from "@/api/frontendClient";
import { notifyAction } from "@/lib/actionNotifications";

// Schwellwerte für Sicherheitsmodus-Aktivierung
const SAFETY_TRIGGERS = {
  extreme: { label: "Extreme Gefahr", color: "purple", priority: 4 },
  severe:  { label: "Unwettergefahr", color: "red",    priority: 3 },
};

// Kategorien kritischer Wetterereignisse
const CRITICAL_EVENTS = [
  "GEWITTER", "BLITZ", "STURM", "TORNADO", "ORKAN", "UNWETTER",
  "THUNDER", "LIGHTNING", "STORM", "HURRICANE",
  "HOCHWASSER", "ÜBERFLUTUNG", "FLOOD",
  "EXTREME HITZE", "EXTREME KÄLTE", "FROST",
];

function isCritical(alert) {
  if (!alert) return false;
  const sev = (alert.severity || "").toLowerCase();
  if (sev === "extreme" || sev === "severe") return true;
  const text = `${alert.event || ""} ${alert.headline || ""}`.toUpperCase();
  return CRITICAL_EVENTS.some(ev => text.includes(ev));
}

function AlertIcon({ event = "" }) {
  const up = event.toUpperCase();
  if (up.includes("GEWITTER") || up.includes("BLITZ") || up.includes("THUNDER")) return <Zap className="w-5 h-5" />;
  if (up.includes("STURM") || up.includes("WIND") || up.includes("ORKAN")) return <Wind className="w-5 h-5" />;
  if (up.includes("HOCHWASSER") || up.includes("FLOOD")) return <Waves className="w-5 h-5" />;
  if (up.includes("HITZE") || up.includes("FROST") || up.includes("KÄLTE")) return <Thermometer className="w-5 h-5" />;
  return <AlertTriangle className="w-5 h-5" />;
}

// Sicherheitsempfehlungen nach Wettertyp
function getSafetyActions(alerts) {
  const actions = [];
  const combined = alerts.map(a => `${a.event || ""} ${a.headline || ""}`).join(" ").toUpperCase();

  if (combined.includes("GEWITTER") || combined.includes("BLITZ") || combined.includes("THUNDER")) {
    actions.push("Sofort das Gewässer verlassen — Wasser leitet Strom.");
    actions.push("Rute flachlegen, Metallteile meiden.");
    actions.push("Schutz in einem festen Gebäude oder Auto suchen, nie unter Bäumen.");
    actions.push("Mindestens 30 Minuten nach dem letzten Donner warten.");
  }
  if (combined.includes("STURM") || combined.includes("ORKAN") || combined.includes("WIND")) {
    actions.push("Boot sofort anlegen und sichern.");
    actions.push("Ufer mit hohen Bäumen meiden — Astbruch.");
    actions.push("Auf einem erhöhten, windgeschützten Platz Schutz suchen.");
  }
  if (combined.includes("HOCHWASSER") || combined.includes("FLOOD")) {
    actions.push("Flussufer und Tallagen sofort verlassen.");
    actions.push("Höher gelegene, sichere Plätze aufsuchen.");
    actions.push("Strömungsgeschwindigkeit nicht unterschätzen.");
  }
  if (combined.includes("HITZE")) {
    actions.push("Direkte Sonneneinstrahlung vermeiden, ausreichend trinken.");
    actions.push("Angeln in den frühen Morgen- oder Abendstunden verschieben.");
  }
  if (combined.includes("FROST") || combined.includes("KÄLTE")) {
    actions.push("Auf Eis nie allein gehen, Eisdicke mindestens 15 cm.");
    actions.push("Wärmeschutzkleidung und trockene Reserve einpacken.");
  }
  if (actions.length === 0) {
    actions.push("Tour vorsichtshalber pausieren oder beenden.");
    actions.push("Wetterentwicklung aufmerksam verfolgen.");
  }
  return actions;
}

/**
 * Sicherheitsmodus-Panel: erscheint bei amtlichen Unwetterwarnungen.
 * Zeigt Handlungsempfehlungen + Trip-Aktionen.
 */
export default function SafetyMode({
  lat,
  lon,
  tripActive = false,
  onPauseTrip,
  onEndTrip,
  className = "",
}) {
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const criticalAlerts = alerts.filter(isCritical);
  const hasCritical    = criticalAlerts.length > 0;

  const loadAlerts = useCallback(async () => {
    if (lat == null || lon == null) return;
    setLoading(true);
    try {
      const res = await weather.alerts(lat, lon);
      const list = Array.isArray(res?.alerts) ? res.alerts : [];
      setAlerts(list);
      // Notification bei neuer kritischer Warnung
      if (list.some(isCritical) && !dismissed) {
        notifyAction("Wetterwarnung", {
          body: list.find(isCritical)?.headline || "Kritische Wetterwarnung für deinen Standort.",
          tag: "safety-mode",
        });
      }
    } catch {
      // Netzwerkfehler → still
    } finally {
      setLoading(false);
    }
  }, [lat, lon, dismissed]);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 5 * 60 * 1000); // alle 5 Min
    return () => clearInterval(interval);
  }, [loadAlerts]);

  if (!hasCritical || dismissed) return null;

  const safetyActions = getSafetyActions(criticalAlerts);
  const topAlert = criticalAlerts[0];
  const isPurple = (topAlert?.severity || "").toLowerCase() === "extreme";

  const borderColor = isPurple ? "border-purple-500" : "border-red-500";
  const bgColor     = isPurple ? "bg-purple-950/60"  : "bg-red-950/60";
  const textColor   = isPurple ? "text-purple-300"   : "text-red-300";
  const badgeCls    = isPurple ? "bg-purple-900/80 text-purple-200 border-purple-700" : "bg-red-900/80 text-red-200 border-red-700";

  return (
    <div className={`rounded-2xl border-2 ${borderColor} ${bgColor} p-4 space-y-3 ${className}`} role="alert" aria-live="assertive">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className={`w-5 h-5 ${textColor} flex-shrink-0`} />
          <div>
            <span className={`font-bold text-sm ${textColor}`}>Sicherheitsmodus aktiv</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {criticalAlerts.slice(0, 2).map((a, i) => (
                <Badge key={i} variant="outline" className={`text-xs ${badgeCls}`}>
                  <AlertIcon event={a.event} />
                  <span className="ml-1">{a.event || a.headline || "Warnung"}</span>
                </Badge>
              ))}
              {criticalAlerts.length > 2 && (
                <Badge variant="outline" className={`text-xs ${badgeCls}`}>
                  +{criticalAlerts.length - 2} weitere
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(v => !v)}
            className={`p-1 rounded ${textColor} hover:opacity-70`}
            aria-label={expanded ? "Zusammenfalten" : "Ausklappen"}
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
          <button
            onClick={() => setDismissed(true)}
            className={`p-1 rounded ${textColor} hover:opacity-70`}
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Warnung */}
          {topAlert?.headline && (
            <p className={`text-xs ${textColor} leading-relaxed`}>{topAlert.headline}</p>
          )}

          {/* Handlungsempfehlungen */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">Sofortmaßnahmen</p>
            {safetyActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 w-4 h-4 rounded-full ${isPurple ? "bg-purple-600" : "bg-red-600"} flex-shrink-0 flex items-center justify-center text-white text-xs font-bold`}>
                  {i + 1}
                </span>
                <p className="text-xs text-white/90 leading-relaxed">{action}</p>
              </div>
            ))}
          </div>

          {/* Aktionsbuttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {tripActive && onPauseTrip && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-600 text-amber-300 hover:bg-amber-900/40 text-xs h-8"
                onClick={onPauseTrip}
              >
                <Pause className="w-3.5 h-3.5 mr-1.5" />
                Trip pausieren
              </Button>
            )}
            {tripActive && onEndTrip && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-600 text-red-300 hover:bg-red-900/40 text-xs h-8"
                onClick={onEndTrip}
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Trip beenden
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-blue-600 text-blue-300 hover:bg-blue-900/40 text-xs h-8"
              onClick={() => {
                if (lat && lon) {
                  window.open(`https://www.google.com/maps/search/Schutzraum/@${lat},${lon},14z`, "_blank", "noopener");
                }
              }}
            >
              <MapPin className="w-3.5 h-3.5 mr-1.5" />
              Sicheren Ort finden
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-green-600 text-green-300 hover:bg-green-900/40 text-xs h-8"
              onClick={() => window.open("tel:112")}
            >
              <Phone className="w-3.5 h-3.5 mr-1.5" />
              Notruf 112
            </Button>
          </div>

          {/* DWD-Hinweis */}
          <p className="text-xs text-white/40">
            Amtliche Warnung des Deutschen Wetterdienstes (DWD). Sicherheit geht vor Fangoptimierung.
          </p>
        </>
      )}
    </div>
  );
}
