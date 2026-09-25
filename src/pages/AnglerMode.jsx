import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Fish, MapPin, Camera, BookOpen, Compass, Loader2, Flag, Wind, Sun, Moon, CloudSun, CloudMoon,
  Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, ChevronRight, ChevronLeft, ArrowUp,
  MessageCircle, Mic, Radio, Map as MapIcon, Activity, LifeBuoy, Settings, Crosshair, Phone, Share2,
} from 'lucide-react';
import { useLocation as useGeoLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { formatForecastTime } from '@/lib/fishingConditions';
import { fishImageFor } from '@/lib/fishImages';
import { FishingPlan } from '@/entities/FishingPlan';
import { Catch } from '@/entities/Catch';
import { selectNextTrip, readPlanSpot } from '@/lib/tripJourney';
import { formatElapsed, elapsedSeconds, timeOfDayTheme, readTripStart as readStart, writeTripStart as writeStart, clearTripStart as clearStart, beaufort, compassDirection, fishingMoment, weatherKind } from '@/lib/anglerMode';
import { recordTripEvent, tripEventsSince, distanceMeters, bearingWord, MOVE_THRESHOLD_M, TRIP_EVENT } from '@/lib/tripLog';
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
  const [tripEvents, setTripEvents] = useState([]);
  const [sosOpen, setSosOpen] = useState(false);
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

  // Bisse (Bisserkennung) und Standortwechsel seit Trip-Start.
  useEffect(() => {
    if (!startMs) return undefined;
    const load = () => setTripEvents(tripEventsSince(startMs));
    load();
    window.addEventListener(TRIP_EVENT, load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener(TRIP_EVENT, load); window.removeEventListener('storage', load); };
  }, [startMs]);

  // Standortwechsel ab 100 m gegenüber der zuletzt gemerkten Position.
  useEffect(() => {
    if (!plan || !startMs || currentLocation?.lat == null) return;
    const key = `bb_trip_last_pos_${plan.id}`;
    const here = { lat: Number(currentLocation.lat), lon: Number(currentLocation.lon) };
    try {
      const last = JSON.parse(localStorage.getItem(key) || 'null');
      if (!last) { localStorage.setItem(key, JSON.stringify(here)); return; }
      const meters = distanceMeters(last, here);
      if (meters >= MOVE_THRESHOLD_M) {
        recordTripEvent('move', { meters: Math.round(meters), direction: bearingWord(last, here) });
        localStorage.setItem(key, JSON.stringify(here));
      }
    } catch { /* Speicher gesperrt: keine Standort-Einträge */ }
  }, [plan, startMs, currentLocation?.lat, currentLocation?.lon]);

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
    ? { temperature: live.temperature_2m, wind_speed: live.wind_speed_10m, wind_direction: live.wind_direction_10m, code: live.weather_code }
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
    try { localStorage.removeItem(`bb_trip_last_pos_${plan.id}`); } catch { /* ignore */ }
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
      <div className="bb-page bb-angler">
        <AnglerHeader onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/Dashboard'))} />
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
  const bait = plan.details?.bait || '';
  const method = plan.details?.method || '';
  const isNight = theme.key === 'night';
  const kind = weatherKind(weather?.code, isNight || theme.key === 'dusk');
  const WeatherIcon = WEATHER_ICONS[kind] || (isNight ? CloudMoon : CloudSun);
  const bft = beaufort(weather?.wind_speed);
  const windDir = compassDirection(weather?.wind_direction);
  const biteLabel = biteIndex == null ? 'Standort nötig' : biteIndex >= 70 ? 'Sehr gut' : biteIndex >= 55 ? 'Gut' : biteIndex >= 40 ? 'Mittel' : 'Schwach';

  const timeline = [
    ...tripEvents.map((e, i) => (e.type === 'bite' ? {
      id: `b-${e.at}-${i}`, time: e.at, tone: 'orange', icon: Activity, title: 'Biss erkannt!',
      text: `${e.strength >= 2 ? 'Deutlicher Biss' : 'Leichter Zupfer'} – ${e.source || 'Bisserkennung'}`, to: '/AI',
    } : {
      id: `m-${e.at}-${i}`, time: e.at, tone: 'cyan', icon: MapPin, title: 'Standort gewechselt',
      text: `Neuer Spot: ${e.meters} m ${e.direction || ''}`.trim(), to: '/Map',
    })),
    ...tripCatches.map(c => ({
      id: `c-${c.id}`,
      time: new Date(c.catch_time || c.created_at).getTime(),
      tone: 'green',
      image: c.photo_url || fishImageFor(c.species),
      icon: Fish,
      title: 'Fang erfasst',
      text: [c.species, c.length_cm ? `${c.length_cm} cm` : null, c.bait_used || c.bait].filter(Boolean).join(' · '),
      to: '/Logbook',
    })),
    { id: 'start', time: startMs, tone: 'grey', icon: Flag, title: 'Trip gestartet', text: spot.name || plan.title || '', to: '/TripPlanner' },
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
      <AnglerHeader
        onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/Dashboard'))}
        status={<span className="bb-angler-status"><i aria-hidden="true" />Trip aktiv</span>}
      />

      <div className="bb-angler-hero">
        <div className="bb-angler-clock">
          {isNight ? <Moon size={34} aria-hidden="true" className="bb-angler-clock-icon" /> : <Sun size={34} aria-hidden="true" className="bb-angler-clock-icon" />}
          <span>
            <small>{new Date(nowTick).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</small>
            <strong>{new Date(nowTick).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</strong>
            <small>{fishingMoment(biteIndex)}</small>
          </span>
        </div>
        <p className="bb-script bb-angler-quote" aria-hidden="true">„Gute Fänge beginnen mit schönen Momenten.“</p>
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
          <WeatherIcon size={40} aria-hidden="true" className="bb-weather-icon" />
          <strong className="bb-angler-temp">{weather?.temperature != null ? `${Math.round(weather.temperature)}°C` : '–'}</strong>
          <small><Wind size={14} aria-hidden="true" />{bft != null ? `Wind ${bft} Bft${windDir ? ` (${windDir})` : ''}` : 'kein Wert'}</small>
        </Link>
        <Link to="/Weather" className="bb-angler-tile">
          <span className="bb-angler-tile-label">Bissindex</span>
          <BiteRing value={biteIndex} />
          <small className={biteIndex != null && biteIndex >= 55 ? 'text-[var(--bb-green)]' : ''}>
            {biteIndex != null && biteIndex >= 55 && <ArrowUp size={14} aria-hidden="true" />}{biteLabel}
          </small>
        </Link>
        <div className="bb-angler-tile">
          <span className="bb-angler-tile-label">Zielfisch</span>
          {fishImage ? <img src={fishImage} alt="" className="bb-angler-fish" /> : <Fish size={34} aria-hidden="true" className="text-cyan-300" />}
          <strong>{plan.target_fish || 'Offen'}</strong>
          {bestWindow && (
            <small className="bb-angler-best"><Crosshair size={13} aria-hidden="true" />Beste Zeit: {formatForecastTime(bestWindow.start, conditions.data?.timezone)}–{formatForecastTime(bestWindow.end, conditions.data?.timezone)}</small>
          )}
        </div>
        <Link to="/TripPlanner" className="bb-angler-tile">
          <span className="bb-angler-tile-label">Aktueller Köder</span>
          <LureGlyph />
          <strong>{bait || 'Nicht geplant'}</strong>
          {method && <small>{method}</small>}
          <ChevronRight size={16} aria-hidden="true" className="bb-angler-tile-chevron" />
        </Link>
      </div>

      <div className="bb-angler-actions">
        <Link to="/HandsFreeBuddy" className="bb-angler-action"><MessageCircle size={26} aria-hidden="true" /><span><strong>Hey Buddy</strong><small>Frag mich alles</small></span></Link>
        <Link to="/VoiceChat" className="bb-angler-action"><Mic size={26} aria-hidden="true" /><span><strong>Voice</strong><small>Sprachmodus</small></span></Link>
        <Link to="/AI" className="bb-angler-action is-green"><Radio size={26} aria-hidden="true" /><span><strong>Biss&shy;erkennung</strong><small>Kamera starten</small></span></Link>
      </div>
      <div className="bb-angler-actions is-two">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('openCatchDialog'))} className="bb-angler-action">
          <Camera size={28} aria-hidden="true" /><span><strong>Fang erfassen</strong><small>Foto · Größe · Köder</small></span>
        </button>
        <Link to="/Map" className="bb-angler-action"><MapIcon size={28} aria-hidden="true" /><span><strong>Karte öffnen</strong><small>Aktuellen Spot anzeigen</small></span><ChevronRight size={20} aria-hidden="true" className="ml-auto shrink-0" /></Link>
      </div>

      <section className="bb-card bb-angler-timeline-card" aria-labelledby="timeline-title">
        <div className="bb-section-head">
          <h2 id="timeline-title" className="bb-section-title"><Activity size={22} aria-hidden="true" />Live-Timeline</h2>
          <Link to="/Logbook" className="bb-angler-all">Alle anzeigen <ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <ol className="bb-angler-timeline">
          {timeline.map(entry => {
            const Icon = entry.icon;
            return (
              <li key={entry.id} className={`is-${entry.tone}`}>
                <span className="bb-angler-tl-dot" aria-hidden="true" />
                <span className="bb-angler-tl-time">{new Date(entry.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                <Link to={entry.to} className="bb-angler-tl-row">
                  <span className="bb-angler-tl-icon">{entry.image ? <img src={entry.image} alt="" /> : <Icon size={22} aria-hidden="true" />}</span>
                  <span className="min-w-0 flex-1"><strong>{entry.title}</strong>{entry.text && <small>{entry.text}</small>}</span>
                  <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-slate-400" />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <div className={`bb-card bb-card-danger bb-angler-sos${sosOpen ? ' is-open' : ''}`}>
        <button type="button" className="bb-angler-sos-bar" onClick={() => setSosOpen(v => !v)} aria-expanded={sosOpen}>
          <LifeBuoy size={44} aria-hidden="true" className="bb-angler-sos-ring" />
          <span className="bb-angler-sos-word">SOS</span>
          <span className="flex-1 min-w-0 text-center">
            <strong>Notfall / Hilfe rufen</strong>
            <small>Position an Kontakte senden</small>
          </span>
          <ChevronRight size={24} aria-hidden="true" className="bb-angler-sos-chevron" />
        </button>
        {sosOpen && (
          <div className="bb-angler-sos-actions">
            <a href="tel:112" className="bb-sos-btn"><Phone size={18} aria-hidden="true" /> 112 anrufen</a>
            <button type="button" onClick={shareLocation} className="bb-sos-btn is-outline"><Share2 size={18} aria-hidden="true" /> Position teilen</button>
          </div>
        )}
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

const WEATHER_ICONS = {
  clear: Sun, 'clear-night': Moon, partly: CloudSun, 'partly-night': CloudMoon, cloudy: Cloud,
  fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

function AnglerHeader({ onBack, status = null }) {
  return (
    <header className="bb-angler-head">
      <button type="button" className="bb-round-btn" onClick={onBack} aria-label="Zurück"><ChevronLeft size={24} aria-hidden="true" /></button>
      <div className="min-w-0 text-center">
        <h1 className="bb-angler-title">Anglermodus</h1>
        {status}
      </div>
      <Link to="/Settings?tab=fishing" className="bb-round-btn" aria-label="Angel-Einstellungen"><Settings size={22} aria-hidden="true" /></Link>
    </header>
  );
}

// Stilisierter Gummifisch (Shad) für die Köder-Kachel — reine Illustration.
function LureGlyph() {
  return (
    <svg viewBox="0 0 120 40" width="80" height="27" aria-hidden="true" className="bb-angler-lure">
      <defs>
        <linearGradient id="bb-lure" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9e36a" />
          <stop offset="55%" stopColor="#6fae3a" />
          <stop offset="100%" stopColor="#2f5d2a" />
        </linearGradient>
      </defs>
      <path d="M8 20 C14 8 44 6 70 12 C84 15 92 16 98 14 L114 4 Q118 20 114 36 L98 26 C92 24 84 25 70 28 C44 34 14 32 8 20 Z" fill="url(#bb-lure)" />
      <circle cx="18" cy="18" r="3" fill="#10202c" />
      <path d="M30 14 C44 12 58 13 72 16" stroke="#f3f7a0" strokeWidth="1.5" fill="none" opacity=".7" />
    </svg>
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
