import { describe, it, expect } from 'vitest';
import {
  FAQ_ENTRIES,
  FAQ_CATEGORIES,
  normalizeText,
  findFaqMatch,
  resolveLocalAnswer,
  getRelevantFaqEntries,
  buildFaqPromptSection,
  isActionRequest,
  needsPersonalContext,
  isFollowUpQuestion,
  pickFaqAnswer,
  getOfflineFallback,
} from './buddyFaq.js';

const idOf = (question) => findFaqMatch(question)?.entry.id ?? null;

describe('FAQ-Datenbank — Integrität', () => {
  it('hat eindeutige IDs und nur bekannte Kategorien', () => {
    const ids = FAQ_ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of FAQ_ENTRIES) {
      expect(FAQ_CATEGORIES[entry.category], entry.id).toBeTruthy();
    }
  });

  it('jeder Eintrag hat Frage, Begriffsgruppen und eine echte Antwort', () => {
    for (const entry of FAQ_ENTRIES) {
      expect(entry.question.length, entry.id).toBeGreaterThan(3);
      expect(entry.all.length, entry.id).toBeGreaterThan(0);
      for (const group of entry.all) expect(group.length, entry.id).toBeGreaterThan(0);
      const answers = Array.isArray(entry.answer) ? entry.answer : [entry.answer];
      for (const answer of answers) {
        expect(answer.length, entry.id).toBeGreaterThan(40);
        // Keine Platzhalter und keine dekorativen Emojis (CLAUDE.md).
        expect(answer, entry.id).not.toMatch(/TODO|lorem|coming soon|platzhalter/i);
        expect(answer, entry.id).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });

  it('Begriffe sind bereits normalisiert (sonst treffen sie nie)', () => {
    for (const entry of FAQ_ENTRIES) {
      for (const term of [...entry.all.flat(), ...(entry.any || [])]) {
        expect(normalizeText(term.replace(/\$$/, '')), `${entry.id}: ${term}`).toBe(term.replace(/\$$/, ''));
      }
    }
  });

  it('jeder Eintrag wird über seine eigene kanonische Frage sofort beantwortet', () => {
    for (const entry of FAQ_ENTRIES) {
      expect(idOf(entry.question), entry.question).toBe(entry.id);
      expect(resolveLocalAnswer(entry.question, { online: true })?.mode, entry.question).toBe('instant');
    }
  });
});

describe('normalizeText', () => {
  it('schreibt Umlaute aus und entfernt Satzzeichen', () => {
    expect(normalizeText('Welcher Köder für Hechte? Drop-Shot & Größe!')).toBe('welcher koeder fuer hechte drop shot groesse');
  });

  it('verträgt Nicht-Strings', () => {
    expect(normalizeText(null)).toBe('');
    expect(findFaqMatch(undefined)).toBeNull();
    expect(resolveLocalAnswer('')).toBeNull();
  });
});

describe('findFaqMatch — Trefferauswahl', () => {
  it('bevorzugt spezifische vor allgemeinen Einträgen', () => {
    expect(idOf('Welcher Köder ist gut für Hecht?')).toBe('hecht-koeder');
    expect(idOf('Welche Köder für Zander?')).toBe('zander-koeder');
    expect(idOf('Welcher Köder ist der beste?')).toBe('koeder-allgemein');
    expect(idOf('Wie binde ich einen Clinch-Knoten?')).toBe('clinch');
    expect(idOf('Welche Knoten brauche ich?')).toBe('knoten-allgemein');
  });

  it('erkennt Wortformen und zusammengesetzte Wörter', () => {
    expect(idOf('Wie fange ich Barsche?')).toBe('barsch');
    expect(idOf('Tipps für Bachforellen')).toBe('forelle');
    expect(idOf('Wie funktioniert Drop-Shot?')).toBe('dropshot');
    expect(idOf('Wie lagere ich Regenwürmer?')).toBe('wurm');
  });

  it('vermeidet bekannte Fehltreffer', () => {
    // "Drilling" (Haken) ist kein Drill, "Methode" kein Method Feeder,
    // "ein bisschen" kein Biss, "Regenbogenforelle" kein Regen.
    expect(idOf('Was ist ein Drilling?')).not.toBe('drill');
    expect(idOf('Welche Methode ist gut?')).not.toBe('feeder');
    expect(idOf('ein bisschen Hilfe bitte')).toBeNull();
    expect(idOf('Regenbogenforelle Köder')).toBe('forelle');
    expect(idOf('Was ist eine Gewässerkarte?')).toBe('gewaesserkarte');
  });
});

describe('resolveLocalAnswer — online (Sofort-Antwort ohne API)', () => {
  const instant = (q, opts) => resolveLocalAnswer(q, { online: true, ...opts });

  it('beantwortet allgemeine Standardfragen sofort', () => {
    for (const q of [
      'Hallo', 'Danke dir', 'Wer bist du?', 'Welcher Köder ist gut für Hecht?',
      'Wie führe ich einen Gummifisch?', 'Brauche ich einen Angelschein?',
      'Wie stelle ich die Bremse ein?', 'Was tun bei Gewitter?', 'Wann beißen Fische am besten?',
    ]) {
      const res = instant(q);
      expect(res?.mode, q).toBe('instant');
      expect(res.answer.length, q).toBeGreaterThan(20);
    }
  });

  it('liefert die passende App-Seite mit', () => {
    expect(instant('Wie funktioniert das Fangbuch?').page).toBe('Logbook');
    expect(instant('Wann ist Schonzeit?').page).toBe('RuleAssistant');
    expect(instant('Hallo').page).toBeNull();
  });

  it('überlässt persönliche, orts- und zeitbezogene Fragen der KI', () => {
    expect(instant('Wann ist heute die beste Angelzeit?')).toBeNull();
    expect(instant('Welche Köder passen zu meinen letzten Fängen?')).toBeNull();
    expect(instant('Was brauche ich für meinen nächsten Angelausflug?')).toBeNull();
  });

  it('überlässt App-Aktionen der KI (nur sie kann sie ausführen)', () => {
    expect(instant('Trag einen Karpfen in mein Fangbuch ein')).toBeNull();
    expect(instant('Öffne die Karte')).toBeNull();
    expect(instant('Kannst du mir zeigen, wie ein Gummifisch läuft?')).toBeNull();
  });

  it('überlässt speziellere Fragen der KI (zu geringe Abdeckung)', () => {
    expect(instant('Schonzeit Hecht Bayern')).toBeNull();
    expect(instant('Wie fange ich Zander im Winter?')).toBeNull();
    expect(instant('Hallo, ich hab eine Frage zu meinem Boot')).toBeNull();
  });

  it('überlässt Rückfragen im laufenden Gespräch der KI', () => {
    expect(instant('Und für Zander?', { inConversation: true })).toBeNull();
    expect(instant('Welcher Köder eignet sich dafür?', { inConversation: true })).toBeNull();
    // Ohne vorherigen Verlauf ist dieselbe Frage eigenständig.
    expect(instant('Und für Zander?', { inConversation: false })?.entry.id).toBe('zander');
  });
});

describe('resolveLocalAnswer — offline', () => {
  const offline = (q) => resolveLocalAnswer(q, { online: false });

  it('antwortet auch auf speziellere Fragen und sagt offen, dass es allgemein ist', () => {
    const res = offline('Schonzeit Hecht Bayern');
    expect(res.mode).toBe('offline');
    expect(res.entry.id).toBe('schonzeit');
    expect(res.answer).toMatch(/nur allgemein/);
  });

  it('beantwortet voll abgedeckte Fragen ohne Einschränkungs-Hinweis', () => {
    const res = offline('Wie binde ich einen Palomar-Knoten?');
    expect(res.entry.id).toBe('palomar');
    expect(res.answer).not.toMatch(/nur allgemein/);
  });

  it('erklärt bei Aktionen, dass sie ohne Verbindung nicht möglich sind', () => {
    expect(offline('Trag einen Karpfen in mein Fangbuch ein').answer).toMatch(/nichts in der App anlegen/);
  });

  it('liefert null statt einer Antwort am Thema vorbei', () => {
    expect(offline('Hallo, ich hab eine Frage zu meinem Boot')).toBeNull();
    expect(offline('Wie wird die Bundesliga ausgehen?')).toBeNull();
  });

  it('Fallback nennt die offline verfügbaren Themen', () => {
    expect(getOfflineFallback(() => 0)).toMatch(/Köder/);
    expect(getOfflineFallback(() => 0.99)).toMatch(/Knoten/);
  });
});

describe('Hilfs-Erkennung', () => {
  it('isActionRequest', () => {
    expect(isActionRequest('Bitte trag einen Hecht ein')).toBe(true);
    expect(isActionRequest('Speichere diesen Spot als See')).toBe(true);
    expect(isActionRequest('Kannst du mir die Karte öffnen?')).toBe(true);
    expect(isActionRequest('Kannst du mir erklären, wie ein Palomar geht?')).toBe(false);
    expect(isActionRequest('Wie speichere ich einen Spot?')).toBe(false);
  });

  it('needsPersonalContext', () => {
    expect(needsPersonalContext('Wie wird das Wetter morgen?')).toBe(true);
    expect(needsPersonalContext('Was beißt hier in der Nähe?')).toBe(true);
    expect(needsPersonalContext('Was sagen meine Fänge über den besten Köder?')).toBe(true);
    expect(needsPersonalContext('Welcher Köder passt zu meinen letzten Fängen?')).toBe(true);
    expect(needsPersonalContext('Plane meinen Trip')).toBe(true);
    // Besitzangaben ohne gespeicherte App-Daten bleiben allgemein.
    expect(needsPersonalContext('Wie pflege ich meine Rolle?')).toBe(false);
    expect(needsPersonalContext('Wie halte ich meinen Fang frisch?')).toBe(false);
  });

  it('isFollowUpQuestion', () => {
    expect(isFollowUpQuestion('Und im Winter?')).toBe(true);
    expect(isFollowUpQuestion('Was nehme ich dafür?')).toBe(true);
    expect(isFollowUpQuestion('Wie fange ich Zander?')).toBe(false);
  });
});

describe('pickFaqAnswer', () => {
  it('wiederholt eine Smalltalk-Variante nie direkt hintereinander', () => {
    const entry = FAQ_ENTRIES.find(e => e.id === 'begruessung');
    const first = pickFaqAnswer(entry, () => 0);
    const second = pickFaqAnswer(entry, () => 0);
    expect(second).not.toBe(first);
  });

  it('gibt Einzelantworten unverändert zurück', () => {
    const entry = FAQ_ENTRIES.find(e => e.id === 'palomar');
    expect(pickFaqAnswer(entry)).toBe(entry.answer);
  });
});

describe('Prompt-Abschnitt fürs Backend', () => {
  it('enthält nur die zur Frage passenden Einträge', () => {
    const section = buildFaqPromptSection('Welcher Köder ist gut für Hecht?');
    expect(section).toContain('GEPRÜFTES BUDDY-WISSEN');
    expect(section).toContain('Welcher Köder ist gut für Hecht?');
    expect(section).not.toContain('Wie binde ich einen Palomar-Knoten?');
    expect(getRelevantFaqEntries('Welcher Köder ist gut für Hecht?').length).toBeLessThanOrEqual(3);
  });

  it('lässt Smalltalk weg und ist bei fremden Themen leer', () => {
    expect(buildFaqPromptSection('Hallo')).toBe('');
    expect(buildFaqPromptSection('Wie wird die Bundesliga ausgehen?')).toBe('');
  });
});
