// Zustand des interaktiven Tutorials (BaitBuddy 2.0, §4).
//
// Der Fortschritt lag zuvor in `public.users` (Spalten `user_level`,
// `tutorial_completed`, `guided_tour_step`) und wurde vom Browser aus direkt
// über den Supabase-Client gelesen und geschrieben. Das konnte nicht
// funktionieren: Für die allermeisten Konten existiert dort gar keine Zeile —
// jeder Lesevorgang lief ins Leere, jeder Schreibvorgang ebenso, und das
// Tutorial begann bei jedem Start von vorn. Zusätzlich verlangt CLAUDE.md, dass
// der Datenzugriff über das Backend läuft, nicht über den Browser-Client.
//
// Der Fortschritt liegt deshalb jetzt wie Onboarding und Präferenzen in
// `user_metadata.settings.tutorial` und geht über denselben
// savePreferences-Pfad.

export const TUTORIAL_LEVELS = ['beginner', 'experienced', 'professional'];

export const DEFAULT_TUTORIAL = {
  completed: false,
  skipped: false,
  step: 0,
  level: 'beginner',
};

export function normalizeTutorial(value = {}) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const step = Number.isFinite(v.step) ? Math.max(0, Math.trunc(v.step)) : 0;
  return {
    completed: v.completed === true,
    skipped: v.skipped === true,
    step,
    level: TUTORIAL_LEVELS.includes(v.level) ? v.level : 'beginner',
  };
}

/**
 * Das Tutorial wird nur angeboten, wenn der Nutzer angemeldet ist, das
 * Onboarding hinter sich hat und das Tutorial weder abgeschlossen noch bewusst
 * übersprungen hat (§4: nach dem Onboarding, optional, überspringbar).
 *
 * Ein noch laufendes Onboarding hat Vorrang — zwei Overlays gleichzeitig wären
 * für den Nutzer nicht bedienbar.
 */
export function shouldOfferTutorial({ tutorial, onboarding, canSave }) {
  if (!canSave) return false;
  const state = normalizeTutorial(tutorial);
  if (state.completed || state.skipped) return false;
  return onboarding?.completed === true || onboarding?.skipped === true;
}

export function startTutorial(tutorial) {
  return { ...normalizeTutorial(tutorial), skipped: false, completed: false, step: 0 };
}

export function advanceTutorial(tutorial, step) {
  return { ...normalizeTutorial(tutorial), step: Math.max(0, Math.trunc(step) || 0) };
}

// Überspringen beendet diesen Durchlauf, nicht das Tutorial an sich — über die
// Einstellungen lässt es sich erneut starten.
export function skipTutorial(tutorial) {
  return { ...normalizeTutorial(tutorial), skipped: true };
}

export function completeTutorial(tutorial) {
  return { ...normalizeTutorial(tutorial), completed: true, skipped: false, step: 0 };
}

export function restartTutorial(tutorial) {
  return { ...normalizeTutorial(tutorial), completed: false, skipped: false, step: 0 };
}
