// Ortsname zu Koordinaten für die Wetterspalte des Dashboards ("Bedburg").
//
// Quelle ist dieselbe wie im Schonzeit-Wächter: Nominatim (OpenStreetMap).
// Der GPS-Standort trägt sonst nur den Namen "GPS-Standort". Ergebnisse werden
// pro ~1-km-Raster in localStorage gemerkt — Nominatim erlaubt höchstens eine
// Anfrage pro Sekunde, und der Ortsname ändert sich an derselben Stelle nicht.

const CACHE_KEY = 'bb_place_names';
const MAX_ENTRIES = 20;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Namen, die der LocationManager selbst vergibt und die kein Ort sind.
const GENERIC_NAMES = new Set(['GPS-Standort', 'Manueller Standort', 'Unbenannter Spot', 'Dein Standort']);

export function placeCacheKey(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

export function pickPlaceName(address) {
  if (!address || typeof address !== 'object') return null;
  return address.city || address.town || address.village || address.municipality
    || address.suburb || address.county || null;
}

/** Eigener, sprechender Name des Standorts (Spot, manuell benannt) oder null. */
export function ownLocationName(location) {
  const name = typeof location?.name === 'string' ? location.name.trim() : '';
  return name && !GENERIC_NAMES.has(name) ? name : null;
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    const entries = Object.entries(cache).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, MAX_ENTRIES);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Speicher gesperrt (Private Mode): dann eben ohne Cache.
  }
}

export function readCachedPlace(lat, lon, now = Date.now()) {
  const entry = readCache()[placeCacheKey(lat, lon)];
  if (!entry || typeof entry.place !== 'string' || now - (entry.at || 0) > TTL_MS) return null;
  return { place: entry.place, state: entry.state || null };
}

/**
 * Liefert { place, state } zu den Koordinaten. Wirft bei Netzwerkfehlern,
 * damit der Aufrufer (React Query) später erneut versuchen kann.
 */
export async function reverseGeocode(lat, lon, { signal, now = Date.now() } = {}) {
  const cached = readCachedPlace(lat, lon, now);
  if (cached) return cached;

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json&zoom=10&addressdetails=1`;
  const response = await fetch(url, { signal, headers: { 'Accept-Language': 'de' } });
  if (!response.ok) throw new Error(`Ortsname konnte nicht geladen werden (${response.status}).`);
  const data = await response.json();
  const result = { place: pickPlaceName(data?.address), state: data?.address?.state || null };
  if (result.place) {
    const cache = readCache();
    cache[placeCacheKey(lat, lon)] = { ...result, at: now };
    writeCache(cache);
  }
  return result;
}
