import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, LocateFixed } from "lucide-react";
import { entities } from "@/api/frontendClient";
import { createPageUrl } from "@/utils";
import { isInClosedSeason, nextClosedSeasonStart } from "@/lib/closedSeason";
import { useLocation } from "@/components/location/LocationManager";
import { placeCacheKey, reverseGeocode } from "@/lib/placeName";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Regeln der Region (Bundesland) plus bundesweite Regeln. */
export function relevantRules(rules, bundesland) {
  const state = bundesland ? bundesland.toLowerCase() : null;
  return (Array.isArray(rules) ? rules : []).filter((rule) => {
    const region = String(rule?.region || "").toLowerCase();
    return region.includes("deutschland") || (state ? region.includes(state) : false);
  });
}

/** Aktive und in 14 Tagen beginnende Schonzeiten. */
export function splitClosedSeasons(rules, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const in14Days = new Date(today.getTime() + 14 * DAY_MS);
  const active = rules.filter((rule) => isInClosedSeason(rule.closed_from, rule.closed_to, today));
  const upcoming = rules.filter((rule) => {
    if (!rule.closed_from || isInClosedSeason(rule.closed_from, rule.closed_to, today)) return false;
    const from = nextClosedSeasonStart(rule.closed_from, today);
    return Boolean(from) && from > today && from <= in14Days;
  });
  return { active, upcoming };
}

const fishNames = (rules) => [...new Set(rules.map((rule) => rule.fish).filter(Boolean))].join(", ");

// Schonzeit-Wächter als kompakte Kachel der Dashboard-Übersicht. Standort aus
// dem LocationManager (reagiert sofort, wenn GPS erlaubt wird), Bundesland per
// gecachtem Reverse-Geocoding, Regeln aus rule_entries.
export default function SchonzeitWarner() {
  const { currentLocation, requestGpsLocation, loading: locating } = useLocation();
  const hasLocation = currentLocation?.lat != null && currentLocation?.lon != null;

  const region = useQuery({
    queryKey: ["place-name", hasLocation ? placeCacheKey(currentLocation.lat, currentLocation.lon) : null],
    enabled: hasLocation,
    queryFn: ({ signal }) => reverseGeocode(currentLocation.lat, currentLocation.lon, { signal }),
    staleTime: Infinity,
    retry: 1,
  });
  const rules = useQuery({
    queryKey: ["rule-entries-dashboard"],
    enabled: hasLocation,
    queryFn: () => entities.RuleEntry.list("-created_date", 500),
    staleTime: 60 * 60 * 1000,
  });

  const header = (
    <span className="bb-home-tile-label is-gold"><ShieldAlert size={14} aria-hidden="true" />Schonzeiten</span>
  );

  if (!hasLocation) {
    return (
      <section className="bb-home-tile" aria-label="Schonzeit-Wächter">
        {header}
        <p className="bb-home-tile-meta">Für lokale Schonzeiten wird dein Standort benötigt.</p>
        <button type="button" className="bb-home-tile-btn" onClick={requestGpsLocation} disabled={locating}>
          <LocateFixed size={15} aria-hidden="true" />{locating ? "Suche …" : "Standort verwenden"}
        </button>
      </section>
    );
  }

  if (rules.isLoading || region.isLoading) {
    return (
      <section className="bb-home-tile" aria-label="Schonzeit-Wächter" aria-busy="true">
        {header}
        <span className="bb-home-tile-meta">Wird geprüft …</span>
      </section>
    );
  }

  if (rules.isError) {
    return (
      <section className="bb-home-tile" aria-label="Schonzeit-Wächter">
        {header}
        <p className="bb-home-tile-meta">Regeln konnten nicht geladen werden.</p>
        <button type="button" className="bb-home-tile-btn" onClick={() => rules.refetch()}>Erneut versuchen</button>
      </section>
    );
  }

  const bundesland = region.data?.state || null;
  const { active, upcoming } = splitClosedSeasons(relevantRules(rules.data, bundesland));

  return (
    <Link to={createPageUrl("AngelscheinPruefungSchonzeiten")} className="bb-home-tile" aria-label="Schonzeit-Wächter, alle Regeln öffnen">
      {header}
      {bundesland && <span className="bb-home-tile-meta">{bundesland}</span>}
      {active.length === 0 && upcoming.length === 0 ? (
        <p className="bb-home-tile-text is-ok">Aktuell keine Schonzeiten.</p>
      ) : (
        <>
          {active.length > 0 && <p className="bb-home-tile-text is-alert">Jetzt: {fishNames(active)}</p>}
          {upcoming.length > 0 && <p className="bb-home-tile-text is-warn">Bald: {fishNames(upcoming)}</p>}
        </>
      )}
    </Link>
  );
}
