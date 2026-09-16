import React, { useState, useCallback } from 'react';
import { Gift } from 'lucide-react';
import { trackAdEvent } from '@/lib/adAnalytics';
import { getAdConfig } from '@/lib/adConfig';
import { api } from '@/api/frontendClient';

const REWARD_LABELS = {
  ki_analyse: '+1 Premium-KI-Analyse',
  ki_voice_30min: 'KI-Voice für 30 Minuten',
  satellite: '+1 Satellitenanalyse',
  premium_tool_1h: 'Premium-Tool für 1 Stunde',
};

const REWARD_ICONS = {
  ki_analyse: '🔬',
  ki_voice_30min: '🎙️',
  satellite: '🛰️',
  premium_tool_1h: '⚡',
};

/**
 * Freiwilliger Rewarded-Ad-Button für Basic-Nutzer.
 * Workflow: Nutzer wählt Belohnung → Ad wird gezeigt → Server erteilt Reward.
 * Client darf Rewards NICHT selbst autorisieren.
 */
export default function RewardedAdButton({ className = '' }) {
  const cfg = getAdConfig();
  const availableRewards = cfg.basic_rewarded_rewards ?? ['ki_analyse', 'ki_voice_30min', 'satellite', 'premium_tool_1h'];

  const [phase, setPhase] = useState('idle'); // idle | selecting | watching | done | error
  const [selectedReward, setSelectedReward] = useState(null);
  const [remaining, setRemaining] = useState(30);
  const [errorMsg, setErrorMsg] = useState('');

  const startAd = useCallback((rewardType) => {
    setSelectedReward(rewardType);
    setPhase('watching');
    setRemaining(30);

    trackAdEvent('rewarded_ad_started', {
      reward_type: rewardType,
      user_plan: 'basic',
    });

    let count = 30;
    const interval = setInterval(() => {
      count -= 1;
      setRemaining(count);
      if (count <= 0) {
        clearInterval(interval);
        completeAd(rewardType);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const completeAd = useCallback(async (rewardType) => {
    trackAdEvent('rewarded_ad_completed', { reward_type: rewardType });

    try {
      // Serverseitige Reward-Erteilung — Client darf hier keinen Reward selbst setzen
      await api.request('POST', '/api/ads/reward/complete', { reward_type: rewardType });

      trackAdEvent('reward_granted', { reward_type: rewardType });
      setPhase('done');

      // Plan-Event feuern damit PlanContext aktualisiert
      window.dispatchEvent(new Event('plan-updated'));
    } catch {
      trackAdEvent('reward_failed', { reward_type: rewardType });
      setErrorMsg('Belohnung konnte nicht erteilt werden. Bitte versuche es später.');
      setPhase('error');
    }
  }, []);

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('selecting')}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-600/40 bg-cyan-900/20 hover:bg-cyan-900/30 text-cyan-400 text-sm font-medium transition-colors ${className}`}
      >
        <Gift size={16} />
        Belohnung ansehen
      </button>
    );
  }

  if (phase === 'selecting') {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 p-4 space-y-3">
        <div className="text-sm font-medium text-slate-200">
          Belohnung wählen
        </div>
        <div className="text-xs text-slate-400">
          Sieh dir eine kurze Werbung an und erhalte eine kostenlose Erweiterung.
        </div>
        <div className="grid grid-cols-1 gap-2">
          {availableRewards.map(r => (
            <button
              key={r}
              onClick={() => startAd(r)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/30 transition-colors text-left"
            >
              <span className="text-lg">{REWARD_ICONS[r]}</span>
              <span className="text-sm text-slate-200">{REWARD_LABELS[r]}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setPhase('idle')}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors w-full text-center pt-1"
        >
          Abbrechen
        </button>
      </div>
    );
  }

  if (phase === 'watching') {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/80 overflow-hidden">
        {/* Anzeige-Label */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            Anzeige
          </span>
          <span className="text-xs text-slate-400">
            Noch {remaining}s
          </span>
        </div>

        {/* Ad-Fläche (Placeholder) */}
        <div className="w-full aspect-video bg-slate-900 flex items-center justify-center text-slate-500 text-sm">
          <div className="text-center space-y-1">
            <div className="text-slate-400 font-medium">Werbung</div>
            <div className="text-slate-600 text-xs">Partner-Anzeige</div>
          </div>
        </div>

        {/* Belohnung angezeigt */}
        <div className="px-4 py-3 bg-slate-900/60 text-center">
          <span className="text-xs text-slate-400">
            Belohnung: <span className="text-cyan-400 font-medium">{REWARD_LABELS[selectedReward]}</span>
          </span>
        </div>

        {/* Fortschritt */}
        <div className="h-0.5 bg-slate-700">
          <div
            className="h-full bg-cyan-600 transition-all duration-1000"
            style={{ width: `${((30 - remaining) / 30) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="rounded-2xl border border-cyan-700/40 bg-cyan-900/20 px-4 py-3 text-center space-y-1">
        <div className="text-sm font-medium text-cyan-300">
          {REWARD_ICONS[selectedReward]} {REWARD_LABELS[selectedReward]} freigeschaltet
        </div>
        <button
          onClick={() => { setPhase('idle'); setSelectedReward(null); }}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          Schließen
        </button>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-2xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-center space-y-2">
        <div className="text-xs text-red-300">{errorMsg}</div>
        <button
          onClick={() => { setPhase('idle'); setErrorMsg(''); setSelectedReward(null); }}
          className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
        >
          Zurück
        </button>
      </div>
    );
  }

  return null;
}
