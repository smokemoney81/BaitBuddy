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
