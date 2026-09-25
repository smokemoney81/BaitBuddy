// Ereignisse eines laufenden Trips für die Live-Timeline im Anglermodus:
// erkannte Bisse (Bisserkennung) und Standortwechsel. Fänge kommen aus dem
// Fangbuch; hier liegt nur, was sonst nirgends gespeichert wird. Lokal auf dem
// Gerät, gekappt auf 200 Einträge und 3 Tage.

const KEY = 'bb_trip_events';
const MAX_EVENTS = 200;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const TRIP_EVENT = 'trip-event-recorded';

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function recordTripEvent(type, data = {}, at = Date.now()) {
  const now = Date.now();
  const events = [{ type, at, ...data }, ...readAll()]
    .filter(e => e && Number.isFinite(e.at) && now - e.at < MAX_AGE_MS)
    .slice(0, MAX_EVENTS);
  try {
    localStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    return;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TRIP_EVENT));
}

export function tripEventsSince(startMs) {
  return readAll().filter(e => Number.isFinite(e.at) && e.at >= startMs);
}

// Entfernung zweier Koordinaten in Metern (Haversine).
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Grobe Richtung von a nach b ("nördlich", "südöstlich" …).
export function bearingWord(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const words = ['nördlich', 'nordöstlich', 'östlich', 'südöstlich', 'südlich', 'südwestlich', 'westlich', 'nordwestlich'];
  return words[Math.round(deg / 45) % 8];
}

// Ab dieser Strecke gilt eine neue Position als Standortwechsel.
export const MOVE_THRESHOLD_M = 100;
