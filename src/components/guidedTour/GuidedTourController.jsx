import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '@/components/i18n/LanguageContext';
import { useGuidedTour } from '@/contexts/GuidedTourContext';
import { getTourFeaturesForRoute, getTourFeature, getTourFeaturesByLevel } from '@/lib/tourFeatures';
import TourSpotlight from './TourSpotlight';
import SabrinaTourTooltip from './SabrinaTourTooltip';

/**
 * GuidedTourController: Orchestriert die komplette Guided-Tour-Erfahrung
 *
 * - Lädt Features basierend auf aktueller Route + User-Level
 * - Tracked element references
 * - Koordiniert Spotlight, Tooltip und Navigationen
 * - Speichert Fortschritt in Supabase via Context
 */
export default function GuidedTourController() {
  const location = useLocation();
  const { language } = useLanguage();
  const {
    isActive,
    currentStep,
    userLevel,
    tutorialCompleted,
    isLoading,
    nextStep,
    completeTour,
    skipTour,
    startTour,
  } = useGuidedTour();

  // Sammle alle verfügbaren Features für diesen User-Level.
  //
  // Muss memoisiert sein: Die Liste hängt unten als Dependency an einem Effekt,
  // der `setCurrentFeature` mit einem jedes Mal neu erzeugten Objekt aufruft.
  // Ohne useMemo liefert jeder Render eine neue Array-Referenz, der Effekt läuft
  // erneut, setzt wieder State — eine Endlosschleife ("Maximum update depth
  // exceeded"). Sie hat den Renderzyklus so belastet, dass der Seiteninhalt des
  // Dashboards teils gar nicht mehr erschien.
  const allAvailableFeatures = useMemo(
    () => getTourFeaturesByLevel(userLevel),
    [userLevel]
  );

  // Features nur für aktuelle Route
  const [currentRouteFeatures, setCurrentRouteFeatures] = useState([]);
  const [currentFeature, setCurrentFeature] = useState(null);
  const targetRef = useRef(null);

  // Extrahiere den aktuellen Route-Namen aus Location
  const getCurrentRouteName = () => {
    const path = location.pathname.toLowerCase();
    // Vereinfachte Mapping — anpassen an deine Routing-Struktur
    if (path.includes('dashboard')) return 'Dashboard';
    if (path.includes('logbook')) return 'Logbook';
    if (path.includes('map')) return 'Map';
    if (path.includes('weather')) return 'Weather';
    if (path.includes('kibuddy') || path.includes('buddy')) return 'KiBuddyBeta';
    if (path.includes('community')) return 'Community';
    if (path.includes('settings')) return 'Settings';
    return null;
  };

  // Aktualisiere Features beim Route-Wechsel
  useEffect(() => {
    const currentRoute = getCurrentRouteName();
    if (!currentRoute) {
      setCurrentRouteFeatures([]);
      return;
    }

    const features = getTourFeaturesForRoute(currentRoute, userLevel);
    setCurrentRouteFeatures(features);

    // Wenn Tour aktiv aber aktueller Schritt nicht für diese Route, zurücksetzen
    if (isActive && currentStep >= features.length) {
      // Bleib auf aktuellem Feature, aber es könnte nicht sichtbar sein
    }
  }, [location, userLevel, isActive]);

  // Aktualisiere aktuelles Feature basierend auf Step
  useEffect(() => {
    if (!isActive || currentRouteFeatures.length === 0) {
      setCurrentFeature(null);
      return;
    }

    // Berechne Feature innerhalb aller verfügbaren
    const allFeatureIds = allAvailableFeatures.map((f) => f.id);
    const currentFeatureId = allFeatureIds[currentStep];
    if (!currentFeatureId) {
      setCurrentFeature(null);
      return;
    }

    const feature = getTourFeature(currentFeatureId, language);
    setCurrentFeature(feature);
  }, [currentStep, isActive, language, allAvailableFeatures]);

  // Automatisch starte Tour wenn:
  // 1. User neu ist (tutorial_completed=false)
  // 2. Gerade auf Dashboard gekommen (First-Login-Flow)
  // 3. Tour wurde nicht aktiv übersprungen
  useEffect(() => {
    const routeName = getCurrentRouteName();
    if (
      routeName === 'Dashboard' &&
      !tutorialCompleted &&
      !isActive &&
      !isLoading &&
      !localStorage.getItem('bb_tour_skipped')
    ) {
      // Auto-start ein klein wenig verzögern damit alles geladen ist
      const timer = setTimeout(() => {
        startTour();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    location,
    tutorialCompleted,
    isActive,
    isLoading,
    startTour,
  ]);

  // Navigations-Logik
  const handleNext = () => {
    const nextIndex = currentStep + 1;
    if (nextIndex >= allAvailableFeatures.length) {
      completeTour();
    } else {
      nextStep(nextIndex);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      nextStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('bb_tour_skipped', 'true');
    skipTour();
  };

  const handleComplete = () => {
    localStorage.removeItem('bb_tour_skipped');
    completeTour();
  };

  // Versuche Element zu finden (via Selector oder Ref)
  const findTargetElement = () => {
    if (!currentFeature) return null;

    // Priorität 1: Direkter Ref (vom Parent-Component registriert)
    if (targetRef.current) {
      return targetRef.current;
    }

    // Priorität 2: CSS-Selektor im Feature definiert
    if (currentFeature.selector) {
      return document.querySelector(currentFeature.selector);
    }

    // Fallback: Versuche ID-basiert zu finden (z. B. data-tour="element-id")
    return document.querySelector(`[data-tour="${currentFeature.id}"]`);
  };

  const targetElement = findTargetElement();

  if (isLoading || !isActive || !currentFeature) {
    return null;
  }

  const currentIndex = allAvailableFeatures.findIndex(
    (f) => f.id === currentFeature.id
  );
  const totalSteps = allAvailableFeatures.length;

  return (
    <>
      {/* Spotlight Canvas */}
      <TourSpotlight
        targetRef={targetElement ? { current: targetElement } : targetRef}
        isVisible={isActive && !!targetElement}
        padding={12}
      />

      {/* Sabrina Tooltip */}
      <SabrinaTourTooltip
        step={currentFeature}
        title={currentFeature.title}
        content={currentFeature.content}
        currentIndex={currentIndex}
        totalSteps={totalSteps}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        onComplete={handleComplete}
        targetRef={targetElement ? { current: targetElement } : targetRef}
        isVisible={isActive && currentFeature !== null}
      />
    </>
  );
}
