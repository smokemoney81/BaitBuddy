// Geführtes Onboarding (BaitBuddy 2.0, §3).
//
// Reine Zustands- und Schrittlogik, ohne React — damit ohne DOM testbar. Der
// Fortschritt liegt wie alle anderen Präferenzen in
// `user_metadata.settings.onboarding` und wird über denselben
// savePreferences-Pfad gespeichert. Dadurch lässt sich das Onboarding
// überspringen, später fortsetzen und jederzeit erneut starten (§3).

// Reihenfolge und Umfang folgen der Spezifikation. Jeder Schritt schreibt in
// genau einen Präferenz-Bereich (`section`) oder ist ein reiner Info- bzw.
// Berechtigungs-Schritt (`section: null`).
export const ONBOARDING_STEPS = [
  { id: 'welcome', title: 'Willkommen', section: null },
  { id: 'buddy', title: 'Dein Buddy', section: 'buddy' },
  { id: 'voice', title: 'Stimme', section: 'buddy' },
  { id: 'tone', title: 'Antwortstil', section: 'buddy' },
  { id: 'experience', title: 'Deine Erfahrung', section: 'angler' },
  { id: 'methods', title: 'Angelmethoden', section: 'fishing' },
  { id: 'species', title: 'Zielfische', section: 'fishing' },
  { id: 'waters', title: 'Gewässertypen', section: 'fishing' },
  { id: 'region', title: 'Region', section: 'angler' },
  { id: 'times', title: 'Angelzeiten', section: 'fishing' },
  { id: 'gear', title: 'Ausrüstung', section: null },
  { id: 'goals', title: 'Deine Ziele', section: 'angler' },
  { id: 'focus', title: 'Schwerpunkte', section: 'navigation' },
  { id: 'notifications', title: 'Benachrichtigungen', section: null },
  { id: 'location', title: 'Standort', section: null },
  { id: 'summary', title: 'Zusammenfassung', section: null },
];

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;
const LAST_INDEX = ONBOARDING_STEP_COUNT - 1;

export const DEFAULT_ONBOARDING = {
  completed: false,
  skipped: false,
  stepIndex: 0,
  completedAt: null,
};

function clampIndex(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(LAST_INDEX, Math.max(0, Math.trunc(value)));
}

export function normalizeOnboarding(value = {}) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    completed: v.completed === true,
    skipped: v.skipped === true,
    stepIndex: clampIndex(v.stepIndex),
    completedAt: typeof v.completedAt === 'string' ? v.completedAt : null,
  };
}

export function stepAt(index) {
  return ONBOARDING_STEPS[clampIndex(index)];
}

/**
 * Das Onboarding erscheint nur für angemeldete Nutzer, die es weder
 * abgeschlossen noch bewusst übersprungen haben. Ein Gast bekommt es nicht —
 * ohne Konto ließe sich das Ergebnis nicht speichern und er müsste es nach der
 * Anmeldung erneut durchlaufen.
 */
export function shouldShowOnboarding(onboarding, { canSave }) {
  if (!canSave) return false;
  const state = normalizeOnboarding(onboarding);
  return !state.completed && !state.skipped;
}

export function advance(onboarding) {
  const state = normalizeOnboarding(onboarding);
  if (state.stepIndex >= LAST_INDEX) return completeOnboarding(state);
  return { ...state, stepIndex: state.stepIndex + 1 };
}

export function goBack(onboarding) {
  const state = normalizeOnboarding(onboarding);
  return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) };
}

// Überspringen beendet nur diesen Durchlauf. `completed` bleibt false, damit
// „Onboarding erneut starten" und eine spätere Fortsetzung unterscheidbar sind.
export function skipOnboarding(onboarding) {
  return { ...normalizeOnboarding(onboarding), skipped: true };
}

export function completeOnboarding(onboarding) {
  return {
    ...normalizeOnboarding(onboarding),
    completed: true,
    skipped: false,
    stepIndex: LAST_INDEX,
    completedAt: new Date().toISOString(),
  };
}

// Erneut starten setzt den Fortschritt zurück, lässt die bereits erfassten
// Präferenzen aber unangetastet — der Nutzer korrigiert sie, statt sie zu
// verlieren.
export function restartOnboarding() {
  return { ...DEFAULT_ONBOARDING };
}

export function progressPercent(onboarding) {
  const state = normalizeOnboarding(onboarding);
  if (state.completed) return 100;
  return Math.round((state.stepIndex / LAST_INDEX) * 100);
}
