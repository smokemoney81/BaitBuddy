// Zentrale Validierung geographischer Koordinaten.
//
// Die Routen prueften bisher uneinheitlich: teils `Number.isFinite`, teils
// `typeof === 'number'`, teils gar nicht. Beide Varianten lassen Werte ausserhalb
// des gueltigen Bereichs durch (`latitude: 999`), `typeof` zusaetzlich `NaN` und
// `Infinity`. Solche Werte landeten entweder in der Datenbank oder wurden in
// Upstream-URLs (Open-Meteo, Bright Sky) interpoliert.

export const LATITUDE_RANGE = { min: -90, max: 90 };
export const LONGITUDE_RANGE = { min: -180, max: 180 };

// Nimmt beliebige Eingaben (Zahl oder Zahl-String) und liefert eine Zahl im
// gueltigen Bereich — oder null. Bewusst kein `parseFloat`: das akzeptiert
// "52.5abc" und schnitte den Rest still ab.
function toCoordinate(value, { min, max }) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

export function parseLatitude(value) {
  return toCoordinate(value, LATITUDE_RANGE);
}

export function parseLongitude(value) {
  return toCoordinate(value, LONGITUDE_RANGE);
}

/**
 * Prueft ein Koordinatenpaar.
 * @returns {{ok: true, latitude: number, longitude: number}|{ok: false, error: string}}
 */
export function parseCoordinates(latitude, longitude) {
  const lat = parseLatitude(latitude);
  const lon = parseLongitude(longitude);
  if (lat === null || lon === null) {
    return {
      ok: false,
      error: 'latitude und longitude müssen Zahlen sein (Breite -90 bis 90, Länge -180 bis 180)',
    };
  }
  return { ok: true, latitude: lat, longitude: lon };
}

/**
 * Variante fuer optionale Koordinaten: fehlen beide, ist das in Ordnung.
 * Ist genau eine gesetzt oder eine ungueltig, wird das als Fehler gemeldet —
 * eine halbe Position ist keine Position.
 * @returns {{ok: true, latitude: number|null, longitude: number|null}|{ok: false, error: string}}
 */
export function parseOptionalCoordinates(latitude, longitude) {
  const latMissing = latitude === null || latitude === undefined || latitude === '';
  const lonMissing = longitude === null || longitude === undefined || longitude === '';
  if (latMissing && lonMissing) return { ok: true, latitude: null, longitude: null };
  return parseCoordinates(latitude, longitude);
}
