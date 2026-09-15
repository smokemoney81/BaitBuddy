// Reine Logik für die BaitBuddy-2.0-Planungs-Journey (Dashboard-Hero + Trip-
// Planer). Kein React/DOM-Import → unit-testbar. Arbeitet auf dem bestehenden
// FishingPlan-Datenmodell (title, target_fish, spot_info, planned_date,
// is_active, steps[], details{}). Es werden KEINE Daten erfunden: ein Schritt
// gilt nur als erledigt, wenn das zugehörige Feld tatsächlich gefüllt ist.

// spot_info normalisieren (Objekt = neu, String = Altdatensatz) — spiegelt
// readSpot aus TripPlanner.jsx, hier ohne React für Wiederverwendung/Tests.
export function readPlanSpot(spotInfo) {
  if (spotInfo && typeof spotInfo === 'object' && !Array.isArray(spotInfo)) {
    return {
      name: spotInfo.name || '',
      water_type: spotInfo.water_type || '',
      lat: spotInfo.lat != null ? Number(spotInfo.lat) : null,
      lon: spotInfo.lon != null ? Number(spotInfo.lon) : null,
    };
  }
  const text = typeof spotInfo === 'string' ? spotInfo : '';
  const m = text.match(/Koordinaten:\s*([\d.-]+),\s*([\d.-]+)/);
  return {
    name: text.split('\n')[0] || '',
    water_type: '',
    lat: m ? parseFloat(m[1]) : null,
    lon: m ? parseFloat(m[2]) : null,
  };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasGear(details) {
  const gear = details.gear;
  if (Array.isArray(gear)) return gear.length > 0;
  if (nonEmptyString(gear)) return true;
  return Array.isArray(details.gear_items) && details.gear_items.length > 0;
}

function hasRules(details) {
  if (details.rules_ack === true) return true;
  if (nonEmptyString(details.rules)) return true;
  return Array.isArray(details.rules) && details.rules.length > 0;
}

function hasConditions(details, spot, plan) {
  const snap = details.weather_snapshot;
  if (snap && typeof snap === 'object' && !Array.isArray(snap) && Object.keys(snap).length > 0) return true;
  // Ohne gespeicherten Snapshot sind Bedingungen ableitbar, sobald Ort mit
  // Koordinaten UND ein Zeitpunkt feststehen (Wetter/Bissindex berechenbar).
  return spot.lat != null && spot.lon != null && !!plan.planned_date;
}

// Die acht Planungsschritte in fester Reihenfolge (Spec §4).
export function computeTripJourney(plan) {
  const p = plan && typeof plan === 'object' ? plan : {};
  const details = p.details && typeof p.details === 'object' && !Array.isArray(p.details) ? p.details : {};
  const spot = readPlanSpot(p.spot_info);

  const steps = [
    { id: 'target', label: 'Zielfisch', complete: nonEmptyString(p.target_fish), value: nonEmptyString(p.target_fish) ? p.target_fish : null },
    { id: 'spot', label: 'Ort', complete: nonEmptyString(spot.name), value: nonEmptyString(spot.name) ? spot.name : null },
    { id: 'time', label: 'Zeitpunkt', complete: !!p.planned_date, value: p.planned_date || null },
    { id: 'conditions', label: 'Bedingungen', complete: hasConditions(details, spot, p), value: null },
    { id: 'gear', label: 'Ausrüstung', complete: hasGear(details), value: null },
    { id: 'bait', label: 'Köder', complete: nonEmptyString(details.bait), value: nonEmptyString(details.bait) ? details.bait : null },
    { id: 'rules', label: 'Vorschriften', complete: hasRules(details), value: null },
    { id: 'checklist', label: 'Checkliste', complete: Array.isArray(p.steps) && p.steps.length > 0, value: Array.isArray(p.steps) ? p.steps.length : 0 },
  ];

  const completed = steps.filter((s) => s.complete).length;
  const total = steps.length;
  const percent = Math.round((completed / total) * 100);
  // Erster offener Schritt = aktueller (Sonar-Pulse); -1 wenn alles fertig.
  const currentIndex = steps.findIndex((s) => !s.complete);

  return { steps, completed, total, percent, currentIndex, spot, details };
}

function startOfToday(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Wählt den "nächsten Angelausflug" aus einer Plan-Liste:
// 1. ein aktiver Trip (frühestes Datum bei mehreren),
// 2. sonst der früheste zukünftige (planned_date ab heute),
// 3. sonst der zuletzt angelegte Entwurf ohne Datum,
// 4. sonst null (nur vergangene Trips → Empty State).
export function selectNextTrip(plans, now = new Date()) {
  if (!Array.isArray(plans) || plans.length === 0) return null;
  const today0 = startOfToday(now);
  const dateMs = (p) => (p.planned_date ? new Date(p.planned_date).getTime() : null);

  const active = plans.filter((p) => p && p.is_active);
  if (active.length > 0) {
    return active.slice().sort((a, b) => (dateMs(a) ?? Infinity) - (dateMs(b) ?? Infinity))[0];
  }

  const upcoming = plans
    .filter((p) => p && dateMs(p) != null && dateMs(p) >= today0)
    .sort((a, b) => dateMs(a) - dateMs(b));
  if (upcoming.length > 0) return upcoming[0];

  const undatedDrafts = plans
    .filter((p) => p && !p.planned_date)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  if (undatedDrafts.length > 0) return undatedDrafts[0];

  return null;
}
