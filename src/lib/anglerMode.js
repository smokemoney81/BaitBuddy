// Reine Logik für den Anglermodus (BaitBuddy 2.0, Spec §15-16). Kein React/DOM
// → unit-testbar. Timer-Formatierung + tageszeit-abhängiges Hintergrund-Theme
// (dezent, performant: statische Gradients, keine Dauer-Animation).

function pad(n) { return String(n).padStart(2, '0'); }

// Sekunden -> HH:MM:SS (Stunden ohne feste Breite, mind. 2-stellig ab 10h).
export function formatElapsed(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function elapsedSeconds(startMs, now = Date.now()) {
  if (!startMs) return 0;
  return Math.max(0, Math.floor((now - startMs) / 1000));
}

// Tageszeit-Theme nach Stunde (Spec §16). Dezente, GPU-freundliche Gradients.
export function timeOfDayTheme(date = new Date()) {
  const hour = date instanceof Date ? date.getHours() : new Date(date).getHours();
  if (hour >= 5 && hour < 8) {
    return { key: 'dawn', label: 'Morgendämmerung', gradient: 'linear-gradient(180deg, #17324a 0%, #0e2438 55%, #0b1324 100%)' };
  }
  if (hour >= 8 && hour < 18) {
    return { key: 'day', label: 'Tag', gradient: 'linear-gradient(180deg, #16466a 0%, #10314c 55%, #0b1324 100%)' };
  }
  if (hour >= 18 && hour < 21) {
    return { key: 'dusk', label: 'Abenddämmerung', gradient: 'linear-gradient(180deg, #3a2740 0%, #1c2340 55%, #0b1324 100%)' };
  }
  return { key: 'night', label: 'Nacht', gradient: 'linear-gradient(180deg, #0c1830 0%, #0a1222 60%, #070d18 100%)' };
}

// Trip-Startzeit je Plan (localStorage), geteilt von Anglermodus und
// Hands-free Buddy. Der Server kennt nur is_active, keinen Startzeitpunkt.
const tripStartKey = (id) => `bb_angler_start_${id}`;

export function readTripStart(planId) {
  try {
    const v = Number(localStorage.getItem(tripStartKey(planId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}

export function writeTripStart(planId, ms) {
  try { localStorage.setItem(tripStartKey(planId), String(ms)); } catch { /* ignore */ }
}

export function clearTripStart(planId) {
  try { localStorage.removeItem(tripStartKey(planId)); } catch { /* ignore */ }
}

// Windgeschwindigkeit (km/h) → Beaufort-Stufe 0–12 (Obergrenzen je Stufe).
const BEAUFORT_LIMITS = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
export function beaufort(kmh) {
  if (kmh === null || kmh === undefined || kmh === '') return null;
  const v = Number(kmh);
  if (!Number.isFinite(v) || v < 0) return null;
  const index = BEAUFORT_LIMITS.findIndex(limit => v < limit);
  return index === -1 ? 12 : index;
}

// Windrichtung in Grad (woher der Wind kommt) → Himmelsrichtung, 8 Sektoren.
const DIRECTIONS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export function compassDirection(degrees) {
  if (degrees === null || degrees === undefined || degrees === '') return null;
  const d = Number(degrees);
  if (!Number.isFinite(d)) return null;
  return DIRECTIONS[Math.round((((d % 360) + 360) % 360) / 45) % 8];
}

// Kurzer Hinweis zur Angelzeit aus dem echten Bissindex (0–100).
export function fishingMoment(biteIndex) {
  if (biteIndex == null) return 'Standort für die Bissprognose nötig';
  if (biteIndex >= 70) return 'Perfekte Zeit zum Angeln!';
  if (biteIndex >= 55) return 'Gute Zeit zum Angeln';
  if (biteIndex >= 40) return 'Mittlere Beißlaune';
  return 'Eher ruhige Phase';
}

// Weather-Code (WMO, Open-Meteo) → Symbolschlüssel für die Anzeige.
export function weatherKind(code, isNight = false) {
  const c = Number(code);
  if (!Number.isFinite(c)) return 'unknown';
  if (c === 0 || c === 1) return isNight ? 'clear-night' : 'clear';
  if (c === 2) return isNight ? 'partly-night' : 'partly';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 95) return 'storm';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 51) return 'rain';
  return 'cloudy';
}
