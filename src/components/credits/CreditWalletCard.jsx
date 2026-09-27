import React from "react";
import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";

function formatCredits(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "0";
  return n.toLocaleString("de-DE");
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

/**
 * Guthabenanzeige des neuen Credit-Systems. `wallet` ist die Antwort von
 * credits.getWallet() (enabled:true erwartet — der Aufrufer blendet die
 * Karte sonst ganz aus). `onBuyCredits` öffnet die Topup-Auswahl.
 */
export default function CreditWalletCard({ wallet, onBuyCredits }) {
  if (!wallet || typeof wallet.remaining !== "number") return null;

  const total = wallet.total_credits || 0;
  const remaining = wallet.remaining || 0;
  const percent = total > 0 ? Math.max(0, Math.min(100, wallet.percent_remaining ?? Math.round((remaining / total) * 100))) : 0;
  const exhausted = remaining <= 0 || wallet.cost_limit_reached;
  const veryLow = !exhausted && percent < 10;
  const low = !exhausted && !veryLow && percent < 20;
  const barColor = exhausted ? "#f87171" : veryLow ? "#fb923c" : low ? "#fbbf24" : "var(--bb-cyan)";
  const renewalDate = formatDate(wallet.next_renewal);

  return (
    <section className="bb-card grid gap-3" aria-labelledby="credit-wallet-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="credit-wallet-title" className="text-lg font-semibold text-white flex items-center gap-2">
          <Gauge size={20} aria-hidden="true" style={{ color: "var(--bb-cyan)" }} />
          Dein Guthaben
        </h2>
        <span className="text-sm font-semibold text-white">
          {formatCredits(remaining)} / {formatCredits(total)} Credits
        </span>
      </div>

      <div
        className="h-2.5 w-full rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.12)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Verbleibendes Guthaben"
      >
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: barColor }} />
      </div>
      <p className="text-sm" style={{ color: "var(--bb-muted)" }}>
        {percent} % verfügbar{renewalDate ? ` · Erneuerung am ${renewalDate}` : ""}
      </p>

      {exhausted && (
        <div className="grid gap-2" role="status">
          <p className="text-sm text-red-300">
            {wallet.cost_limit_reached
              ? 'Das KI-Kostenlimit deines Tarifs ist für diesen Zeitraum erreicht.'
              : 'Dein Guthaben ist für diesen Abrechnungszeitraum aufgebraucht.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {wallet.topup_packages?.length > 0 && onBuyCredits && (
              <button type="button" onClick={onBuyCredits} className="bb-action text-sm">
                Credits kaufen
              </button>
            )}
            <Link to="/PremiumPlans" className="bb-secondary text-sm">
              Tarif upgraden
            </Link>
          </div>
          {renewalDate && (
            <p className="text-xs" style={{ color: "var(--bb-muted)" }}>
              Oder warte bis zur Erneuerung am {renewalDate}.
            </p>
          )}
        </div>
      )}
      {veryLow && !exhausted && (
        <p className="text-sm text-amber-300" role="status">
          Nur noch {percent} % deines Guthabens übrig.
        </p>
      )}
      {low && (
        <p className="text-sm" style={{ color: "var(--bb-muted)" }} role="status">
          Du hast schon {100 - percent} % deines Guthabens verbraucht.
        </p>
      )}
    </section>
  );
}
