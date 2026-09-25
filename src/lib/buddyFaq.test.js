import { describe, it, expect } from 'vitest';
import { FAQ_ENTRIES, faqPageLabel, resolveLocalAnswer } from './buddyFaq';
import { ALLOWED_PAGES } from './voicePages';

describe('FAQ-Datenbank im Frontend', () => {
  it('verweist nur auf existierende, navigierbare App-Seiten', () => {
    for (const entry of FAQ_ENTRIES.filter(e => e.page)) {
      expect(ALLOWED_PAGES, `${entry.id} → ${entry.page}`).toContain(entry.page);
    }
  });

  it('hat für jede verlinkte Seite einen lesbaren Anzeigenamen', () => {
    for (const entry of FAQ_ENTRIES.filter(e => e.page)) {
      // Kein zusammengesetzter Routen-Key wie "GearMaintenance" in der
      // Oberfläche; einfache Keys wie "Quiz" sind zugleich der Anzeigename.
      const label = faqPageLabel(entry.page);
      if (label === entry.page) expect(entry.page).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it('läuft im Browser ohne API (Re-Export der geteilten Engine)', () => {
    expect(resolveLocalAnswer('Wie binde ich einen Palomar-Knoten?')?.entry.id).toBe('palomar');
  });
});
