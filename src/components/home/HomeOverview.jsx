import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUp, ArrowDown, CalendarDays, MapPin, Backpack, Gauge, ShieldCheck, ChevronRight, Users, LocateFixed,
} from 'lucide-react';
import { entities } from '@/api/frontendClient';
import { useLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { biteLabel, currentBiteIndex, formatForecastTime } from '@/lib/fishingConditions';
import SuspenseWithErrorBoundary from '@/components/utils/SuspenseWithErrorBoundary';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import SchonzeitWarner from '@/components/dashboard/SchonzeitWarner';
import OfflineCacheIndicator from '@/components/dashboard/OfflineCacheIndicator';
import FishingRecommendationCard from '@/components/dashboard/FishingRecommendationCard';
import BuddyInsightCard from '@/components/dashboard/BuddyInsightCard';
import AudioNotesWidget from '@/components/dashboard/AudioNotesWidget';
import { buddyAskUrl } from '@/components/home/HomePromptChips';

const formatTripDate = value => new Date(value).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

function NextTripTile({ trip, error, onRetry, signedIn }) {
  const title = trip?.name || trip?.title || null;
  const date = trip?.start_date || trip?.planned_date || null;
  const question = title
    ? `Hilf mir mit Wetter und Ausrüstung für meinen nächsten Trip ${title}.`
    : 'Welche Spots, Wetterbedingungen und Ausrüstung passen zu meinem nächsten Angelausflug?';

  return (
    <section className="bb-home-tile" aria-label="Nächster Ausflug">
      <span className="bb-home-tile-label"><CalendarDays size={14} aria-hidden="true" />Nächster Ausflug</span>
      {error && signedIn ? (
        <>
          <p className="bb-home-tile-meta">Trips konnten nicht geladen werden.</p>
          <button type="button" className="bb-home-tile-btn" onClick={onRetry}>Erneut versuchen</button>
        </>
      ) : (
        <>
          <strong className="bb-home-tile-title">{title || 'Noch nichts geplant'}</strong>
          {date && <span className="bb-home-tile-meta">{formatTripDate(date)}</span>}
          <span className="bb-home-tile-actions">
            <Link to={title ? '/TripPlanner' : '/TripPlanner?new=1'} className="bb-home-tile-btn is-primary">Planen</Link>
            <Link to={buddyAskUrl(question)} className="bb-home-tile-link">Mit Buddy</Link>
          </span>
        </>
      )}
    </section>
  );
}

function BiteTile() {
  const { currentLocation, requestGpsLocation, loading: locating } = useLocation();
  const conditions = useFishingConditions(currentLocation?.lat, currentLocation?.lon);
  const bite = currentBiteIndex(conditions.hours);
  const timezone = conditions.data?.timezone;
  const color = bite ? (bite.value >= 55 ? 'var(--bb-green)' : bite.value >= 40 ? 'var(--bb-cyan)' : 'var(--bb-orange)') : undefined;

  if (!conditions.hasLocation) {
    return (
      <section className="bb-home-tile" aria-label="Bissprognose">
        <span className="bb-home-tile-label"><Gauge size={14} aria-hidden="true" />Bissprognose</span>
        <p className="bb-home-tile-meta">Braucht deinen Standort.</p>
        <button type="button" className="bb-home-tile-btn" onClick={requestGpsLocation} disabled={locating}>
          <LocateFixed size={15} aria-hidden="true" />{locating ? 'Suche …' : 'Standort verwenden'}
        </button>
      </section>
    );
  }

  return (
    <Link
      to="/Weather"
      className="bb-home-tile"
      aria-label={bite ? `Bissindex ${bite.value} Prozent, ${biteLabel(bite.value)}. Wetter öffnen` : 'Bissprognose, Wetter öffnen'}
    >
      <span className="bb-home-tile-label"><Gauge size={14} aria-hidden="true" />Bissprognose</span>
      {bite ? (
        <>
          <strong className="bb-home-tile-title bb-home-bite" style={{ color }}>
            {bite.value}%<span>{biteLabel(bite.value)}</span>
            {bite.rising === true && <ArrowUp size={15} aria-hidden="true" />}
            {bite.rising === false && <ArrowDown size={15} aria-hidden="true" />}
          </strong>
          {conditions.window && (
            <span className="bb-home-tile-meta">
              Fenster {formatForecastTime(conditions.window.start, timezone, true)}
            </span>
          )}
        </>
      ) : (
        <span className="bb-home-tile-meta">
          {conditions.isLoading ? 'Wird berechnet …' : conditions.isError ? 'Wetter nicht erreichbar.' : 'Keine Daten für jetzt.'}
        </span>
      )}
    </Link>
  );
}

function TopSpotsTile({ spots }) {
  const top = spots.slice(0, 3);
  return (
    <section className="bb-home-tile" aria-label="Deine Top-Spots">
      <span className="bb-home-tile-label"><MapPin size={14} aria-hidden="true" />Top-Spots · 30 Tage</span>
      {top.length ? (
        <ul className="bb-home-spots">
          {top.map(spot => (
            <li key={spot.id}>
              <Link to={`/Map?spot=${encodeURIComponent(spot.id)}`}>
                <span className="truncate">{spot.name}</span>
                {spot.usage_count ? <small>{spot.usage_count} {spot.usage_count === 1 ? 'Fang' : 'Fänge'}</small> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="bb-home-tile-meta">Noch kein Top-Spot. Ordne Fänge einem Spot zu.</p>
          <Link to="/Map" className="bb-home-tile-link">Karte entdecken</Link>
        </>
      )}
    </section>
  );
}

function GearTile({ user }) {
  const gear = useQuery({
    queryKey: ['dashboard-gear-v2', user?.id],
    enabled: !!user,
    queryFn: () => entities.GearItem.list(),
    staleTime: 60000,
  });
  const count = Array.isArray(gear.data) ? gear.data.length : 0;

  return (
    <Link to="/Gear" className="bb-home-tile" aria-label="Meine Ausrüstung öffnen">
      <span className="bb-home-tile-label"><Backpack size={14} aria-hidden="true" />Ausrüstung</span>
      {gear.isError ? (
        <span className="bb-home-tile-meta">Konnte nicht geladen werden.</span>
      ) : gear.isLoading && user ? (
        <span className="bb-home-tile-meta">Wird geladen …</span>
      ) : (
        <>
          <strong className="bb-home-tile-title">{count ? `${count} ${count === 1 ? 'Gegenstand' : 'Gegenstände'}` : 'Noch leer'}</strong>
          <span className="bb-home-tile-meta">{count ? 'Packliste zusammenstellen' : 'Ausrüstung hinzufügen'}</span>
        </>
      )}
    </Link>
  );
}

// Seite 2 des Dashboards: alle bisherigen Dashboard-Karten auf einen Blick
// als kompakte Kacheln (Vorlage: „die anderen Screenshots in eine Seite").
export default function HomeOverview({ user, dashboardData, error, onRetry, onShare }) {
  const topSpots = Array.isArray(dashboardData?.top_spots) ? dashboardData.top_spots : [];

  return (
    <section id="bb-home-overview" className="bb-home-overview" aria-labelledby="bb-home-overview-title">
      <OnboardingFlow />
      <header className="bb-home-overview-head">
        <h2 id="bb-home-overview-title">Deine <span className="bb-title-accent">Übersicht</span></h2>
        <OfflineCacheIndicator />
      </header>

      {/* Einziger Einstieg in den Admin-Bereich — nur für den Superuser (Server prüft zusätzlich). */}
      {user?.is_superuser === true && (
        <Link to="/Admin" className="bb-home-tile bb-home-tile-wide bb-home-tile-row">
          <span className="bb-home-tile-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
          <span className="flex-1 min-w-0">
            <strong className="bb-home-tile-title">Admin-Bereich</strong>
            <span className="bb-home-tile-meta">Nutzer, Pläne, Werbung, Statistik, Tickets</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      )}

      {error && user && (
        <div className="bb-home-tile bb-home-tile-wide" role="alert">
          <p className="bb-home-tile-meta">Dashboard-Daten konnten nicht geladen werden.</p>
          <button type="button" className="bb-home-tile-btn" onClick={onRetry}>Erneut versuchen</button>
        </div>
      )}

      <div className="bb-home-grid">
        <NextTripTile trip={dashboardData?.next_trip || null} error={!!error} onRetry={onRetry} signedIn={!!user} />
        <BiteTile />
        <TopSpotsTile spots={topSpots} />
        <GearTile user={user} />
        <SuspenseWithErrorBoundary isMinimal={true}><SchonzeitWarner /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><BuddyInsightCard /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><FishingRecommendationCard /></SuspenseWithErrorBoundary>
        <SuspenseWithErrorBoundary isMinimal={true}><AudioNotesWidget /></SuspenseWithErrorBoundary>
        <button type="button" className="bb-home-tile bb-home-tile-wide bb-home-share" onClick={onShare}>
          <Users size={17} aria-hidden="true" />Erlebnis mit der Community teilen
        </button>
      </div>
    </section>
  );
}
