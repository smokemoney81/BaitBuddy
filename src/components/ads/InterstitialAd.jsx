import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackAdEvent } from '@/lib/adAnalytics';
import { getAdConfig } from '@/lib/adConfig';

const LS_KEY = 'bb_ad_last_interstitial';

/**
 * Prüft ob der Frequency-Cap abgelaufen ist.
 * @param {number} cooldownSeconds
 */
export function canShowInterstitial(cooldownSeconds) {
  try {
    const last = Number(localStorage.getItem(LS_KEY) ?? 0);
    return Date.now() - last >= cooldownSeconds * 1000;
  } catch {
    return true;
  }
}

function markInterstitialShown() {
  try {
    localStorage.setItem(LS_KEY, String(Date.now()));
  } catch {}
}

/**
 * Interstitial-Ad für Gäste.
 *
 * Props:
 *   onComplete — wird aufgerufen wenn Ad fertig oder übersprungen (Tool öffnen)
 *   targetPath — wohin nach der Ad navigiert wird (optional, alternativ onComplete nutzen)
 *   sourceTool — Tracking-Kontext (von welchem Tool)
 */
export default function InterstitialAd({ onComplete, targetPath, sourceTool }) {
  const cfg = getAdConfig();
  const duration = cfg.guest_interstitial_duration_s ?? 30;
  const [remaining, setRemaining] = useState(duration);
  const [canSkip, setCanSkip] = useState(false);
  const intervalRef = useRef(null);
  const navigate = useNavigate();

  const finish = useCallback((skipped = false) => {
    clearInterval(intervalRef.current);
    markInterstitialShown();
    trackAdEvent(skipped ? 'ad_skipped' : 'ad_completed', {
      ad_type: 'interstitial',
      user_plan: 'guest',
      source_tool: sourceTool,
      target_tool: targetPath,
    });
    if (targetPath) navigate(targetPath);
    onComplete?.();
  }, [onComplete, targetPath, sourceTool, navigate]);

  useEffect(() => {
    trackAdEvent('ad_started', {
      ad_type: 'interstitial',
      user_plan: 'guest',
      source_tool: sourceTool,
      target_tool: targetPath,
    });

    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(intervalRef.current);
          setCanSkip(true);
          finish(false);
          return 0;
        }
        if (next <= 0) setCanSkip(true);
        return next;
      });
    }, 1000);

    const skipAt = cfg.guest_interstitial_skip_after_s ?? 30;
    const skipTimer = setTimeout(() => setCanSkip(true), skipAt * 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(skipTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0B1324]">
      {/* Ad-Content-Bereich */}
      <div className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800/80 shadow-2xl">
        {/* Anzeige-Label */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700/60 uppercase tracking-wider">
            Anzeige
          </span>
        </div>

        {/* Ad-Fläche (Placeholder — im echten Betrieb: <video> oder <iframe>) */}
        <div className="w-full aspect-video flex items-center justify-center bg-slate-900 text-slate-500 text-sm select-none">
          <div className="text-center space-y-2 px-8">
            <div className="text-slate-400 font-medium">Werbung</div>
            <div className="text-slate-600 text-xs">
              Ad-Slot · Partner-Anzeige
            </div>
          </div>
        </div>

        {/* Countdown + Skip */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60">
          <span className="text-slate-400 text-sm">
            {remaining > 0 ? `Weiter in ${remaining}s` : 'Fertig'}
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/PremiumPlans')}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Werbefrei werden
            </button>
            <button
              onClick={() => finish(true)}
              disabled={!canSkip}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
                canSkip
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {canSkip ? 'Weiter' : `${remaining}s`}
            </button>
          </div>
        </div>
      </div>

      {/* Fortschrittsbalken */}
      <div className="absolute bottom-0 left-0 h-0.5 bg-cyan-600 transition-all duration-1000"
        style={{ width: `${((duration - remaining) / duration) * 100}%` }}
      />
    </div>
  );
}
