import React, { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUp, ArrowDown, Brain, Map, CloudSun, BookOpen, MapPin, Wind, Gauge, Droplets, Backpack, CalendarDays, ChevronRight, Eye } from 'lucide-react';
import { entities } from '@/api/frontendClient';
import { useLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { formatForecastTime, weatherDescription } from '@/lib/fishingConditions';
import BuddyCard from '@/components/buddy/BuddyCard';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

const DashboardMapPreview = lazy(() => import('@/components/dashboard/DashboardMapPreview'));

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
  const color = clamped >= 55 ? 'var(--bb-green)' : clamped >= 40 ? 'var(--bb-cyan)' : 'var(--bb-orange)';

  return (
    <div className="bb-bite-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="bb-bite-ring-value">
        <strong style={{ fontSize: size > 100 ? 30 : size > 80 ? 22 : 18 }}>{clamped}%</strong>
      </div>
    </div>
  );
}

function currentHourIndex(hours) {
  const now = Date.now();
  const row = hours.find(entry => entry.time <= now && now < entry.time + 3600000);
  if (!row || row.index == null) return null;
  const next = hours.find(entry => entry.time === row.time + 3600000);
  return { value: row.index, rising: next?.index != null ? next.index > row.index : null };
}

function biteLabel(value) {
  if (value >= 70) return 'Sehr gut';
  if (value >= 55) return 'Gut';
  if (value >= 40) return 'Mittel';
  return 'Schwach';
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
  const spots = useQuery({
    queryKey: ['dashboard-map-spots', user?.id],
    enabled: !!user,
    queryFn: () => entities.Spot.list(),
    staleTime: 5 * 60000,
  });

  const tripTitle = nextTrip?.name || nextTrip?.title || null;
  const tripDate = nextTrip?.start_date || nextTrip?.planned_date || null;
  const gearItems = Array.isArray(gear.data) ? gear.data : [];
  const mapSpots = Array.isArray(spots.data) ? spots.data : [];
  const hours = conditions.hours.filter(row => row.time >= Date.now() - 3600000).slice(0, 12);
  const nextWindow = conditions.window;
  const timezone = conditions.data?.timezone;
  const weather = conditions.data?.current;
  const bite = currentHourIndex(conditions.hours);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const name = user?.nickname || user?.full_name?.split(' ')[0];
  const topSpot = nearestSpots[0] || null;
  const locationName = currentLocation?.name || (conditions.hasLocation ? 'Dein Standort' : null);

  const upcoming = tripTitle && tripDate
    ? `Dein naechster Trip: ${tripTitle}, ${new Date(tripDate).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Lass uns deine Vorbereitung pruefen.`
    : nextWindow
      ? `Das guenstigste Wetterfenster der naechsten 24 Stunden liegt bei ${formatForecastTime(nextWindow.start, timezone, true)}. Lass uns einen passenden Spot und deine Ausruestung dazu finden.`
      : 'Wo, wann und womit moechtest du angeln? Ich helfe dir, deinen naechsten Ausflug vorzubereiten.';

  return (
    <>
      <OnboardingFlow />

      {/* Begruessung + Wetter-Chip */}
      <header className="bb-dash-greet-row">
        <div className="min-w-0">
          <h1 className="bb-dash-greeting">{greeting}{name ? `, ${name}` : ''}!</h1>
          <p className="bb-dash-greet-sub">Bereit für dein nächstes Abenteuer?</p>
        </div>
        {weather ? (
          <Link to="/Weather" className="bb-weather-chip" aria-label="Wetter öffnen">
            <CloudSun size={34} aria-hidden="true" className="bb-weather-icon" />
            <span>
              <strong>{Math.round(weather.temperature_2m)}°C</strong>
              {locationName && <span className="bb-weather-chip-loc">{locationName}</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" className="bb-title-accent" />
          </Link>
        ) : !conditions.hasLocation ? (
          <button type="button" onClick={requestGpsLocation} className="bb-weather-chip">
            <MapPin size={22} aria-hidden="true" className="bb-title-accent" />
            <span className="text-sm">Standort<br />verwenden</span>
          </button>
        ) : null}
      </header>

      {/* Vier Schnellzugriffe */}
      <nav className="bb-quick-grid" aria-label="Dashboard-Schnellzugriffe">
        {[
          [Map, 'Karte', 'Map'],
          [Eye, 'Gewässer', 'WaterAnalysis'],
          [Brain, 'KI-Buddy', 'KiBuddyBeta'],
          [BookOpen, 'Fangbuch', 'Logbook'],
        ].map(([Icon, label, path]) => (
          <Link key={path} to={`/${path}`}>
            <Icon size={28} strokeWidth={1.7} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Wetter vor Ort + Bissindex */}
      <div className="bb-dash-conditions">
        <section className="bb-card bb-dash-weather" aria-label="Wetter vor Ort">
          <h2 className="bb-dash-card-label">Wetter vor Ort</h2>
          {weather ? (
            <>
              <div className="bb-dash-weather-main">
                <CloudSun size={52} aria-hidden="true" className="bb-weather-icon" />
                <div>
                  <strong className="bb-dash-temp">{Math.round(weather.temperature_2m)}°C</strong>
                  <p className="bb-dash-weather-desc">{weatherDescription(weather.weather_code)}</p>
                </div>
              </div>
              <dl className="bb-dash-weather-stats">
                <div><dt><Wind size={14} aria-hidden="true" />Wind</dt><dd>{Math.round(weather.wind_speed_10m)} km/h</dd></div>
                <div><dt><Gauge size={14} aria-hidden="true" />Luftdruck</dt><dd>{Math.round(weather.pressure_msl)} hPa</dd></div>
                <div><dt><Droplets size={14} aria-hidden="true" />Luftfeuchte</dt><dd>{weather.relative_humidity_2m != null ? `${Math.round(weather.relative_humidity_2m)}%` : '–'}</dd></div>
              </dl>
            </>
          ) : conditions.isLoading ? (
            <div className="h-24 rounded-xl bg-slate-800/60 animate-pulse mt-3" role="status" aria-label="Wetter wird geladen" />
          ) : conditions.isError ? (
            <DataError onRetry={conditions.refetch}>Wetterdaten konnten gerade nicht geladen werden.</DataError>
          ) : (
            <div className="mt-3">
              <p className="bb-muted">Wähle deinen Standort für Wetter und Bissindex.</p>
              <button type="button" onClick={requestGpsLocation} className="bb-secondary mt-3">
                <MapPin size={18} aria-hidden="true" />Standort verwenden
              </button>
            </div>
          )}
        </section>

        <Link to="/Weather" className="bb-card bb-dash-bite" aria-label={bite ? `Bissindex ${bite.value} Prozent, ${biteLabel(bite.value)}` : 'Bissindex'}>
          <span className="bb-dash-card-label">Bissindex</span>
          {bite ? (
            <>
              <BiteIndexRing value={bite.value} size={112} />
              <span className="bb-dash-bite-label" style={{ color: bite.value >= 55 ? 'var(--bb-green)' : bite.value >= 40 ? 'var(--bb-cyan)' : 'var(--bb-orange)' }}>
                {biteLabel(bite.value)}
                {bite.rising === true && <ArrowUp size={16} aria-hidden="true" />}
                {bite.rising === false && <ArrowDown size={16} aria-hidden="true" />}
              </span>
            </>
          ) : (
            <span className="bb-muted text-center text-sm mt-4">{conditions.isLoading ? 'Wird berechnet …' : 'Standort nötig'}</span>
          )}
        </Link>
      </div>

      {/* Karte mit Spots */}
      <section className="bb-card bb-dash-map-card" aria-label="Karte">
        <Suspense fallback={<div className="bb-dash-map animate-pulse" />}>
          <DashboardMapPreview location={currentLocation} spots={mapSpots} />
        </Suspense>
      </section>

      {/* Top-Spot */}
      {topSpot ? (
        <Link to={`/Map?spot=${encodeURIComponent(topSpot.id)}`} className="bb-card bb-dash-row">
          <span className="bb-dash-row-media"><MapPin size={30} aria-hidden="true" /></span>
          <span className="flex-1 min-w-0">
            <span className="bb-dash-row-label">Top-Spot</span>
            <strong className="bb-dash-row-title">{topSpot.name}</strong>
            <span className="bb-dash-row-meta">
              {[
                topSpot.water_type,
                topSpot.usage_count ? `${topSpot.usage_count} ${topSpot.usage_count === 1 ? 'Fang' : 'Fänge'} in 30 Tagen` : null,
                topSpot.distance != null ? `${topSpot.distance.toFixed(1)} km` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          </span>
          <ChevronRight size={22} aria-hidden="true" />
        </Link>
      ) : (
        <Link to="/Map" className="bb-card bb-dash-row">
          <span className="bb-dash-row-media"><MapPin size={30} aria-hidden="true" /></span>
          <span className="flex-1 min-w-0">
            <span className="bb-dash-row-label">Top-Spot</span>
            <strong className="bb-dash-row-title">Noch kein Top-Spot</strong>
            <span className="bb-dash-row-meta">Ordne deine Fänge einem Spot zu – dein bester erscheint hier.</span>
          </span>
          <ChevronRight size={22} aria-hidden="true" />
        </Link>
      )}

      {/* Naechster Ausflug */}
      {tripsError && user ? (
        <DataError onRetry={onRetryTrips}>Deine Trips konnten nicht geladen werden.</DataError>
      ) : (
        <section className="bb-card bb-dash-row" aria-label="Nächster Ausflug">
          <CalendarDays size={30} aria-hidden="true" className="bb-title-accent shrink-0" />
          <span className="flex-1 min-w-0">
            <strong className="bb-dash-row-title">{tripTitle || 'Nächster Ausflug'}</strong>
            <span className="bb-dash-row-meta">
              {tripDate
                ? new Date(tripDate).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
                : 'Noch nichts geplant'}
            </span>
          </span>
          <Link to={tripTitle ? '/TripPlanner' : '/TripPlanner?new=1'} className="bb-dash-plan-btn">
            Planen <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      )}

      {/* Buddy card */}
      <BuddyCard
        message={upcoming}
        question={tripTitle
          ? `Hilf mir mit Wetter und Ausruestung fuer meinen naechsten Trip ${tripTitle}.`
          : 'Welche Spots, Wetterbedingungen und Ausruestung passen zu meinem naechsten Angelausflug?'
        }
      />

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

    </>
  );
}
