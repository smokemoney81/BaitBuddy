// Fahrzeit-Schätzung ohne externen Routing-Dienst.
//
// Die Spot-Panels riefen `calculateTravelTime` auf, das auf einen Backend-
// Platzhalter (immer []) zeigte — Fahrzeit und Entfernung erschienen nie.
// Ein Routing-Dienst wäre ein zusätzlicher externer Anbieter (CLAUDE.md), daher
// eine nachvollziehbare Schätzung: Luftlinie (Haversine) × Umwegfaktor für das
// Straßennetz bei mittlerem Landstraßentempo. Die Oberfläche kennzeichnet die
// Werte als „ca.“; für die echte Route verlinkt sie auf Google Maps.

const EARTH_RADIUS_KM = 6371;
// Typisches Verhältnis Straßen- zu Luftlinienentfernung im ländlichen Raum.
export const ROAD_DETOUR_FACTOR = 1.3;
export const AVERAGE_SPEED_KMH = 60;

const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineKm(fromLat, fromLon, toLat, toLon) {
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @returns {{ distance_km: number, road_km: number, duration_minutes: number, estimated: true } | null}
 *   null bei ungültigen Koordinaten.
 */
export function estimateTravel({ fromLat, fromLon, toLat, toLon }) {
  const values = [fromLat, fromLon, toLat, toLon].map(Number);
  if (values.some((v) => !Number.isFinite(v))) return null;
  const [aLat, aLon, bLat, bLon] = values;
  if (Math.abs(aLat) > 90 || Math.abs(bLat) > 90 || Math.abs(aLon) > 180 || Math.abs(bLon) > 180) return null;

  const straight = haversineKm(aLat, aLon, bLat, bLon);
  const road = straight * ROAD_DETOUR_FACTOR;
  return {
    distance_km: Math.round(straight * 10) / 10,
    road_km: Math.round(road * 10) / 10,
    duration_minutes: Math.max(1, Math.round((road / AVERAGE_SPEED_KMH) * 60)),
    estimated: true,
  };
}
