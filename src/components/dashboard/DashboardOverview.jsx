import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Brain, Map, CloudSun, BookOpen, MapPin, Wind, Gauge, Droplets, Backpack, CalendarDays } from 'lucide-react';
import { entities } from '@/api/frontendClient';
import { useLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { formatForecastTime, weatherDescription } from '@/lib/fishingConditions';
import BuddyCard from '@/components/buddy/BuddyCard';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

function DataError({ onRetry, children }) {
  return (
    <div role="alert" className="bb-muted py-3">
      <p>{children}</p>
      <button className="bb-secondary mt-2" type="button" onClick={onRetry}>Erneut versuchen</button>
    </div>
  );
}

function BiteIndexRing({ value, size = 100 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value || 0));
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 70 ? 'var(--bb-green)' : clamped >= 40 ? 'var(--bb-cyan)' : 'var(--bb-orange)';

  return (
    <div className="bb-bite-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="8"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="bb-bite-ring-value">
        <strong style={{ color, fontSize: size > 80 ? 22 : 18 }}>{clamped}</strong>
        <span>/100</span>
      </div>
    </div>
  );
}

export default function DashboardOverview({ user, nearestSpots = [], nextTrip = null, tripsError = false, onRetryTrips }) {
  const { currentLocation, requestGpsLocation } = useLocation();
  const conditions = useFishingConditions(currentLocation?.lat, currentLocation?.lon);

  const gear = useQuery({
    queryKey: ['dashboard-gear-v2', user?.id],
    enabled: !!user,
    queryFn: () => entities.GearItem.list(),
    staleTime: 60000,
  });

  const tripTitle = nextTrip?.name || nextTrip?.title || null;
  const tripDate = nextTrip?.start_date || nextTrip?.planned_date || null;
  const gearItems = Array.isArray(gear.data) ? gear.data : [];
  const hours = conditions.hours.filter(row => row.time >= Date.now() - 3600000).slice(0, 12);
  const nextWindow = conditions.window;
  const timezone = conditions.data?.timezone;
  const weather = conditions.data?.current;
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const name = user?.nickname || user?.full_name?.split(' ')[0];

  const upcoming = tripTitle && tripDate
    ? `Dein naechster Trip: ${tripTitle}, ${new Date(tripDate).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Lass uns deine Vorbereitung pruefen.`
    : nextWindow
      ? `Das guenstigste Wetterfenster der naechsten 24 Stunden liegt bei ${formatForecastTime(nextWindow.start, timezone, true)}. Lass uns einen passenden Spot und deine Ausruestung dazu finden.`
      : 'Wo, wann und womit moechtest du angeln? Ich helfe dir, deinen naechsten Ausflug vorzubereiten.';

  return (
    <>
      <OnboardingFlow />

      {/* Hero greeting */}
      <header className="bb-dash-hero">
        <div className="bb-dash-hero-text">
          <p className="bb-eyebrow mb-1">Dein Tag am Wasser</p>
          <h1 className="bb-dash-greeting">
            {greeting}{name ? `, ${name}` : ''}.
          </h1>
          <p className="bb-muted mt-1">Ein guter Ausflug beginnt mit einem guten Plan.</p>
        </div>
      </header>

      {/* Weather + Bite Index hero card */}
      <section className="bb-card bb-hero" aria-label="Wetter und Bissprognose">
        <img src="/assets/buddy/lake-hero.png" alt="" className="bb-hero-image" fetchPriority="high" />
        <div className="flex items-center gap-2 text-xs text-cyan-100 mb-5">
          <MapPin size={14} />
          {currentLocation?.name || (conditions.hasLocation ? 'An deinem Standort' : 'Bereit fuer neue Gewaesser')}
        </div>

        <div className="bb-dash-weather-row">
          <div className="bb-dash-weather-info">
            {weather && (
              <>
                <div className="flex items-center gap-3">
                  <CloudSun className="text-cyan-200" size={30} />
                  <div>
                    <strong className="text-xl">{Math.round(weather.temperature_2m)} °C</strong>
                    <p className="text-xs text-slate-300">{weatherDescription(weather.weather_code)}</p>
                  </div>
                </div>
                <div className="bb-dash-weather-stats">
                  <span><Wind size={14} />{Math.round(weather.wind_speed_10m)} km/h</span>
                  <span><Gauge size={14} />{Math.round(weather.pressure_msl)} hPa</span>
                  <span><Droplets size={14} />{weather.precipitation} mm</span>
                </div>
              </>
            )}
            {conditions.isLoading && <p className="text-sm text-slate-300" role="status">Bedingungen werden geladen ...</p>}
          </div>

          {nextWindow && (
            <div className="bb-dash-bite-section">
              <BiteIndexRing value={nextWindow.index} size={88} />
              <p className="text-xs text-slate-400 mt-1 text-center">Biss-Index</p>
            </div>
          )}
        </div>

        <Link className="bb-action self-start mt-4" to="/TripPlanner?new=1">
          Ausflug planen <ArrowRight size={18} />
        </Link>
      </section>

      {/* Buddy card */}
      <BuddyCard
        message={upcoming}
        question={tripTitle
          ? `Hilf mir mit Wetter und Ausruestung fuer meinen naechsten Trip ${tripTitle}.`
          : 'Welche Spots, Wetterbedingungen und Ausruestung passen zu meinem naechsten Angelausflug?'
        }
      />

      {/* Quick access grid */}
      <nav className="bb-quick-grid" aria-label="Dashboard-Schnellzugriffe">
        {[
          [Brain, 'KI-Buddy', 'KiBuddyBeta'],
          [Map, 'Karte', 'Map'],
          [CloudSun, 'Wetter', 'Weather'],
          [BookOpen, 'Fangbuch', 'Logbook'],
        ].map(([Icon, label, path]) => (
          <Link key={path} to={`/${path}`}>
            <Icon size={25} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Two-column layout */}
      <div className="bb-dashboard-columns">
        {/* Weather detail */}
        <section className="bb-card space-y-5">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Wetter & Bissprognose</h2>
            <Link to="/Weather" className="bb-secondary" aria-label="Alle Wetterdaten"><ArrowRight size={18} /></Link>
          </div>

          {!conditions.hasLocation && (
            <div>
              <p className="bb-muted">Waehle deinen Standort fuer Wetter und Zeitfenster.</p>
              <button type="button" onClick={requestGpsLocation} className="bb-secondary mt-3">
                <MapPin size={18} />Standort verwenden
              </button>
            </div>
          )}
          {conditions.isError && <DataError onRetry={conditions.refetch}>Wetterdaten konnten gerade nicht geladen werden.</DataError>}
          {conditions.isLoading && <div className="h-36 rounded-xl bg-slate-800 animate-pulse" role="status" aria-label="Wetter wird geladen" />}
          {weather && (
            <>
              <div className="bb-stat-grid">
                {[
                  [Wind, 'Wind', `${Math.round(weather.wind_speed_10m)} km/h`],
                  [Gauge, 'Luftdruck', `${Math.round(weather.pressure_msl)} hPa`],
                  [Droplets, 'Niederschlag', `${weather.precipitation} mm`],
                  [CloudSun, 'Temperatur', `${Math.round(weather.temperature_2m)} °C`],
                ].map(([Icon, label, value]) => (
                  <div key={label}>
                    <span className="text-xs text-slate-400 flex gap-2 items-center"><Icon size={14} />{label}</span>
                    <strong className="block mt-2 text-lg">{value}</strong>
                  </div>
                ))}
              </div>
              <div className="h-36 w-full min-w-0" role="img" aria-label="Stuendlicher Verlauf des modellierten Biss-Index">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hours}>
                    <XAxis
                      dataKey="time"
                      tickFormatter={time => formatForecastTime(time, timezone)}
                      minTickGap={35}
                      tick={{ fill: '#9caec3', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={time => formatForecastTime(time, timezone)}
                      contentStyle={{ background: '#102238', border: 0, borderRadius: 12, color: '#fff' }}
                    />
                    <Area
                      name="Biss-Index (Modell)"
                      dataKey="index"
                      type="monotone"
                      stroke="#22d3ee"
                      fill="#22d3ee"
                      fillOpacity={.12}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {nextWindow && (
                <p className="text-sm text-cyan-200">
                  Wetterfenster: {formatForecastTime(nextWindow.start, timezone, true)} – {formatForecastTime(nextWindow.end, timezone)}
                </p>
              )}
              <p className="text-xs text-slate-400 leading-relaxed">
                Orientierung aus Temperatur, Wind, Regen, Bewoelkung und Luftdruck. Keine gemessene Fangwahrscheinlichkeit. Zielfisch, Gewaesser und Schonzeiten separat pruefen.
              </p>
            </>
          )}
        </section>

        <div className="grid gap-5">
          {/* Spots */}
          <section className="bb-card">
            <h2 className="text-lg font-semibold mb-4">Deine Top-Spots</h2>
            <p className="text-xs text-slate-400 mb-3">Deine meistbefischten Spots der letzten 30 Tage.</p>
            {nearestSpots.length ? (
              nearestSpots.map(spot => (
                <Link to={`/Map?spot=${encodeURIComponent(spot.id)}`} className="bb-spot-row" key={spot.id}>
                  <div className="bb-spot-icon"><MapPin size={21} /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{spot.name}</h3>
                    <p className="text-xs text-slate-400">
                      {[
                        spot.water_type,
                        spot.usage_count ? `${spot.usage_count} ${spot.usage_count === 1 ? 'Fang' : 'Fänge'}` : null,
                        spot.distance != null ? `${spot.distance.toFixed(1)} km` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              ))
            ) : (
              <p className="bb-muted">
                Noch keine Fänge an gespeicherten Spots in den letzten 30 Tagen. Entdecke Gewaesser auf der Karte und ordne deine Fänge einem Spot zu.
              </p>
            )}
            <Link to="/Map" className="bb-secondary mt-3">Karte entdecken <ArrowRight size={16} /></Link>
          </section>

          {/* Gear */}
          <section className="bb-card">
            <div className="flex items-center gap-3 mb-3">
              <Backpack className="text-cyan-300" />
              <h2 className="text-lg font-semibold">Meine Ausruestung</h2>
            </div>
            {gear.isError ? (
              <DataError onRetry={gear.refetch}>Ausruestung konnte nicht geladen werden.</DataError>
            ) : gear.isLoading ? (
              <p role="status" className="bb-muted">Ausruestung wird geladen ...</p>
            ) : (
              <>
                <p className="bb-muted">
                  {gearItems.length
                    ? `${gearItems.length} Gegenstaende hinterlegt. Stelle daraus die Packliste fuer deinen naechsten Ausflug zusammen.`
                    : 'Noch keine Ausruestung hinterlegt.'}
                </p>
                <Link to="/Gear" className="bb-secondary mt-3">
                  {gearItems.length ? 'Ausruestung verwalten' : 'Ausruestung hinzufuegen'}
                  <ArrowRight size={16} />
                </Link>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Next trip link */}
      {tripsError ? (
        <DataError onRetry={onRetryTrips}>Deine Trips konnten nicht geladen werden.</DataError>
      ) : (
        <Link to="/TripPlanner" className="bb-card flex gap-4 items-center">
          <CalendarDays className="text-cyan-300" />
          <div className="flex-1">
            <h2 className="font-semibold">{tripTitle || 'Noch kein Angelausflug geplant'}</h2>
            <p className="bb-muted">
              {tripDate ? new Date(tripDate).toLocaleString('de-DE') : 'Plane deinen ersten Ausflug mit deinem Buddy.'}
            </p>
          </div>
          <ArrowRight size={18} />
        </Link>
      )}
    </>
  );
}
