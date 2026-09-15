import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Fish, MapPin, Compass, ChevronRight, Loader2, Plus } from 'lucide-react';
import { FishingPlan } from '@/entities/FishingPlan';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { computeTripJourney, selectNextTrip, readPlanSpot } from '@/lib/tripJourney';
import TripJourney from './TripJourney';

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// Hero „Dein nächster Angelausflug" (Spec §3). Lädt selbst, zeigt echte Daten
// aus dem gewählten FishingPlan; fehlt etwas, bleibt der Bereich leer statt
// erfundener Werte (Spec §33). Ohne geplanten Trip: Empty State mit CTA.
export default function NextTripHero() {
  const { fishing } = useBuddyPreferences();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await FishingPlan.list('-created_at');
        if (!alive) return;
        setPlan(selectNextTrip(Array.isArray(list) ? list : []));
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <section className="bb-card" aria-label="Nächster Angelausflug" aria-busy="true">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Dein nächster Angelausflug wird geladen …
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bb-card" role="alert">
        <p className="text-sm text-slate-300">Dein nächster Angelausflug konnte nicht geladen werden.</p>
        <Link to="/TripPlanner" className="bb-secondary mt-3 inline-flex"><Compass size={16} /> Zur Planung</Link>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="bb-card" aria-label="Nächster Angelausflug">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
            <Compass size={22} aria-hidden="true" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Plane deinen nächsten Angelausflug</h2>
            <p className="text-sm text-slate-400 mt-1">
              Wo, wann, womit und auf welchen Fisch? BaitBuddy führt dich Schritt für Schritt durch die Planung.
            </p>
            <Link to="/TripPlanner?new=1" className="bb-action mt-4 inline-flex">
              <Plus size={18} aria-hidden="true" /> Angelausflug planen
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const journey = computeTripJourney(plan);
  const spot = readPlanSpot(plan.spot_info);
  const when = formatDateTime(plan.planned_date);
  const timeWindow = fishing?.preferredTime;

  return (
    <section className="bb-card" aria-label="Nächster Angelausflug">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs uppercase tracking-wide text-cyan-300/80">Dein nächster Angelausflug</span>
        {plan.is_active && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-500/40">Aktiv</span>
        )}
      </div>

      <h2 className="text-xl font-semibold text-slate-100 truncate">{plan.title || plan.target_fish || 'Angelausflug'}</h2>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-300">
        {plan.target_fish && (
          <span className="inline-flex items-center gap-1.5"><Fish size={15} className="text-cyan-400" aria-hidden="true" />{plan.target_fish}</span>
        )}
        {spot.name && (
          <span className="inline-flex items-center gap-1.5"><MapPin size={15} className="text-cyan-400" aria-hidden="true" />{spot.name}</span>
        )}
        {when && (
          <span className="inline-flex items-center gap-1.5"><CalendarClock size={15} className="text-amber-400" aria-hidden="true" />{when} Uhr</span>
        )}
      </div>

      {timeWindow && (
        <p className="mt-2 text-xs text-slate-400">
          Deine bevorzugte Angelzeit: {timeWindow.start}–{timeWindow.end} Uhr
        </p>
      )}

      {/* Fortschritt */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-slate-300">Planung</span>
          <span className="text-cyan-300 font-medium">{journey.percent}% abgeschlossen</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden" role="progressbar"
          aria-valuenow={journey.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-500" style={{ width: `${journey.percent}%` }} />
        </div>
      </div>

      <TripJourney journey={journey} />

      <Link to="/TripPlanner" className="bb-action mt-4 inline-flex w-full justify-center">
        {journey.percent >= 100 ? 'Trip ansehen' : 'Planung fortsetzen'}
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}
