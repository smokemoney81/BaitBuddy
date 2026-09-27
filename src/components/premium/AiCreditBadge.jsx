import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { ai, credits } from "@/api/frontendClient";
import { subscribeAiUsageChanged } from "@/lib/aiUsageBus";
import { formatTokens } from "@/lib/planAiCapabilities";
import AiVolumeCard from "@/components/premium/AiVolumeCard";
import CreditWalletCard from "@/components/credits/CreditWalletCard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// Kosten-Labels für die "Letzte Nutzungen"-Liste — dieselben Schlüssel wie
// AiVolumeCard.COST_LABELS (feature-Strings aus meterAiTokens() in
// backend/src/routes/ai.js), hier bewusst dupliziert statt geteilt: die
// Karte bleibt so unabhängig von diesem Detail-Sheet veränderbar.
const FEATURE_LABELS = {
  chat: "Buddy-Antwort",
  tts: "Vorlesen",
  realtime: "Live-Voice-Gespräch",
  vision: "Foto-/Kamera-Analyse",
  tool: "KI-Werkzeug",
};

function formatUsageTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Live-Guthabenanzeige (Punkt 10): kleine Kopfzeilen-Anzeige des
 * KI-Volumen-Stands, die sich nach jeder kostenpflichtigen KI-Nutzung
 * (aiUsageBus) selbst neu lädt. Tippen öffnet die Verbrauchsübersicht.
 * Ohne ladbare Daten rendert die Anzeige nichts (fail-open, kein Platzhalter).
 */
export default function AiCreditBadge({ user }) {
  const [usage, setUsage] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [trackingError, setTrackingError] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  const loadUsage = async () => {
    try {
      const creditData = await credits.getWallet();
      if (creditData?.enabled) {
        setWallet(creditData);
        setUsage(null);
        setTrackingError(false);
        return;
      }
    } catch (error) {
      if (error?.status !== 404) {
        setTrackingError(true);
        setWallet(null);
        setUsage(null);
        return;
      }
    }
    try {
      const data = await ai.usage();
      if (data?.ok) {
        setUsage(data);
        setWallet(null);
        setTrackingError(false);
      }
    } catch {
      setTrackingError(true);
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    loadUsage();
    const unsubscribe = subscribeAiUsageChanged(() => {
      // Mehrere Buchungen in schneller Folge (z. B. Chat + satzweises Vorlesen)
      // sollen nur einen Reload auslösen, nicht einen pro Ereignis.
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(loadUsage, 400);
    });
    return () => {
      unsubscribe();
      clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;
  if (trackingError) return <span className="bb-ai-credit-badge" role="status" aria-label="KI-Guthaben derzeit nicht verfügbar">KI: ?</span>;
  if (!wallet && (!usage || typeof usage.used !== "number")) return null;

  const unlimited = !wallet && usage.limit === null;
  const remaining = wallet ? wallet.remaining : usage.remaining;
  const exhausted = !unlimited && (remaining <= 0 || wallet?.cost_limit_reached);
  const low = !unlimited && !exhausted && (wallet ? wallet.percent_remaining <= 20 : usage.limit > 0 && usage.used / usage.limit >= 0.8);
  const modifier = exhausted ? "bb-ai-credit-badge--exhausted" : low ? "bb-ai-credit-badge--low" : "";

  return (
    <>
      <button
        type="button"
        className={`bb-ai-credit-badge ${modifier}`.trim()}
        onClick={() => setOpen(true)}
        aria-label={`KI-Guthaben: ${unlimited ? "unbegrenzt" : `${formatTokens(remaining)} ${wallet ? "Credits" : "Tokens"} übrig`}. Verbrauchsübersicht öffnen`}
      >
        <Zap size={15} aria-hidden="true" />
        <span>{unlimited ? "∞" : formatTokens(remaining)}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="bb-ai-credit-sheet">
          <SheetHeader>
            <SheetTitle>Dein KI-Guthaben</SheetTitle>
            <SheetDescription>Verbrauch dieses Monats und deine letzten Nutzungen.</SheetDescription>
          </SheetHeader>

          <div className="grid gap-4 mt-4 max-h-[70vh] overflow-y-auto">
            {wallet ? <CreditWalletCard wallet={wallet} /> : <AiVolumeCard usage={usage} />}

            {Array.isArray((wallet || usage).recent) && (wallet || usage).recent.length > 0 && (
              <section className="bb-card grid gap-2">
                <h3 className="text-base font-semibold text-white">Letzte Nutzungen</h3>
                <ul className="grid gap-1.5">
                  {(wallet || usage).recent.map((entry, index) => (
                    <li key={`${entry.created_at}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                      <span style={{ color: "var(--bb-muted)" }}>
                        {FEATURE_LABELS[entry.feature] || entry.feature}
                        <span className="ml-2 text-xs opacity-70">{formatUsageTime(entry.created_at)}</span>
                      </span>
                      <span className="text-white whitespace-nowrap">{formatTokens(wallet ? entry.credits_charged : entry.tokens)} {wallet ? "Credits" : "Tokens"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <Link
              to="/PremiumPlans"
              className="text-sm text-center underline"
              style={{ color: "var(--bb-cyan)" }}
              onClick={() => setOpen(false)}
            >
              Zur Tarifübersicht
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
