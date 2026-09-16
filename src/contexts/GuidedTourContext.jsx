import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import {
  normalizeTutorial,
  startTutorial,
  advanceTutorial,
  skipTutorial,
  completeTutorial,
  restartTutorial,
  TUTORIAL_LEVELS,
} from '@/lib/tutorial';

const GuidedTourContext = createContext();

// Der Tour-Fortschritt liegt in `user_metadata.settings.tutorial` und geht über
// denselben savePreferences-Pfad wie Onboarding und Präferenzen. Zuvor las und
// schrieb dieser Context direkt `public.users` aus dem Browser — eine Tabelle,
// in der für die allermeisten Konten keine Zeile existiert. Lesen lieferte
// deshalb nichts, Schreiben schlug still fehl, und das Tutorial fing bei jedem
// Start von vorn an.
//
// `isActive` ist bewusst NICHT persistent: dass eine Tour gerade läuft, gehört
// zur Sitzung. Persistent ist nur, wie weit der Nutzer gekommen ist.
export function GuidedTourProvider({ children }) {
  const { tutorial, saveTutorial, canSave, userId } = useBuddyPreferences();
  const [isActive, setIsActive] = React.useState(false);

  const persist = useCallback((next) => {
    if (!canSave) return Promise.resolve();
    return saveTutorial(next).catch((error) => {
      console.error('Tutorial-Fortschritt konnte nicht gespeichert werden:', error);
    });
  }, [canSave, saveTutorial]);

  const nextStep = useCallback((newStep) => {
    persist(advanceTutorial(tutorial, newStep));
  }, [persist, tutorial]);

  const completeTour = useCallback(async () => {
    setIsActive(false);
    await persist(completeTutorial(tutorial));
  }, [persist, tutorial]);

  const skipTour = useCallback(async () => {
    setIsActive(false);
    await persist(skipTutorial(tutorial));
  }, [persist, tutorial]);

  const startTour = useCallback(() => {
    setIsActive(true);
    persist(startTutorial(tutorial));
  }, [persist, tutorial]);

  const stopTour = useCallback(() => {
    setIsActive(false);
  }, []);

  const setUserLevelDirectly = useCallback((level) => {
    if (!TUTORIAL_LEVELS.includes(level)) return Promise.resolve();
    return persist({ ...normalizeTutorial(tutorial), level });
  }, [persist, tutorial]);

  const resetTour = useCallback(async () => {
    setIsActive(false);
    await persist(restartTutorial(tutorial));
  }, [persist, tutorial]);

  const value = useMemo(() => ({
    isActive,
    currentStep: tutorial.step,
    userLevel: tutorial.level,
    tutorialCompleted: tutorial.completed,
    // Die Präferenzen kommen mit dem Nutzerobjekt; ein eigener Ladezustand
    // entfällt. Solange kein Nutzer feststeht, gilt das Tutorial als "lädt" —
    // sonst würde es einem gerade anmeldenden Nutzer kurz angeboten.
    isLoading: userId === null,
    startTour,
    stopTour,
    nextStep,
    completeTour,
    skipTour,
    setUserLevelDirectly,
    resetTour,
  }), [
    isActive, tutorial.step, tutorial.level, tutorial.completed, userId,
    startTour, stopTour, nextStep, completeTour, skipTour, setUserLevelDirectly, resetTour,
  ]);

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
    </GuidedTourContext.Provider>
  );
}

export function useGuidedTour() {
  const context = useContext(GuidedTourContext);
  if (!context) {
    throw new Error('useGuidedTour must be used inside GuidedTourProvider');
  }
  return context;
}
