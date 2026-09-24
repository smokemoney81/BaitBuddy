import React, { useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, CheckCircle } from 'lucide-react';

/**
 * MapModeManager - Verwaltet Map-Modi und initialisiert Guided Tours
 * Bietet Onboarding für neue Nutzer und Modus-Verwaltung
 */
function MapModeManager({
  mapMode = 'guided',
  onModeChange,
  isFirstTime = true,
  onTourComplete,
}) {
  const [showTour, setShowTour] = useState(isFirstTime);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [_showModeSelector, _setShowModeSelector] = useState(false);

  const guidedTour = [
    {
      id: 'welcome',
      title: 'Willkommen zu BaitBuddy Maps!',
      description: 'Diese interaktive Tour zeigt dir die Grundlagen der Karte und welche Funktionen verfügbar sind.',
      icon: '🗺️',
      details: [
        'Spots hinzufügen und verwalten',
        'Live-Touren tracken',
        'Intelligente Fang-Vorhersagen',
        'Offline-Karten nutzen',
      ],
    },
    {
      id: 'quick-actions',
      title: 'Schnellaktionen',
      description: 'Die wichtigsten Funktionen sind oben im Hub verfügbar:',
      icon: '🚀',
      details: [
        'Klicke auf die Karte um einen Spot hinzuzufügen',
        'Starte eine Live-Tour für GPS-Tracking',
        'Sehe Gezeiten & Solunar-Daten in Echtzeit',
      ],
      actionText: 'Neuen Spot hinzufügen',
      onAction: () => toast.info('Klicke auf ein Gewässer auf der Karte!'),
    },
    {
      id: 'visualizations',
      title: 'Kartenschichten',
      description: 'Erweitere deine Kartenansicht mit verschiedenen Visualisierungen:',
      icon: '🎨',
      details: [
        'Relief-Shading: Bessere räumliche Wahrnehmung',
        'Satelliten-Bilder: Präzise Luftaufnahmen',
        '3D-Gelände: Immersive Höhenvisualisierung',
      ],
    },
    {
      id: 'water-data',
      title: 'Gewässerdaten',
      description: 'Wissenschaftliche Daten für bessere Fänge:',
      icon: '💧',
      details: [
        'Gezeiten: Echtzeit + 7-Tage-Vorhersage (NOAA)',
        'Solunar: Mondphase + Fresszeiten-Berechnung',
        'Hydrographische Daten: Temperatur, Strömung, Tiefe',
      ],
    },
    {
      id: 'ai-features',
      title: 'Intelligente Features',
      description: 'KI nutzt alle Daten für bessere Vorhersagen:',
      icon: '🤖',
      details: [
        'KI-Fang-Vorhersage: Wahrscheinlichkeit der aktuellen Art',
        'Smart Notifications: Warnt bei optimalen Bedingungen',
        'Lernfähig: Je mehr Fänge, desto besser die Vorhersagen',
      ],
    },
    {
      id: 'offline',
      title: 'Offline & Performance',
      description: 'Funktioniert auch ohne Internetverbindung:',
      icon: '📡',
      details: [
        'Automatisches Tile-Caching für Offline-Nutzung',
        'Komprimierung spart Speicherplatz',
        'Cache-Statistiken zeigen Hit-Rate & Größe',
      ],
    },
    {
      id: 'modes',
      title: 'Lernmodi',
      description: 'Wähle den Modus der zu dir passt:',
      icon: '⚙️',
      details: [
        'Geführt: Features werden erklärt (dein aktueller Modus)',
        'Einfach: Nur wichtigste Funktionen',
        'Erweitert: Alle Features sofort sichtbar',
      ],
    },
    {
      id: 'complete',
      title: 'Du bist bereit!',
      description: 'Du kennst jetzt die Grundlagen der BaitBuddy-Karte. Viel Erfolg beim Angeln!',
      icon: '✨',
      details: [
        'Tipp: Nutze den Map Navigation Hub um Features zu entdecken',
        'Du kannst diese Tour jederzeit neu starten',
        'Los geht\'s - viel Spaß beim Angeln!',
      ],
      isFinal: true,
    },
  ];

  const modes = {
    guided: {
      name: 'Geführter Modus',
      description: 'Perfekt für Anfänger - Features werden Schritt für Schritt erklärt',
      features: [
        'Tooltips bei allen Funktionen',
        'Guided Tours & Tutorials',
        'Kontextsensitive Hilfe',
        'Vereinfachte Ansicht',
      ],
      benefits: [
        'Lerne die App Schritt für Schritt',
        'Keine überwältigende Informationsflut',
        'Tipps beim Hover',
        'Sichere Einstellungen',
      ],
    },
    simple: {
      name: 'Einfacher Modus',
      description: 'Für gelegentliche Nutzer - nur die wichtigsten Funktionen',
      features: [
        'Minimale UI-Komplexität',
        'Häufigste Funktionen sichtbar',
        'Schnelle Aktionen',
        'Weniger Optionen',
      ],
      benefits: [
        'Schneller Zugriff auf häufige Features',
        'Aufgeräumtes Interface',
        'Weniger Ablenkung',
        'Mobile-freundlich',
      ],
    },
    advanced: {
      name: 'Erweiterter Modus',
      description: 'Für Power-User - alle Features sofort zugänglich',
      features: [
        'Alle Layer aktivierbar',
        'Erweiterte Einstellungen',
        'Keine Einschränkungen',
        'Developer-Optionen',
      ],
      benefits: [
        'Voller Zugriff auf alle Features',
        'Keine Lernkurve nötig',
        'Maximum Kontrolle',
        'Für Experten optimiert',
      ],
    },
  };

  const handleStepNext = () => {
    setCompletedSteps([...completedSteps, currentStep]);
    if (currentStep < guidedTour.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleTourComplete();
    }
  };

  const handleTourComplete = () => {
    setShowTour(false);
    localStorage.setItem('mapTourCompleted', 'true');
    localStorage.setItem('mapModeSelected', mapMode);
    if (onTourComplete) {
      onTourComplete();
    }
  };

  const currentTourStep = guidedTour[currentStep];
  const progress = ((currentStep + 1) / guidedTour.length) * 100;

  if (showTour) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-gray-900 border-2 border-cyan-600 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border-b border-cyan-600 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-4xl">{currentTourStep.icon}</div>
              <button type="button"
                onClick={() => setShowTour(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>

            <h2 className="text-2xl font-bold text-cyan-300 mb-2">{currentTourStep.title}</h2>
            <p className="text-gray-400">{currentTourStep.description}</p>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Schritt {currentStep + 1} von {guidedTour.length}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Details */}
            <div className="space-y-2">
              {currentTourStep.details.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-3 text-gray-300">
                  <div className="text-lg mt-0.5">•</div>
                  <span className="text-sm">{detail}</span>
                </div>
              ))}
            </div>

            {/* Mode Selection (nur auf welcome step) */}
            {currentTourStep.id === 'welcome' && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                <div className="font-semibold text-blue-300 mb-3">Welcher Modus passt zu dir?</div>
                <div className="space-y-2">
                  {Object.entries(modes).map(([modeKey, modeData]) => (
                    <button type="button"
                      key={modeKey}
                      onClick={() => {
                        onModeChange(modeKey);
                        handleStepNext();
                      }}
                      className={`w-full text-left p-3 rounded border-2 transition ${
                        mapMode === modeKey
                          ? 'bg-cyan-900/40 border-cyan-600'
                          : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="font-semibold text-sm text-cyan-400">{modeData.name}</div>
                      <div className="text-xs text-gray-400 mt-1">{modeData.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Button (wenn vorhanden) */}
            {currentTourStep.actionText && (
              <button type="button"
                onClick={currentTourStep.onAction}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2 rounded-lg font-semibold transition"
              >
                {currentTourStep.actionText}
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-800/80 border-t border-cyan-600 p-6 flex items-center justify-between gap-3">
            <button type="button"
              onClick={() => setShowTour(false)}
              className="px-4 py-2 text-gray-300 hover:text-gray-100 text-sm font-medium transition"
            >
              Später
            </button>

            {currentTourStep.isFinal ? (
              <button type="button"
                onClick={handleTourComplete}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-semibold transition"
              >
                <CheckCircle className="w-4 h-4" />
                Tour abschließen
              </button>
            ) : (
              <button type="button"
                onClick={handleStepNext}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-semibold transition"
              >
                Weiter
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default MapModeManager;
