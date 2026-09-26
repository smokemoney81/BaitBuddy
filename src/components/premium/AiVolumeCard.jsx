import React from "react";
import { Gauge } from "lucide-react";
import { formatTokens } from "@/lib/planAiCapabilities";

// Kosten je Werkzeug in der Reihenfolge, in der Nutzer sie am häufigsten
// brauchen. Die Werte selbst kommen vom Server (GET /api/ai/usage → costs).
const COST_LABELS = [
  ["chat", "Buddy-Antwort (Text oder Hands-free)"],
  ["tts", "Vorlesen"],
  ["realtime", "Live-Voice-Gespräch (pro Sitzung)"],
  ["vision", "Foto-/Kamera-Analyse"],
  ["tool", "Weitere KI-Werkzeuge (Prognose, Rezepte, Berichte)"],
];

function formatResetDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

/**
 * Monatsstand des KI-Volumens. `usage` ist die Antwort von ai.usage();
 * ohne Daten rendert die Karte nichts.
 */
export default function AiVolumeCard({ usage }) {
  if (!usage || typeof usage.used !== "number") return null;

  const unlimited = usage.limit === null;
  const limit = unlimited ? 0 : usage.limit;
  const percent = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((usage.used / limit) * 100));
  const exhausted = !unlimited && usage.remaining <= 0;
  const low = !unlimited && !exhausted && percent >= 80;
  const resetDate = formatResetDate(usage.resets_at);
  const costs = usage.costs || {};
  const barColor = exhausted ? "#f87171" : low ? "#fbbf24" : "var(--bb-cyan)";

  return (
    <section className="bb-card grid gap-3" aria-labelledby="ai-volume-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ai-volume-title" className="text-lg font-semibold text-white flex items-center gap-2">
          <Gauge size={20} aria-hidden="true" style={{ color: "var(--bb-cyan)" }} />
          Dein KI-Volumen
        </h2>
        <span className="text-sm font-semibold text-white">
          {unlimited ? "Unbegrenzt" : `${formatTokens(usage.remaining)} übrig`}
        </span>
      </div>

      {!unlimited && (
        <>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.12)" }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(usage.used, limit)}
            aria-label="Verbrauchtes KI-Volumen"
          >
            <div className="h-full rounded-full" style={{ width: `${percent}%`, background: barColor }} />
          </div>
          <p className="text-sm" style={{ color: "var(--bb-muted)" }}>
            {formatTokens(usage.used)} von {formatTokens(limit)} Buddy-Tokens verbraucht
            {resetDate ? ` · erneuert am ${resetDate}` : ""}
          </p>
        </>
      )}

      {exhausted && (
        <p className="text-sm text-red-300" role="status">
          Dein Volumen ist aufgebraucht. Der Buddy antwortet bis zur Erneuerung nur noch aus der lokalen Wissensbasis
          bzw. mit der KI auf dem Gerät — oder du wechselst in einen höheren Plan.
        </p>
      )}
      {low && (
        <p className="text-sm text-amber-200" role="status">
          Du hast schon {percent} % deines Monatsvolumens genutzt.
        </p>
      )}

      <details className="text-sm" style={{ color: "var(--bb-muted)" }}>
        <summary className="cursor-pointer text-white">Was kostet wie viel?</summary>
        <ul className="mt-2 grid gap-1">
          {COST_LABELS.filter(([key]) => typeof costs[key] === "number").map(([key, label]) => (
            <li key={key} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className="text-white whitespace-nowrap">
                {key === "tts" && costs.tts_chars
                  ? `${costs.tts} je ${costs.tts_chars} Zeichen`
                  : `${costs[key]} ${costs[key] === 1 ? "Token" : "Tokens"}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2">Fehlgeschlagene Anfragen, Antworten aus der lokalen Wissensbasis und die KI auf dem Gerät kosten nichts.</p>
      </details>
    </section>
  );
}
