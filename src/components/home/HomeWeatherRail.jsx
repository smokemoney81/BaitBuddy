import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, ChevronDown, LocateFixed } from 'lucide-react';
import { useLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { weatherDescription } from '@/lib/fishingConditions';
import { ownLocationName, placeCacheKey, reverseGeocode } from '@/lib/placeName';
import WeatherGlyph from '@/components/home/WeatherGlyph';

// Kurzform des Wochentags ohne Punkt („Di" statt „Di."), wie in der Vorlage.
export function weekdayLabel(unixSeconds, index, timezone) {
  if (index === 0) return 'Heute';
  try {
    return new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: timezone || undefined })
      .format(new Date(unixSeconds * 1000))
      .replace(/\.$/, '');
  } catch {
    return new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(new Date(unixSeconds * 1000)).replace(/\.$/, '');
  }
}

/** Tageswerte aus der Open-Meteo-Antwort (max. 7 Tage, nur vollständige). */
export function forecastDays(daily, timezone) {
  if (!Array.isArray(daily?.time)) return [];
  return daily.time.slice(0, 7).map((time, i) => ({
    time,
    label: weekdayLabel(time, i, timezone),
    code: daily.weather_code?.[i],
    high: daily.temperature_2m_max?.[i],
    low: daily.temperature_2m_min?.[i],
  })).filter(day => Number.isFinite(day.high) && Number.isFinite(day.low));
}

// Linke Wetterspalte der Startseite: Ort, aktuelles Wetter, 7 Tage an einer
// gepunkteten Zeitleiste. Daten: Open-Meteo über useFishingConditions (derselbe
// Cache wie Wetter-Seite und Bissprognose), Ortsname per Reverse-Geocoding.
export default function HomeWeatherRail({ onMore }) {
  const { currentLocation, requestGpsLocation, loading: locating } = useLocation();
  const lat = currentLocation?.lat;
  const lon = currentLocation?.lon;
  const conditions = useFishingConditions(lat, lon);
  const ownName = ownLocationName(currentLocation);
  const place = useQuery({
    queryKey: ['place-name', conditions.hasLocation ? placeCacheKey(lat, lon) : null],
    enabled: conditions.hasLocation && !ownName,
    queryFn: ({ signal }) => reverseGeocode(lat, lon, { signal }),
    staleTime: Infinity,
    retry: 1,
  });

  const current = conditions.data?.current;
  const timezone = conditions.data?.timezone;
  const days = forecastDays(conditions.data?.daily, timezone);
  const placeName = ownName || place.data?.place || (conditions.hasLocation ? 'Dein Standort' : null);
  const night = current?.is_day === 0;

  return (
    <aside className="bb-home-rail" aria-label="Wetter">
      {conditions.hasLocation ? (
        <p className="bb-home-rail-place">
          <MapPin size={15} aria-hidden="true" />
          <span>{placeName}</span>
        </p>
      ) : (
        <button type="button" className="bb-home-rail-locate" onClick={requestGpsLocation} disabled={locating}>
          <LocateFixed size={18} aria-hidden="true" />
          <span>{locating ? 'Suche …' : 'Standort'}</span>
        </button>
      )}

      {current && Number.isFinite(current.temperature_2m) ? (
        <Link
          to="/Weather"
          className="bb-home-rail-now"
          aria-label={`Jetzt ${Math.round(current.temperature_2m)} Grad, ${weatherDescription(current.weather_code)}. Wetter öffnen`}
        >
          <WeatherGlyph code={current.weather_code} night={night} size={46} />
          <strong>{Math.round(current.temperature_2m)}°</strong>
        </Link>
      ) : conditions.hasLocation && conditions.isLoading ? (
        <div className="bb-home-rail-skeleton" role="status" aria-label="Wetter wird geladen" />
      ) : conditions.hasLocation && conditions.isError ? (
        <button type="button" className="bb-home-rail-retry" onClick={() => conditions.refetch()}>
          Wetter neu laden
        </button>
      ) : null}

      {days.length > 0 && (
        <ol className="bb-home-rail-days" aria-label="Vorhersage für sieben Tage">
          {days.map(day => (
            <li key={day.time}>
              <Link
                to="/Weather"
                aria-label={`${day.label}: ${weatherDescription(day.code)}, höchstens ${Math.round(day.high)}, mindestens ${Math.round(day.low)} Grad`}
              >
                <span className="bb-home-rail-day">{day.label}</span>
                <WeatherGlyph code={day.code} size={30} />
                <span className="bb-home-rail-temp">{Math.round(day.high)}° / {Math.round(day.low)}°</span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className="bb-home-rail-more" onClick={onMore} aria-label="Zur Übersicht">
        <ChevronDown size={22} aria-hidden="true" />
      </button>
    </aside>
  );
}
