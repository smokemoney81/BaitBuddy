import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

// Vertikale Planungs-Journey (Spec §4): gefüllter Punkt = erledigt,
// pulsierender Punkt = aktueller Schritt, dezenter Punkt = offen. Eine Linie
// verbindet die Schritte und füllt sich bis zum Fortschritt. Respektiert
// prefers-reduced-motion (kein Puls/keine Wachstums-Animation).
export default function TripJourney({ journey }) {
  const reduce = useReducedMotion();
  if (!journey || !Array.isArray(journey.steps)) return null;

  const { steps, completed, total } = journey;
  // Anteil der gefüllten Verbindungslinie: bis zur Mitte des letzten erledigten
  // Schritts. Bei 0 erledigt bleibt die Linie leer.
  const fillRatio = total > 1 ? Math.max(0, (completed - 0.5)) / (total - 1) : 0;

  return (
    <ol className="relative mt-1" aria-label="Planungsfortschritt">
      {/* Hintergrund-Rail */}
      <span aria-hidden="true" className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-white/10 rounded-full" />
      {/* Gefüllte Rail bis zum Fortschritt */}
      <motion.span
        aria-hidden="true"
        className="absolute left-[11px] top-2 w-0.5 bg-cyan-400/70 rounded-full origin-top"
        style={{ bottom: 8 }}
        initial={reduce ? false : { scaleY: 0 }}
        animate={{ scaleY: Math.min(1, Math.max(0, fillRatio)) }}
        transition={reduce ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
      />
      {steps.map((step, i) => {
        const isCurrent = i === journey.currentIndex;
        return (
          <li key={step.id} className="relative flex items-start gap-3 pl-0 py-1.5 min-h-[36px]">
            <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
              {step.complete ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-slate-950">
                  <Check size={14} strokeWidth={3} aria-hidden="true" />
                </span>
              ) : isCurrent ? (
                <span className="relative flex h-6 w-6 items-center justify-center">
                  {!reduce && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/50" />
                  )}
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-cyan-400 ring-2 ring-cyan-300/60" />
                </span>
              ) : (
                <span className="inline-flex h-3 w-3 rounded-full bg-white/20" />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={`text-sm ${step.complete ? 'text-slate-100' : isCurrent ? 'text-cyan-300 font-medium' : 'text-slate-400'}`}>
                {step.label}
              </span>
              {step.value != null && step.value !== '' && step.id !== 'checklist' && (
                <span className="text-xs text-slate-400 truncate">{String(step.value)}</span>
              )}
              {step.id === 'checklist' && step.complete && (
                <span className="text-xs text-slate-400">{step.value} Punkte</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
