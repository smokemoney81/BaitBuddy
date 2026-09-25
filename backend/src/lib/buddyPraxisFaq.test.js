import { describe, it, expect } from 'vitest';
import {
  PRAXIS_FAQ_ENTRIES,
  getRelevantPraxisEntries,
  buildPraxisPromptSection,
} from './buddyPraxisFaq.js';

const KATEGORIEN = new Set([
  'Ausrüstung', 'Köder', 'Angeltechniken', 'Gewässerkunde', 'Fischarten',
  'Recht & Lizenzen', 'Sicherheit', 'Umwelt & Nachhaltigkeit', 'Saison & Zeiten',
  'Pflege & Verarbeitung',
]);

describe('Praxis-FAQ — Integrität', () => {
  it('parst genau 500 Einträge', () => {
    expect(PRAXIS_FAQ_ENTRIES.length).toBe(500);
  });

  it('hat eindeutige IDs von 1 bis 500', () => {
    const ids = PRAXIS_FAQ_ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(500);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(500);
  });

  it('jeder Eintrag hat Frage, echte Antwort, bekannte Kategorie und Suchbegriffe', () => {
    for (const entry of PRAXIS_FAQ_ENTRIES) {
      expect(entry.question.length, entry.id).toBeGreaterThan(5);
      expect(entry.answer.length, entry.id).toBeGreaterThan(40);
      expect(KATEGORIEN.has(entry.category), `${entry.id}: ${entry.category}`).toBe(true);
      expect(entry.terms.length, entry.id).toBeGreaterThan(0);
      // Keine Platzhalter, keine dekorativen Emojis (CLAUDE.md).
      expect(entry.answer, entry.id).not.toMatch(/TODO|lorem|coming soon|platzhalter/i);
      expect(entry.answer, entry.id).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('jeder Eintrag ist über seine eigene Frage auffindbar', () => {
    for (const entry of PRAXIS_FAQ_ENTRIES) {
      const ids = getRelevantPraxisEntries(entry.question, { limit: 5 }).map(e => e.id);
      expect(ids, entry.question).toContain(entry.id);
    }
  });
});

describe('Praxis-FAQ — Retrieval', () => {
  it('findet thematisch passende Einträge', () => {
    const ids = getRelevantPraxisEntries('Was ist ein Gummifisch?').map(e => e.id);
    expect(ids).toContain(71);
    const rechtIds = getRelevantPraxisEntries('Brauche ich einen Fischereischein?').map(e => e.id);
    expect(rechtIds.some(id => id >= 251 && id <= 300)).toBe(true);
  });

  it('bleibt bei fremden Themen leer', () => {
    expect(getRelevantPraxisEntries('Wie wird die Bundesliga ausgehen?')).toEqual([]);
    expect(buildPraxisPromptSection('Hallo')).toBe('');
  });

  it('liefert einen Prompt-Block mit geprüftem Wissen', () => {
    const section = buildPraxisPromptSection('Wie stelle ich die Rollenbremse ein?');
    expect(section).toContain('GEPRÜFTES PRAXISWISSEN');
    expect(getRelevantPraxisEntries('Wie stelle ich die Rollenbremse ein?').length).toBeLessThanOrEqual(2);
  });
});
