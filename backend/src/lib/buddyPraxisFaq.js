// Such-Engine für die Praxis-FAQ (buddyPraxisFaq.data.js, 500 Einträge).
//
// Zweck: Zu einer Nutzerfrage die inhaltlich passendsten Praxis-Einträge finden
// und als geprüftes Zusatzwissen in den LLM-Prompt des Buddys geben. Die
// kompakte, feinjustierte buddyFaq.js bleibt für Sofort-/Offline-Antworten
// zuständig; diese Sammlung erweitert nur den Prompt-Kontext.
//
// Reines JavaScript ohne Abhängigkeiten (läuft im Browser und im Backend). Die
// Normalisierung wird aus buddyFaq.js wiederverwendet, damit beide Engines
// Begriffe identisch vergleichen.

import { normalizeText } from './buddyFaq.js';
import { PRAXIS_FAQ_RAW } from './buddyPraxisFaq.data.js';

// Füllwörter und neutrale Frage-/Angel-Wörter, die keine Themenzuordnung
// erlauben — bewusst schlank gehalten, da hier nur gerankt (nicht sofort
// beantwortet) wird.
const STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mir', 'mich', 'dir', 'dich', 'uns', 'euch', 'sich', 'man',
  'und', 'oder', 'aber', 'auch', 'noch', 'schon', 'nur', 'mit', 'ohne', 'fuer', 'von', 'vom', 'zu',
  'zum', 'zur', 'im', 'in', 'am', 'an', 'auf', 'aus', 'bei', 'beim', 'nach', 'ueber', 'unter', 'vor',
  'ist', 'sind', 'bin', 'bist', 'war', 'waren', 'wird', 'werden', 'hat', 'habe', 'hab', 'hast', 'haben',
  'sein', 'so', 'sehr', 'mal', 'ja', 'nein', 'doch', 'da', 'dann', 'denn', 'wenn', 'als', 'wie', 'was',
  'wo', 'wann', 'warum', 'wieso', 'weshalb', 'womit', 'wer', 'welche', 'welcher', 'welches', 'welchen',
  'kann', 'kannst', 'koennen', 'soll', 'sollte', 'sollen', 'muss', 'musst', 'muessen', 'brauche',
  'brauchst', 'brauchen', 'gibt', 'geht', 'gute', 'guter', 'gutes', 'gut', 'best', 'beste', 'besten',
  'mache', 'machen', 'macht', 'benutze', 'benutzen', 'nutze', 'nutzen', 'angeln', 'angle', 'fischen',
  'fisch', 'fische', 'darf', 'duerfen', 'immer', 'meine', 'meinen', 'meinem', 'meiner', 'mein',
  'wasser', 'gewaesser', 'angler', 'angelplatz',
  'gehen', 'kommen', 'bleiben', 'liegen', 'stehen', 'bringen', 'lassen', 'geben', 'nehmen',
  'wichtig', 'wichtige', 'wichtigen', 'wichtiger', 'wichtigste', 'wichtigsten', 'richtig',
]);

function contentTokens(text) {
  return normalizeText(text)
    .split(' ')
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

// Jeder Eintrag wird einmalig geparst und mit einem normalisierten Begriffs-Set
// (aus Frage + Tags) vorbereitet. Das Parsen läuft tolerant: eine fehlerhafte
// Zeile wird übersprungen statt das ganze Modul zu sprengen.
function parseEntries(raw) {
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!obj || !obj.frage || !obj.antwort) continue;
    const tags = typeof obj.tags === 'string' ? obj.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
    const tagTerms = new Set(tags.flatMap(t => contentTokens(t)));
    // Der erste Tag ist das Kernthema des Eintrags — Treffer darauf wiegen am
    // stärksten, damit bei überlappenden Themen der passendste Eintrag oben steht.
    const primaryTerms = new Set(contentTokens(tags[0] || ''));
    // Begriffe als Array (Frage + Tags), damit Präfix-/Teilstring-Treffer wie in
    // der Haupt-Engine möglich sind (z. B. Frage "Pop-up" → Tag "popup").
    const terms = [...new Set([...contentTokens(obj.frage), ...tagTerms])];
    entries.push({
      id: obj.id,
      question: obj.frage,
      answer: obj.antwort,
      category: obj.kategorie || '',
      tags,
      terms,
      tagTerms,
      primaryTerms,
    });
  }
  return entries;
}

