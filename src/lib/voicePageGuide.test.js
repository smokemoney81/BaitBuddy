import { describe, it, expect, beforeEach } from 'vitest';
import {
  PAGE_VOICE_INTROS, pageIntroToSpeak, markPageIntroSpoken, INTRO_COOLDOWN_MS,
  buildOpenTasksHint, tasksHintDue, markTasksHintSpoken, TASKS_COOLDOWN_MS,
} from './voicePageGuide';
import { buildQuestionSpeech } from '@/hooks/useReadAloud';

beforeEach(() => localStorage.clear());

describe('Seiten-Einleitung', () => {
  it('spricht einmal und dann erst nach 7 Tagen wieder', () => {
    const now = 1_000_000_000_000;
    expect(pageIntroToSpeak('Quiz', now)).toBe(PAGE_VOICE_INTROS.Quiz);
    markPageIntroSpoken('Quiz', now);
    expect(pageIntroToSpeak('Quiz', now + 1000)).toBeNull();
    expect(pageIntroToSpeak('Quiz', now + INTRO_COOLDOWN_MS)).toBe(PAGE_VOICE_INTROS.Quiz);
  });

  it('kennt unbekannte Seiten nicht', () => {
    expect(pageIntroToSpeak('KiBuddyBeta')).toBeNull();
  });
});

describe('Hinweis auf offene Aufgaben', () => {
  it('nennt fehlende Trip-Schritte aus echten Plan-Daten', () => {
    const hint = buildOpenTasksHint({ nextTrip: { target_fish: 'Zander', planned_date: '2026-10-01' } });
    expect(hint).toContain('Zander-Trip');
    expect(hint).toContain('Ort');
    expect(hint).not.toContain('Zielfisch');
  });

  it('erinnert an nicht abgeschlossenes Onboarding, nicht an übersprungenes', () => {
    expect(buildOpenTasksHint({ onboarding: { completed: false, skipped: false } })).toContain('Einrichtung');
    expect(buildOpenTasksHint({ onboarding: { completed: false, skipped: true } })).toBeNull();
  });

  it('bleibt still ohne offene Aufgaben', () => {
    expect(buildOpenTasksHint({})).toBeNull();
  });

  it('hält 6 Stunden Pause', () => {
    const now = 2_000_000_000_000;
    expect(tasksHintDue(now)).toBe(true);
    markTasksHintSpoken(now);
    expect(tasksHintDue(now + 1000)).toBe(false);
    expect(tasksHintDue(now + TASKS_COOLDOWN_MS)).toBe(true);
  });
});

describe('buildQuestionSpeech', () => {
  it('liest Frage und alle Antworten mit Buchstaben vor', () => {
    const text = buildQuestionSpeech({ index: 0, total: 10, question: 'Was ist eine Pose?', answers: ['Ein Schwimmer', 'Ein Gewicht'] });
    expect(text).toBe('Frage 1 von 10. Was ist eine Pose? Antworten. A: Ein Schwimmer. B: Ein Gewicht.');
  });
});
