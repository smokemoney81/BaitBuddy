import { describe, it, expect } from 'vitest';
import {
  TUTORIAL_LEVELS,
  DEFAULT_TUTORIAL,
  normalizeTutorial,
  shouldOfferTutorial,
  startTutorial,
  advanceTutorial,
  skipTutorial,
  completeTutorial,
  restartTutorial,
} from './tutorial';

describe('normalizeTutorial', () => {
  it('liefert den Standard fuer unbrauchbare Eingaben', () => {
    expect(normalizeTutorial(null)).toEqual(DEFAULT_TUTORIAL);
    expect(normalizeTutorial('kaputt')).toEqual(DEFAULT_TUTORIAL);
    expect(normalizeTutorial([])).toEqual(DEFAULT_TUTORIAL);
  });

  it('akzeptiert nur bekannte Level', () => {
    for (const level of TUTORIAL_LEVELS) {
      expect(normalizeTutorial({ level }).level).toBe(level);
    }
    expect(normalizeTutorial({ level: 'grossmeister' }).level).toBe('beginner');
  });

  it('haelt den Schritt bei mindestens 0 und ganzzahlig', () => {
    expect(normalizeTutorial({ step: -4 }).step).toBe(0);
    expect(normalizeTutorial({ step: 3.8 }).step).toBe(3);
    expect(normalizeTutorial({ step: 'drei' }).step).toBe(0);
  });

  it('akzeptiert nur echte Wahrheitswerte', () => {
    expect(normalizeTutorial({ completed: 'ja', skipped: 1 })).toMatchObject({
      completed: false, skipped: false,
    });
  });
});

describe('shouldOfferTutorial', () => {
  const done = { completed: true };

  it('bietet es nach abgeschlossenem Onboarding an', () => {
    expect(shouldOfferTutorial({ tutorial: {}, onboarding: done, canSave: true })).toBe(true);
  });

  it('bietet es auch an, wenn das Onboarding uebersprungen wurde', () => {
    expect(shouldOfferTutorial({ tutorial: {}, onboarding: { skipped: true }, canSave: true })).toBe(true);
  });

  it('wartet, solange das Onboarding noch laeuft — zwei Overlays waeren nicht bedienbar', () => {
    expect(shouldOfferTutorial({ tutorial: {}, onboarding: {}, canSave: true })).toBe(false);
    expect(shouldOfferTutorial({ tutorial: {}, onboarding: null, canSave: true })).toBe(false);
  });

  it('bietet es einem Gast nicht an', () => {
    expect(shouldOfferTutorial({ tutorial: {}, onboarding: done, canSave: false })).toBe(false);
  });

  it('bietet es nach Abschluss oder Ueberspringen nicht erneut an', () => {
    expect(shouldOfferTutorial({ tutorial: { completed: true }, onboarding: done, canSave: true })).toBe(false);
    expect(shouldOfferTutorial({ tutorial: { skipped: true }, onboarding: done, canSave: true })).toBe(false);
  });
});

describe('Zustandsuebergaenge', () => {
  it('startet immer beim ersten Schritt und hebt ein Ueberspringen auf', () => {
    expect(startTutorial({ skipped: true, step: 7 })).toMatchObject({
      skipped: false, completed: false, step: 0,
    });
  });

  it('behaelt das Level ueber alle Uebergaenge', () => {
    const base = { level: 'professional' };
    expect(startTutorial(base).level).toBe('professional');
    expect(skipTutorial(base).level).toBe('professional');
    expect(completeTutorial(base).level).toBe('professional');
    expect(restartTutorial(base).level).toBe('professional');
  });

  it('springt zu einem Schritt und faengt unbrauchbare Werte ab', () => {
    expect(advanceTutorial({}, 5).step).toBe(5);
    expect(advanceTutorial({}, -2).step).toBe(0);
    expect(advanceTutorial({}, undefined).step).toBe(0);
  });

  it('merkt sich beim Ueberspringen den erreichten Schritt', () => {
    expect(skipTutorial({ step: 4 })).toMatchObject({ skipped: true, completed: false, step: 4 });
  });

  it('raeumt beim Abschliessen ein vorheriges Ueberspringen ab', () => {
    expect(completeTutorial({ skipped: true, step: 9 })).toMatchObject({
      completed: true, skipped: false, step: 0,
    });
  });

  it('macht das Tutorial beim Neustart wieder verfuegbar', () => {
    const restarted = restartTutorial({ completed: true, skipped: true, step: 9 });
    expect(restarted).toMatchObject({ completed: false, skipped: false, step: 0 });
    expect(shouldOfferTutorial({ tutorial: restarted, onboarding: { completed: true }, canSave: true })).toBe(true);
  });
});
