import { describe, it, expect } from 'vitest';
import { checkSubmission, targetSpeciesList, maxLengthFor, classifyReviewPriority } from './submissionPlausibility.js';

const NOW = new Date('2026-09-24T12:00:00Z').getTime();
const EVENT = { start_date: '2026-09-20T00:00:00Z', end_date: '2026-09-30T00:00:00Z', target_species: 'Zander, Hecht und Barsch' };
const base = { species: 'Zander', length_cm: 62, weight_kg: 2.1, photo_url: 'https://x/p.jpg', catch_time: '2026-09-23T19:42:00Z' };

const failed = (result) => result.checks.filter(c => !c.ok).map(c => c.id);

describe('checkSubmission', () => {
  it('lässt einen stimmigen Fang ohne Prüfung zu', () => {
    const result = checkSubmission(base, EVENT, { now: NOW });
    expect(result).toMatchObject({ blocked: false, needsReview: false });
    expect(failed(result)).toEqual([]);
  });

  it('blockiert Fänge außerhalb des Zeitraums und in der Zukunft', () => {
    expect(checkSubmission({ ...base, catch_time: '2026-09-10T10:00:00Z' }, EVENT, { now: NOW }).blocked).toBe(true);
    expect(checkSubmission({ ...base, catch_time: '2026-09-24T14:00:00Z' }, EVENT, { now: NOW }).blocked).toBe(true);
  });

  it('blockiert Arten, die nicht gewertet werden', () => {
    const result = checkSubmission({ ...base, species: 'Karpfen', weight_kg: null }, EVENT, { now: NOW });
    expect(result.blocked).toBe(true);
    expect(failed(result)).toContain('species');
  });

  it('schickt übergroße Fische, unstimmiges Gewicht und fehlendes Foto in die Prüfung', () => {
    expect(failed(checkSubmission({ ...base, length_cm: 140, weight_kg: null }, EVENT, { now: NOW }))).toEqual(['length']);
    expect(failed(checkSubmission({ ...base, weight_kg: 40 }, EVENT, { now: NOW }))).toEqual(['condition']);
    const noPhoto = checkSubmission({ ...base, photo_url: null }, EVENT, { now: NOW });
    expect(noPhoto).toMatchObject({ blocked: false, needsReview: true });
  });

  it('erkennt Doppelmeldungen', () => {
    const recent = [{ species: 'zander', length_cm: 62, catch_time: '2026-09-23T19:40:00Z' }];
    expect(failed(checkSubmission(base, EVENT, { now: NOW, recent }))).toEqual(['duplicate']);
  });

  it('prüft alles, wenn der Veranstalter Freigabe verlangt', () => {
    expect(checkSubmission(base, { ...EVENT, requires_approval: true }, { now: NOW }).needsReview).toBe(true);
  });

  it('wertet jede Art, wenn keine Zielart gesetzt ist', () => {
    expect(checkSubmission({ ...base, species: 'Rotauge', length_cm: 30, weight_kg: 0.4 }, { ...EVENT, target_species: null }, { now: NOW }).blocked).toBe(false);
  });
});

describe('Hilfsfunktionen', () => {
  it('zerlegt Zielarten-Listen', () => {
    expect(targetSpeciesList('Zander · Hecht / Barsch')).toEqual(['Zander', 'Hecht', 'Barsch']);
    expect(targetSpeciesList(null)).toEqual([]);
  });

  it('kennt Höchstlängen auch in zusammengesetzten Namen', () => {
    expect(maxLengthFor('Spiegelkarpfen')).toBe(130);
    expect(maxLengthFor('Großer Hecht')).toBe(150);
    expect(maxLengthFor('Unbekannt')).toBeNull();
  });
});

describe('classifyReviewPriority', () => {
  it('ist low ohne fehlgeschlagene review-Checks', () => {
    expect(classifyReviewPriority([{ id: 'photo', ok: true, severity: 'review' }])).toBe('low');
    expect(classifyReviewPriority([])).toBe('low');
  });

  it('ist medium bei genau einer Auffaelligkeit', () => {
    expect(classifyReviewPriority([{ id: 'photo', ok: false, severity: 'review' }])).toBe('medium');
  });

  it('ist high bei mehreren Auffaelligkeiten', () => {
    expect(classifyReviewPriority([
      { id: 'photo', ok: false, severity: 'review' },
      { id: 'length', ok: false, severity: 'review' },
    ])).toBe('high');
  });

  it('ignoriert block-Checks (die kommen hier nie an, aber sicherheitshalber)', () => {
    expect(classifyReviewPriority([{ id: 'time', ok: false, severity: 'block' }])).toBe('low');
  });
});
