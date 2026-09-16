import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Play, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import {
  ONBOARDING_STEP_COUNT,
  restartOnboarding,
  stepAt,
} from '@/lib/onboarding';

export default function OnboardingSettings() {
  const { onboarding, saveOnboarding, canSave, saving } = useBuddyPreferences();
  const [busy, setBusy] = useState(false);

  const run = async (next, message) => {
    setBusy(true);
    try {
      await saveOnboarding(next);
      toast.success(message);
    } catch (error) {
      toast.error(error.message || 'Die Einstellung konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  const status = onboarding.completed
    ? 'Abgeschlossen'
    : onboarding.skipped
      ? `Pausiert bei Schritt ${onboarding.stepIndex + 1} von ${ONBOARDING_STEP_COUNT}: ${stepAt(onboarding.stepIndex).title}`
      : `Offen bei Schritt ${onboarding.stepIndex + 1} von ${ONBOARDING_STEP_COUNT}: ${stepAt(onboarding.stepIndex).title}`;

  return (
    <section className="bb-app bb-card space-y-6" aria-labelledby="onboarding-settings-title">
      <div>
        <p className="bb-eyebrow mb-2">Einführung</p>
        <h2 id="onboarding-settings-title" className="text-xl font-semibold">Dein Onboarding</h2>
        <p className="bb-muted mt-2">
          Im Onboarding lernt dein Buddy deine Zielfische, Methoden, Gewässer und deine Region
          kennen. Ein Neustart setzt nur den Ablauf zurück — deine Angaben bleiben erhalten und
          lassen sich dabei korrigieren.
        </p>
      </div>

      <p className="text-sm">
        <span className="bb-muted">Status: </span>{status}
      </p>

      <div className="flex flex-wrap gap-2">
        {onboarding.skipped && !onboarding.completed && (
          <button
            type="button"
            className="bb-action"
            disabled={!canSave || busy || saving}
            onClick={() => run({ ...onboarding, skipped: false }, 'Onboarding wird fortgesetzt.')}
          >
            <Play size={18} aria-hidden="true" /> Fortsetzen
          </button>
        )}
        <button
          type="button"
          className="bb-secondary"
          disabled={!canSave || busy || saving}
          onClick={() => run(restartOnboarding(), 'Onboarding startet von vorn.')}
        >
          <RotateCcw size={18} aria-hidden="true" /> Erneut starten
        </button>
      </div>

      {!canSave && (
        <p className="bb-muted">Melde dich an, um das Onboarding zu starten.</p>
      )}

      <div className="pt-2 border-t border-white/10">
        <p className="bb-muted text-sm mb-3">
          Was dein Buddy aus deinen Angaben und Fängen ableitet, siehst du im
          Transparenzbereich — dort lässt sich auch jede Annahme korrigieren oder löschen.
        </p>
        <Link className="bb-secondary inline-flex" to="/BuddyKnowsYou">
          <Eye size={18} aria-hidden="true" /> Das weiß BaitBuddy über dich
        </Link>
      </div>
    </section>
  );
}
