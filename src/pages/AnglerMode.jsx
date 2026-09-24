import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Fish, MapPin, Camera, BookOpen, Compass, Loader2, Flag, CloudSun, Wind, CalendarDays,
  ChevronRight, Anchor, MessageCircle, Mic, Radio, Map as MapIcon, Activity, LifeBuoy,
} from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';
import { useLocation as useGeoLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { formatForecastTime } from '@/lib/fishingConditions';
import { fishImageFor } from '@/lib/fishImages';
import { FishingPlan } from '@/entities/FishingPlan';
import { Catch } from '@/entities/Catch';
import { selectNextTrip, readPlanSpot } from '@/lib/tripJourney';
import { formatElapsed, elapsedSeconds, timeOfDayTheme, readTripStart as readStart, writeTripStart as writeStart, clearTripStart as clearStart } from '@/lib/anglerMode';
import { computeInsights } from '@/lib/fishingInsights';

export default function AnglerMode() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [startMs, setStartMs] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [ending, setEnding] = useState(false);
  const [summary, setSummary] = useState(null); // { seconds, catches }
  const [tripCatches, setTripCatches] = useState([]);
  const { currentLocation } = useGeoLocation();

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

  // Fänge seit Trip-Start für die Live-Timeline.
  useEffect(() => {
    if (!startMs) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const list = await Catch.list('-catch_time', 50);
        if (!alive) return;
        setTripCatches((Array.isArray(list) ? list : []).filter((c) => {
          const t = c.catch_time || c.created_at;
          return t && new Date(t).getTime() >= startMs - 60000;
        }));
      } catch { /* Timeline bleibt beim Trip-Start */ }
    };
    load();
    window.addEventListener('catch-saved', load);
    return () => { alive = false; window.removeEventListener('catch-saved', load); };
  }, [startMs]);

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
  const snapshot = plan?.details?.weather_snapshot || null;
  const lat = spot.lat ?? currentLocation?.lat;
  const lon = spot.lon ?? currentLocation?.lon;
  const conditions = useFishingConditions(lat, lon);
  const live = conditions.data?.current;
  const weather = live
    ? { temperature: live.temperature_2m, wind_speed: live.wind_speed_10m, code: live.weather_code }
    : snapshot;
  const nowRow = conditions.hours.find(r => r.time <= nowTick && nowTick < r.time + 3600000);
  const biteIndex = nowRow?.index ?? null;
  const bestWindow = conditions.window;

  const endTrip = useCallback(async () => {
    if (!plan) return;
    setEnding(true);
    const seconds = elapsedSeconds(startMs, Date.now());
    let catches = null;
    let insights = [];
    try {
      const list = await Catch.list('-catch_time', 50);
      const tripCatches = (Array.isArray(list) ? list : []).filter((c) => {
        const t = c.catch_time || c.created_at;
        return t && new Date(t).getTime() >= startMs - 60000; // kleine Toleranz
      });
      catches = tripCatches.length;
      insights = computeInsights(tripCatches).slice(0, 3);
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
    setSummary({ seconds, catches, insights });
    setEnding(false);
  }, [plan, startMs]);

  // "Trip beenden" aus dem Hands-free Buddy landet mit ?end=1 hier, damit der
  // Abschluss (Dauer, Fänge, Auswertung) an einer Stelle bleibt.
  const endRequested = searchParams.get('end') === '1';
  useEffect(() => {
    if (!endRequested || !plan || !startMs || ending || summary) return;
    setSearchParams({}, { replace: true });
    endTrip();
  }, [endRequested, plan, startMs, ending, summary, endTrip, setSearchParams]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-cyan-300 animate-spin" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="bb-page">
        <PageTitle title="Dein Anglermodus" subtitle="Timer, Wetter, Bissindex und Fänge – alles für den Tag am Wasser." />
        <div className="bb-card text-center">
          <Compass className="w-10 h-10 text-cyan-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-100">Kein aktiver Angelausflug</h2>
          <p className="text-sm text-slate-400 mt-1">Starte einen geplanten Trip, um in den Anglermodus zu wechseln.</p>
          <Link to="/TripPlanner" className="bb-action mt-4 inline-flex"><Compass size={18} aria-hidden="true" /> Zur Planung</Link>
        </div>
      </div>
    );
  }

  const fishImage = fishImageFor(plan.target_fish);
  const timeline = [
    ...tripCatches.map(c => ({
      id: `c-${c.id}`,
      time: new Date(c.catch_time || c.created_at).getTime(),
      tone: 'green',
      icon: Fish,
      title: 'Fang erfasst',
      text: [c.species, c.length_cm ? `${c.length_cm} cm` : null, c.bait_used || c.bait].filter(Boolean).join(' · '),
      to: '/Logbook',
    })),
    { id: 'start', time: startMs, tone: 'grey', icon: Flag, title: 'Trip gestartet', text: spot.name || plan.title || '' },
  ].sort((a, b) => b.time - a.time);

  const shareLocation = async () => {
    if (!navigator.geolocation) { toast.error('Standort ist auf diesem Gerät nicht verfügbar.'); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const url = `https://maps.google.com/?q=${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
      const text = `Ich brauche Hilfe. Meine Position: ${url}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Notfall – meine Position', text });
        else { await navigator.clipboard.writeText(text); toast.success('Position kopiert – sende sie an deine Kontakte.'); }
      } catch { /* Teilen abgebrochen */ }
    }, () => toast.error('Standort konnte nicht ermittelt werden.'), { timeout: 15000, enableHighAccuracy: true });
  };

  return (
    <div className="bb-page bb-angler">
      <header className="bb-angler-head">
        <h1 className="bb-angler-title">Anglermodus</h1>
        <span className="bb-angler-status"><i aria-hidden="true" />Trip aktiv · {theme.label}</span>
      </header>

      <div className="bb-angler-hero">
        <div className="bb-angler-clock">
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            <small>{new Date(nowTick).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</small>
            <strong>{new Date(nowTick).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</strong>
          </span>
        </div>
        <p className="bb-angler-timer-label">Trip-Timer</p>
        <p className="bb-angler-timer" aria-live="off">{formatElapsed(elapsed)}</p>
        {spot.name && (
          <Link to={spot.lat != null ? `/Map?lat=${spot.lat}&lon=${spot.lon}` : '/Map'} className="bb-angler-spot">
            <MapPin size={20} aria-hidden="true" /><span>{spot.name}</span><ChevronRight size={20} aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="bb-angler-tiles">
        <Link to="/Weather" className="bb-angler-tile">
          <span className="bb-angler-tile-label">Wetter</span>
          <CloudSun size={34} aria-hidden="true" className="bb-weather-icon" />
          <strong>{weather?.temperature != null ? `${Math.round(weather.temperature)}°C` : '–'}</strong>
          <small><Wind size={13} aria-hidden="true" />{weather?.wind_speed != null ? `${Math.round(weather.wind_speed)} km/h` : 'kein Wert'}</small>
        </Link>
        <Link to="/Weather" className="bb-angler-tile">
          <span className="bb-angler-tile-label">Bissindex</span>
          <BiteRing value={biteIndex} />
          <small className={biteIndex >= 55 ? 'text-[var(--bb-green)]' : ''}>{biteIndex == null ? 'Standort nötig' : biteIndex >= 70 ? 'Sehr gut' : biteIndex >= 55 ? 'Gut' : biteIndex >= 40 ? 'Mittel' : 'Schwach'}</small>
        </Link>
        <div className="bb-angler-tile">
          <span className="bb-angler-tile-label">Zielfisch</span>
          {fishImage ? <img src={fishImage} alt="" /> : <Fish size={34} aria-hidden="true" className="text-cyan-300" />}
          <strong>{plan.target_fish || 'Offen'}</strong>
          {bestWindow && (
            <small className="text-amber-300">Beste Zeit: {formatForecastTime(bestWindow.start, conditions.data?.timezone)}–{formatForecastTime(bestWindow.end, conditions.data?.timezone)}</small>
          )}
        </div>
        <Link to="/TripPlanner" className="bb-angler-tile">
          <span className="bb-angler-tile-label">Aktueller Köder</span>
          <Anchor size={30} aria-hidden="true" className="text-cyan-300" />
          <strong>{plan.details?.bait || 'Nicht geplant'}</strong>
        </Link>
      </div>

      <div className="bb-angler-actions">
        <Link to="/HandsFreeBuddy" className="bb-angler-action"><MessageCircle size={26} aria-hidden="true" /><span><strong>Hey Buddy</strong><small>Hands-free fragen</small></span></Link>
        <Link to="/VoiceChat" className="bb-angler-action"><Mic size={26} aria-hidden="true" /><span><strong>Voice</strong><small>Sprachmodus</small></span></Link>
        <Link to="/AI" className="bb-angler-action is-green"><Radio size={26} aria-hidden="true" /><span><strong>Biss&shy;erkennung</strong><small>Kamera starten</small></span></Link>
      </div>
      <div className="bb-angler-actions is-two">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('openCatchDialog'))} className="bb-angler-action">
          <Camera size={28} aria-hidden="true" /><span><strong>Fang erfassen</strong><small>Foto · Größe · Köder</small></span>
        </button>
        <Link to="/Map" className="bb-angler-action"><MapIcon size={28} aria-hidden="true" /><span><strong>Karte öffnen</strong><small>Aktuellen Spot anzeigen</small></span><ChevronRight size={20} aria-hidden="true" /></Link>
      </div>

      <section className="bb-card" aria-labelledby="timeline-title">
        <div className="bb-section-head">
          <h2 id="timeline-title" className="bb-section-title"><Activity size={22} aria-hidden="true" />Live-Timeline</h2>
          <Link to="/Logbook" className="bb-see-all">Fangbuch <ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <ol className="bb-timeline">
          {timeline.map(entry => {
            const Icon = entry.icon;
            return (
              <li key={entry.id} className={`is-${entry.tone}`}>
                <span className="bb-timeline-time">{new Date(entry.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="bb-timeline-icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="min-w-0"><strong>{entry.title}</strong>{entry.text && <small>{entry.text}</small>}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="bb-card bb-card-danger bb-sos">
        <LifeBuoy size={40} aria-hidden="true" className="text-red-400 shrink-0" />
        <span className="flex-1 min-w-0">
          <strong>SOS</strong>
          <small>Notfall? Ruf 112 oder sende deine Position an Kontakte.</small>
        </span>
        <div className="grid gap-2 shrink-0">
          <a href="tel:112" className="bb-sos-btn">112 anrufen</a>
          <button type="button" onClick={shareLocation} className="bb-sos-btn is-outline">Position teilen</button>
        </div>
      </div>

      <button type="button" onClick={endTrip} disabled={ending} className="bb-secondary justify-center text-red-200">
        {ending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Flag size={18} aria-hidden="true" />} Angeln beenden
      </button>

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
            {summary.insights && summary.insights.length > 0 ? (
              <ul className="mt-4 space-y-1.5 text-left">
                {summary.insights.map((ins) => (
                  <li key={ins.id} className="text-sm text-slate-200 leading-relaxed">{ins.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                {summary.catches ? 'Schau dir deine Fänge im Fangbuch an und werte den Tag aus.' : 'Kein Fang erfasst? Kein Problem — die Bedingungen fließen in künftige Empfehlungen ein.'}
              </p>
            )}
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

function BiteRing({ value }) {
  const size = 86;
  const r = 34;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 55 ? 'var(--bb-green)' : v >= 40 ? 'var(--bb-cyan)' : 'var(--bb-orange)';
  return (
    <span className="bb-angler-ring">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
        {value != null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <strong>{value == null ? '–' : `${v}%`}</strong>
    </span>
  );
}