export const PRAXIS_FAQ_ENTRIES = parseEntries(PRAXIS_FAQ_RAW);

// Trifft ein Fragewort einen Eintragsbegriff? Gleichheit, oder Begriff beginnt
// mit dem Fragewort (ab 3 Zeichen), oder enthält es (ab 5 Zeichen) — analog zur
// Haupt-Engine, damit Wortformen und Kompositа greifen.
function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function termMatches(token, term) {
  const [short, long] = token.length <= term.length ? [token, term] : [term, token];
  if (short === long) return true;
  // Einer ist Präfix des anderen (ab 3 Zeichen) — deckt Wortformen ab.
  if (short.length >= 3 && long.startsWith(short)) return true;
  // Der kürzere steckt im längeren (ab 5 Zeichen).
  if (short.length >= 5 && long.includes(short)) return true;
  // Gemeinsamer Wortstamm bei Flexionen (z. B. "feederangeln"/"feedern"):
  // langer gemeinsamer Präfix (>= 5), der fast das ganze kürzere Wort abdeckt.
  const cp = commonPrefixLength(short, long);
  return cp >= 5 && cp >= short.length - 1;
}

/**
 * Bewertet einen Eintrag gegen die Fragewörter: 2 Punkte je Tag-Treffer
 * (thematisch stark), 1 Punkt je sonstigem Frage-Wort-Treffer. 0 = kein Bezug.
 */
function scoreEntry(entry, queryTokens) {
  let score = 0;
  for (const token of queryTokens) {
    let best = 0;
    for (const term of entry.terms) {
      if (!termMatches(token, term)) continue;
      // Rolle des Begriffs: Kernthema (erster Tag) = 3, sonstiger Tag = 2,
      // reines Frage-Wort = 1. Exakter Wortlaut gibt +2 — so gewinnt der
      // kanonische Eintrag sein eigenes Kompositum gegen bloß verwandte.
      const role = entry.primaryTerms.has(term) ? 3 : entry.tagTerms.has(term) ? 2 : 1;
      best = Math.max(best, role + (term === token ? 2 : 0));
    }
    score += best;
  }
  return score;
}

/**
 * Die bis zu `limit` inhaltlich passendsten Praxis-Einträge zu einer Frage.
 * Nur Einträge mit klarem Bezug (>= minScore) werden zurückgegeben, damit der
 * Prompt bei fremden Themen leer bleibt.
 */
export function getRelevantPraxisEntries(question, { limit = 2, minScore = 1 } = {}) {
  const queryTokens = [...new Set(contentTokens(question))];
  if (!queryTokens.length) return [];
  const ranked = [];
  for (const entry of PRAXIS_FAQ_ENTRIES) {
    const score = scoreEntry(entry, queryTokens);
    if (score >= minScore) ranked.push({ entry, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.entry.id - b.entry.id);
  return ranked.slice(0, limit).map(r => r.entry);
}

/** Prompt-Block mit den passenden Praxis-Einträgen (leer bei fremden Themen). */
export function buildPraxisPromptSection(question, { limit = 2 } = {}) {
  const entries = getRelevantPraxisEntries(question, { limit });
  if (!entries.length) return '';
  const blocks = entries.map(e => `Frage: ${e.question}\nGeprüfte Antwort: ${e.answer}`);
  return `WEITERES GEPRÜFTES PRAXISWISSEN ZUR AKTUELLEN FRAGE (aus der Praxis-FAQ; bleib inhaltlich konsistent, formuliere aber in deinem eigenen Ton und beziehe App-Daten ein, wo vorhanden. Rechtliche Details wie Schonzeit, Mindestmaß, Rutenzahl und Nachtangeln sind Landesrecht — verweise dafür auf den Regel-Assistenten):\n${blocks.join('\n\n')}`;
}
