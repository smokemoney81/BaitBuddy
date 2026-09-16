import React, { useState } from 'react';
import { Compass, X } from 'lucide-react';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { useGuidedTour } from '@/contexts/GuidedTourContext';
import { shouldOfferTutorial } from '@/lib/tutorial';

// Bietet das Tutorial nach dem Onboarding einmal an (§4). Bewusst ein
// zurückhaltender Hinweis statt eines weiteren Modals: Der Nutzer hat gerade
// das Onboarding hinter sich, ein zweiter Pflichtdialog wäre zu viel.
//
// Vorher gab diese Datei `null` zurück — eine leere Hülle, die in Layout.jsx
// eingehängt war. Das Tutorial startete dadurch nie von selbst.
export default function FirstLoginTutorialPrompt() {
  const { tutorial, onboarding, canSave } = useBuddyPreferences();
  const { isActive, startTour, skipTour, isLoading } = useGuidedTour();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || isActive || dismissed) return null;
  if (!shouldOfferTutorial({ tutorial, onboarding, canSave })) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="tutorial-prompt-title"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-3xl border border-white/10 bg-[rgba(15,30,45,0.92)] backdrop-blur-xl p-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <Compass className="text-cyan-300 shrink-0 mt-0.5" size={22} aria-hidden="true" />
        <div className="flex-1">
          <h2 id="tutorial-prompt-title" className="font-semibold">Kurze Tour durch die App?</h2>
          <p className="bb-muted text-sm mt-1">
            Dein Buddy zeigt dir Dashboard, Karte, Fangbuch und die KI-Werkzeuge in wenigen
            Schritten. Du kannst jederzeit abbrechen.
          </p>
          <div className="flex gap-2 mt-3">
            <button type="button" className="bb-action" onClick={startTour}>Tour starten</button>
            <button type="button" className="bb-secondary" onClick={skipTour}>Nicht jetzt</button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Hinweis schließen"
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-white transition-colors duration-200"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
