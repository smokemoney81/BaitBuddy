import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Fish, MapPin, Plus, Brain, Camera, BookOpen, Compass, Loader2, X, Flag,
  Timer, CloudSun, Wind, Gauge,
} from 'lucide-react';
import { FishingPlan } from '@/entities/FishingPlan';
import { Catch } from '@/entities/Catch';
import { selectNextTrip, readPlanSpot } from '@/lib/tripJourney';
import { formatElapsed, elapsedSeconds, timeOfDayTheme } from '@/lib/anglerMode';

const startKey = (id) => `bb_angler_start_${id}`;

function readStart(planId) {
  try {
    const v = Number(localStorage.getItem(startKey(planId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}
function writeStart(planId, ms) {
  try { localStorage.setItem(startKey(planId), String(ms)); } catch { /* ignore */ }
}
function clearStart(planId) {
  try { localStorage.removeItem(startKey(planId)); } catch { /* ignore */ }
}

export default function AnglerMode() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [startMs, setStartMs] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [ending, setEnding] = useState(false);
  const [summary, setSummary] = useState(null); // { seconds, catches }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await FishingPlan.list('-created_at');
        if (!alive) return;
        const next = selectNextTrip(Array.isArray(list) ? list : []);
        const active = next && next.is_active ? next : null;
        setPlan(active);
        if (active) {
          let s = readStart(active.id);
          if (!s) { s = Date.now(); writeStart(active.id, s); }
          setStartMs(s);
        }
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Sekunden-Ticker. Elapsed wird aus startMs berechnet, daher auch nach
  // Foreground-Resume (WebView) korrekt; visibilitychange aktualisiert sofort.
  useEffect(() => {
    if (!startMs) return undefined;
    const tick = () => setNowTick(Date.now());
    const iv = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
  }, [startMs]);

  const theme = useMemo(() => timeOfDayTheme(new Date(nowTick)), [nowTick]);
  const elapsed = elapsedSeconds(startMs, nowTick);
  const spot = plan ? readPlanSpot(plan.spot_info) : { name: '' };
  const weather = plan?.details?.weather_snapshot || null;

  const endTrip = useCallback(async () => {
    if (!plan) return;
    setEnding(true);
    const seconds = elapsedSeconds(startMs, Date.now());
    let catches = null;
    try {
      const startIso = new Date(startMs).toISOString();
      const list = await Catch.list('-catch_time', 50);
      catches = (Array.isArray(list) ? list : []).filter((c) => {
        const t = c.catch_time || c.created_at;
        return t && new Date(t).getTime() >= startMs - 60000; // kleine Toleranz
      }).length;
      void startIso;
    } catch { catches = null; }
    try {
      await FishingPlan.update(plan.id, { is_active: false });
      window.dispatchEvent(new Event('active-trips-updated'));
    } catch {
      toast.error('Trip konnte nicht beendet werden');
      setEnding(false);
      return;
    }
    clearStart(plan.id);
    setSummary({ seconds, catches });
    setEnding(false);
  }, [plan, startMs]);

  if (loading) {
    return (
      <div className="min-h-screen bb-app flex items-center justify-center" style={{ background: theme.gradient }}>
        <Loader2 className="w-7 h-7 text-cyan-300 animate-spin" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen bb-app flex items-center justify-center p-6" style={{ background: theme.gradient }}>
        <div className="bb-card max-w-sm text-center">
          <Compass className="w-10 h-10 text-cyan-300 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-slate-100">Kein aktiver Angelausflug</h1>
          <p className="text-sm text-slate-400 mt-1">Starte einen geplanten Trip, um in den Anglermodus zu wechseln.</p>
          <Link to="/TripPlanner" className="bb-action mt-4 inline-flex"><Compass size={18} /> Zur Planung</Link>
        </div>
      </div>
    );
  }

  const actions = [
    { icon: Plus, label: 'Fang', onClick: () => window.dispatchEvent(new CustomEvent('openCatchDialog')) },
    { icon: Brain, label: 'KI-Buddy', to: '/KiBuddyBeta' },
    { icon: Camera, label: 'Fotoanalyse', to: '/CatchCam' },
    { icon: MapPin, label: 'Spot speichern', to: '/Map?addSpot=1' },
    { icon: BookOpen, label: 'Fangbuch', to: '/Logbook' },
    { icon: CloudSun, label: 'Bissfenster', to: '/Weather' },
  ];

  return (
    <div className="min-h-screen bb-app" style={{ background: theme.gradient }}>
      <div className="mx-auto max-w-xl px-4 pt-[max(20px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-cyan-200/80">Anglermodus · {theme.label}</span>
          <button type="button" onClick={() => navigate('/Dashboard')} className="bb-secondary" aria-label="Anglermodus verlassen"><X size={18} /></button>
        </header>

        {/* Timer */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-2 text-cyan-200/80 text-sm"><Timer size={16} aria-hidden="true" /> Angelzeit</div>
          <div className="mt-1 font-mono text-5xl font-semibold text-slate-50 tabular-nums" aria-live="off">{formatElapsed(elapsed)}</div>
        </div>

        {/* Trip-Kontext */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-slate-200">
          {plan.target_fish && <span className="inline-flex items-center gap-1.5"><Fish size={17} className="text-cyan-300" aria-hidden="true" />{plan.target_fish}</span>}
          {spot.name && <span className="inline-flex items-center gap-1.5"><MapPin size={17} className="text-cyan-300" aria-hidden="true" />{spot.name}</span>}
        </div>

        {weather && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-300">
            {weather.temperature != null && <Chip icon={CloudSun}>{Math.round(weather.temperature)} °C</Chip>}
            {weather.wind_speed != null && <Chip icon={Wind}>{Math.round(weather.wind_speed)} km/h</Chip>}
            {weather.pressure != null && <Chip icon={Gauge}>{Math.round(weather.pressure)} hPa</Chip>}
          </div>
        )}

        {/* Schnellaktionen — große Touch-Ziele */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {actions.map(({ icon: Icon, label, to, onClick }) => {
            const cls = 'flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl bg-white/8 text-slate-100 active:scale-[.98] transition-transform';
            const inner = (<><Icon size={26} className="text-cyan-300" aria-hidden="true" /><span className="text-xs">{label}</span></>);
            return to
              ? <Link key={label} to={to} className={cls}>{inner}</Link>
              : <button key={label} type="button" onClick={onClick} className={cls}>{inner}</button>;
          })}
        </div>

        <button type="button" onClick={endTrip} disabled={ending}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600/90 py-3.5 font-semibold text-white active:scale-[.99] transition-transform disabled:opacity-60">
          {ending ? <Loader2 size={18} className="animate-spin" /> : <Flag size={18} />} Angeln beenden
        </button>
      </div>

      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bb-card max-w-sm w-full text-center">
            <h2 className="text-lg font-semibold text-slate-100">Angeltag abgeschlossen</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/5 px-3 py-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Dauer</div>
                <div className="text-slate-100 font-mono">{formatElapsed(summary.seconds)}</div>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Fänge</div>
                <div className="text-slate-100">{summary.catches != null ? summary.catches : '—'}</div>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              {summary.catches ? 'Schau dir deine Fänge im Fangbuch an und werte den Tag aus.' : 'Kein Fang erfasst? Kein Problem — die Bedingungen fließen in künftige Empfehlungen ein.'}
            </p>
            <div className="mt-4 flex gap-2">
              <Link to="/Logbook" className="bb-secondary flex-1 justify-center"><BookOpen size={16} /> Fangbuch</Link>
              <button type="button" className="bb-action flex-1 justify-center" onClick={() => navigate('/Dashboard')}>Fertig</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1">
      <Icon size={14} className="text-cyan-300" aria-hidden="true" />{children}
    </span>
  );
}
