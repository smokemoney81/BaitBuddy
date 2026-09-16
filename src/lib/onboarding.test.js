import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  DEFAULT_ONBOARDING,
  normalizeOnboarding,
  stepAt,
  shouldShowOnboarding,
  advance,
  goBack,
  skipOnboarding,
  completeOnboarding,
  restartOnboarding,
  progressPercent,
} from './onboarding';

describe('Schrittdefinition', () => {
  it('hat eindeutige IDs und beginnt mit Willkommen, endet mit Zusammenfassung', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('welcome');
    expect(ids.at(-1)).toBe('summary');
  });

  it('schreibt jeder Schritt in einen bekannten Präferenz-Bereich oder in keinen', () => {
    const known = new Set([null, 'buddy', 'fishing', 'angler', 'navigation']);
    for (const step of ONBOARDING_STEPS) {
      expect(known.has(step.section)).toBe(true);
      expect(step.title).toBeTruthy();
    }
  });

  it('begrenzt stepAt auf gültige Schritte', () => {
    expect(stepAt(-5).id).toBe('welcome');
    expect(stepAt(999).id).toBe('summary');
  });
});

describe('normalizeOnboarding', () => {
  it('liefert den Standard für unbrauchbare Eingaben', () => {
    expect(normalizeOnboarding(null)).toEqual(DEFAULT_ONBOARDING);
    expect(normalizeOnboarding('kaputt')).toEqual(DEFAULT_ONBOARDING);
    expect(normalizeOnboarding([])).toEqual(DEFAULT_ONBOARDING);
  });

  it('begrenzt den Schrittindex auf den gültigen Bereich', () => {
    expect(normalizeOnboarding({ stepIndex: -3 }).stepIndex).toBe(0);
    expect(normalizeOnboarding({ stepIndex: 999 }).stepIndex).toBe(ONBOARDING_STEP_COUNT - 1);
    expect(normalizeOnboarding({ stepIndex: 2.7 }).stepIndex).toBe(2);
    expect(normalizeOnboarding({ stepIndex: 'drei' }).stepIndex).toBe(0);
  });

  it('akzeptiert nur echte Wahrheitswerte und Zeichenketten', () => {
    const state = normalizeOnboarding({ completed: 'ja', skipped: 1, completedAt: 42 });
    expect(state.completed).toBe(false);
    expect(state.skipped).toBe(false);
    expect(state.completedAt).toBeNull();
  });
});

describe('shouldShowOnboarding', () => {
  it('zeigt es einem angemeldeten Nutzer, der es noch nicht durchlaufen hat', () => {
    expect(shouldShowOnboarding(DEFAULT_ONBOARDING, { canSave: true })).toBe(true);
  });

  it('zeigt es einem Gast nicht — ohne Konto ließe es sich nicht speichern', () => {
    expect(shouldShowOnboarding(DEFAULT_ONBOARDING, { canSave: false })).toBe(false);
  });

  it('zeigt es nach Abschluss oder Überspringen nicht erneut', () => {
    expect(shouldShowOnboarding({ completed: true }, { canSave: true })).toBe(false);
    expect(shouldShowOnboarding({ skipped: true }, { canSave: true })).toBe(false);
  });
});

describe('Navigation durch die Schritte', () => {
  it('geht vorwärts und rückwärts, ohne den Bereich zu verlassen', () => {
    let state = DEFAULT_ONBOARDING;
    state = advance(state);
    expect(state.stepIndex).toBe(1);
    state = goBack(state);
    expect(state.stepIndex).toBe(0);
    expect(goBack(state).stepIndex).toBe(0);
  });

  it('schließt ab, wenn vom letzten Schritt weitergegangen wird', () => {
    const state = advance({ stepIndex: ONBOARDING_STEP_COUNT - 1 });
    expect(state.completed).toBe(true);
    expect(state.completedAt).toBeTruthy();
  });

  it('merkt sich beim Überspringen den erreichten Schritt zum Fortsetzen', () => {
    const state = skipOnboarding({ stepIndex: 4 });
    expect(state).toMatchObject({ skipped: true, completed: false, stepIndex: 4 });
  });

  it('räumt beim Abschließen ein vorheriges Überspringen ab', () => {
    const state = completeOnboarding({ skipped: true, stepIndex: 2 });
    expect(state.skipped).toBe(false);
    expect(state.completed).toBe(true);
  });

  it('setzt beim Neustart den Fortschritt zurück', () => {
    expect(restartOnboarding()).toEqual(DEFAULT_ONBOARDING);
  });
});

describe('progressPercent', () => {
  it('rechnet von 0 bis 100', () => {
    expect(progressPercent({ stepIndex: 0 })).toBe(0);
    expect(progressPercent({ completed: true })).toBe(100);
    expect(progressPercent({ stepIndex: ONBOARDING_STEP_COUNT - 1 })).toBe(100);
  });
});
