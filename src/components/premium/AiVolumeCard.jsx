import React from "react";
import { AlertTriangle, Gauge } from "lucide-react";
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

const PLAN_LABELS = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  elite: 'Ultimate',
  ultimate: 'Ultimate',
  friends: 'Friends',
  friends_monthly: 'Friends',
};

function formatResetDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

/**
 * Monatsstand des KI-Volumens. `usage` ist die Antwort von ai.usage().
 * Tracking-Probleme werden bewusst sichtbar gemacht: Das Backend arbeitet bei
 * DB-Problemen fail-open, damit zahlende Nutzer nicht ausgesperrt werden.
 */
export default function AiVolumeCard({ usage }) {
  if (!usage) {
    return (
      <section className="bb-card grid gap-2" aria-labelledby="ai-volume-title">
        <h2 id="ai-volume-title" className="text-lg font-semibold text-white flex items-center gap-2">
          <Gauge size={20} aria-hidden="true" style={{ color: "var(--bb-cyan)" }} />
          KI-Monatsvolumen
        </h2>
        <p className="text-sm" style={{ color: "var(--bb-muted)" }}>
          Der aktuelle Verbrauch konnte nicht geladen werden. Die Plan-Freischaltung bleibt davon unberührt.
        </p>
      </section>
    );
  }

  const unlimited = usage.limit === null;
  const used = Number.isFinite(usage.used) ? usage.used : 0;
  const limit = unlimited ? 0 : Number(usage.limit || 0);
  const remaining = unlimited ? null : Math.max(0, Number.isFinite(usage.remaining) ? usage.remaining : limit - used);
  const percent = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const exhausted = !unlimited && remaining <= 0;
  const low = !unlimited && !exhausted && percent >= 80;
  const resetDate = formatResetDate(usage.resets_at);
  const costs = usage.costs || {};
  const barColor = exhausted ? "#f87171" : low ? "#fbbf24" : "var(--bb-cyan)";
  const planLabel = PLAN_LABELS[usage.plan_id] || usage.plan_id || 'Aktueller Plan';

  return (
    <section className="bb-card grid gap-3" aria-labelledby="ai-volume-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ai-volume-title" className="text-lg font-semibold text-white flex items-center gap-2">
            <Gauge size={20} aria-hidden="true" style={{ color: "var(--bb-cyan)" }} />
            KI-Monatsvolumen
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--bb-muted)" }}>
            {planLabel} · alle Cloud-KI-Funktionen teilen sich dieses Volumen
          </p>
        </div>
        <span className="text-sm font-semibold text-white whitespace-nowrap">
          {unlimited ? "Unbegrenzt" : `${formatTokens(remaining)} übrig`}
        </span>
      </div>

      {usage.tracking === false && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100" role="status">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <strong className="block">Verbrauchserfassung derzeit nicht verfügbar</strong>
              <span>Cloud-KI bleibt aus Sicherheitsgründen nutzbar, aber der Monatsverbrauch wird gerade nicht zuverlässig gespeichert. Bitte Server-/Supabase-Konfiguration prüfen.</span>
            </div>
          </div>
        </div>
      )}

      {!unlimited && (
        <>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.12)" }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(used, limit)}
            aria-label="Verbrauchtes KI-Volumen"
          >
            <div className="h-full rounded-full" style={{ width: `${percent}%`, background: barColor }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2">
              <span className="block text-xs" style={{ color: "var(--bb-muted)" }}>Monat</span>
              <strong className="text-sm text-white">{formatTokens(limit)}</strong>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <span className="block text-xs" style={{ color: "var(--bb-muted)" }}>Verbraucht</span>
              <strong className="text-sm text-white">{formatTokens(used)}</strong>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <span className="block text-xs" style={{ color: "var(--bb-muted)" }}>Übrig</span>
              <strong className="text-sm text-white">{formatTokens(remaining)}</strong>
            </div>
          </div>
          {resetDate && (
            <p className="text-xs" style={{ color: "var(--bb-muted)" }}>
              Automatische Erneuerung des KI-Volumens am {resetDate}.
            </p>
          )}
        </>
      )}

      {unlimited && resetDate && (
        <p className="text-sm" style={{ color: "var(--bb-muted)" }}>
          Unbegrenzter Zugriff · Abrechnungszeitraum erneuert sich am {resetDate}.
        </p>
      )}

      {exhausted && (
        <p className="text-sm text-red-300" role="status">
          Dein Monatsvolumen ist aufgebraucht. Der Buddy nutzt bis zur Erneuerung nur noch die lokale Wissensbasis bzw. die KI auf dem Gerät. Ein höherer Plan erhöht das Monatsvolumen.
        </p>
      )}
      {low && (
        <p className="text-sm text-amber-200" role="status">
          Du hast bereits {percent} % deines Monatsvolumens genutzt.
        </p>
      )}

      <details className="text-sm" style={{ color: "var(--bb-muted)" }}>
        <summary className="cursor-pointer text-white">Token-Kosten je KI-Funktion</summary>
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
        <p className="mt-2">Fehlgeschlagene Anfragen, lokale Wissensantworten und die KI auf dem Gerät kosten keine Buddy-Tokens.</p>
      </details>
    </section>
  );
}
