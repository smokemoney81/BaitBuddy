// Such-Engine für die lokale FAQ-Datenbank des KI-Buddys (buddyFaq.data.js).
//
// Reines JavaScript ohne Abhängigkeiten, damit dieselbe Logik im Browser
// (Sofort- und Offline-Antworten ohne API) und im Backend (passendes Wissen im
// LLM-Prompt) läuft. Frontend-Einstieg: src/lib/buddyFaq.js.
//
// Bewertung eines Eintrags:
//  - Aus jeder `all`-Gruppe muss ein Begriff treffen, sonst scheidet er aus.
//  - Punkte = 10 je Gruppe + Länge des längsten Treffers je Gruppe / 10 +
//    2 je `any`-Treffer. Mehr Gruppen schlagen also allgemeinere Einträge
//    ("Köder für Hecht" → hecht-koeder statt koeder-allgemein), bei gleicher
//    Gruppenzahl gewinnt der spezifischere, längere Begriff.
//  - Abdeckung = Anteil der inhaltstragenden Wörter der Frage, die ein
//    Treffer erklärt. Nur eine hohe Abdeckung rechtfertigt eine Sofort-Antwort
//    ohne LLM — "Schonzeit Hecht in Bayern" deckt der allgemeine
//    Schonzeit-Eintrag nur zu einem Drittel ab und geht deshalb an die KI.

import { FAQ_ENTRIES, FAQ_CATEGORIES } from './buddyFaq.data.js';

export { FAQ_ENTRIES, FAQ_CATEGORIES };

// Mindest-Abdeckung für eine Sofort-Antwort (online, ohne LLM).
export const INSTANT_MIN_COVERAGE = 0.75;
// Längere Fragen sind fast immer individuell — die gehen an die KI.
export const INSTANT_MAX_CONTENT_TOKENS = 8;

// Füllwörter: werden vor dem Abgleich entfernt.
const STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mir', 'mich', 'dir', 'dich', 'uns', 'euch', 'sich', 'man',
  'und', 'oder', 'aber', 'auch', 'noch', 'schon', 'nur', 'mit', 'ohne', 'fuer', 'von', 'vom', 'zu',
  'zum', 'zur', 'im', 'in', 'am', 'an', 'auf', 'aus', 'bei', 'beim', 'nach', 'ueber', 'unter', 'vor',
  'ist', 'sind', 'bin', 'bist', 'war', 'waren', 'wird', 'werden', 'hat', 'habe', 'hab', 'hast', 'haben',
  'sein', 'so', 'sehr', 'mal', 'ja', 'nein', 'doch', 'da', 'dann', 'denn', 'wenn', 'als', 'wie', 'was',
  'bisschen', 'bissl', 'etwas', 'viel', 'viele', 'ne', 'nen', 'eigentlich', 'genau', 'ganz', 'einfach',
  'bitte', 'kurz', 'gerne', 'gern', 'mehr', 'um', 'ob', 'dass', 'damit', 'zwischen', 'wirklich',
  'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meins', 'dein', 'deine', 'deinen', 'deinem', 'deiner',
]);

// Neutrale Wörter: dürfen treffen, zählen aber nicht in die Abdeckung —
// Fragewörter, Höflichkeit, Grüße und allgemeine Angel-Verben.
const NEUTRAL = new Set([
  'wo', 'wann', 'warum', 'wieso', 'weshalb', 'womit', 'wer', 'welche', 'welcher', 'welches', 'welchen',
  'kann', 'kannst', 'koennen', 'soll', 'sollte', 'sollen', 'muss', 'musst', 'muessen', 'brauche',
  'brauchst', 'brauchen', 'gibt', 'geht', 'gehe', 'mache', 'machen', 'macht', 'funktioniert',
  'funktionieren', 'richtig', 'best', 'beste', 'besten', 'bester', 'bestes', 'gut', 'gute', 'guten',
  'guter', 'gutes', 'tipp', 'tipps', 'infos', 'info', 'erklaer', 'erklaere', 'erklaeren', 'sag',
  'sage', 'hallo', 'hi', 'hey', 'moin', 'servus', 'danke', 'buddy', 'baitbuddy', 'frage', 'fragen',
  'angeln', 'angle', 'angelt', 'angel', 'fischen', 'fische', 'fisch', 'fangen', 'fange', 'faengt',
  'benutze', 'benutzen', 'nutze', 'nutzen', 'immer', 'ok', 'okay', 'tun', 'tue', 'tut',
  'beissen', 'beisst', 'beisse', 'beissend', 'beissverhalten', 'alles', 'app', 'wasser', 'worauf',
  'baue', 'bauen', 'finde', 'finden', 'heraus', 'beachten', 'beachte', 'achten', 'darf', 'duerfen',
  'fuehre', 'fuehren', 'fuehrt', 'lohnt', 'lohnen', 'bringt', 'bringen', 'einfluss', 'beeinflusst',
  'beeinflussen', 'wichtig', 'richtige', 'richtigen', 'richtiger', 'passt', 'passen', 'montage',
  'montieren', 'montiere', 'rig', 'erlaubt', 'verboten',
]);

// Bezüge auf Ort oder Zeitpunkt — die kann nur die KI mit App-Kontext
// (Standort-Wetter, Schonzeiten-Daten) beantworten.
const CONTEXT_TOKENS = new Set([
  'heute', 'morgen', 'uebermorgen', 'gestern', 'jetzt', 'gerade', 'aktuell', 'aktuelle', 'aktuellen',
  'momentan', 'hier', 'naehe', 'umgebung', 'standort', 'wochenende', 'letzte', 'letzten', 'letztes',
  'letzter', 'naechste', 'naechsten', 'naechstes',
]);
// Besitzangaben zu gespeicherten App-Daten ("meine Fänge", "unser Spot",
// "meinen Trip"). "Meine Rolle" oder "meinen Fang frisch halten" sind dagegen
// allgemeine Fragen und bleiben lokal beantwortbar.
const PERSONAL_DATA = /\b(mein|meine|meinen|meinem|meiner|unser|unsere|unseren|unserem|unserer)\s+(\w+\s+)?(faenge|faengen|fangbuch|logbuch|spot|spots|plaetze|trip|trips|ausflug|angelausflug|tour|touren|statistik|daten|ausruestung|verein|bundesland|region|gegend|ort|gewaesser)\b/;

// Imperative, mit denen der Nutzer eine App-Aktion auslöst ("Trag ... ein",
// "Öffne die Karte") — die führt nur das Backend per <<ACTION>> aus.
const ACTION_IMPERATIVES = new Set([
  'trag', 'trage', 'speicher', 'speichere', 'oeffne', 'oeffnen', 'zeig', 'zeige', 'navigier',
  'navigiere', 'erstell', 'erstelle', 'starte', 'start', 'plan', 'plane', 'leg', 'lege', 'notier',
  'notiere', 'merk', 'merke', 'erinner', 'erinnere', 'bring', 'wechsel', 'wechsle', 'schreib',
  'schreibe', 'poste', 'melde', 'fueg', 'fuege', 'loesch', 'loesche', 'aktivier', 'aktiviere',
  'deaktivier', 'deaktiviere', 'ruf', 'geh', 'gehe', 'lade', 'mach',
]);
const ACTION_INFINITIVES = /\b(eintragen|anlegen|oeffnen|speichern|notieren|erstellen|starten|hinzufuegen|loeschen|zeigen|planen|posten|melden|aufrufen)\b/;
const ACTION_REQUEST = /\b(kannst|koenntest|wuerdest)\s+du\b/;
const ACTION_PHRASES = /\b(ins|in mein|in meinem|ins mein) (fangbuch|logbuch)\b/;

// Rückbezüge auf den bisherigen Gesprächsverlauf.
const FOLLOW_UP_START = /^(und|aber|oder|also|auch|ok und|okay und)\b/;
const FOLLOW_UP_MARKERS = /\b(dafuer|damit|davon|dazu|dabei|darauf|daran|stattdessen|sonst|genauer|nochmal|noch mal|mehr dazu|das gleiche|dasselbe|der gleiche|und wenn|was ist mit|wie ist es mit|wie waere es mit)\b/;

/**
 * Normalisiert Text für den Vergleich: klein, Umlaute ausgeschrieben,
 * Satzzeichen und Bindestriche als Leerzeichen.
 */
export function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(normalized) {
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

// Prüft einen Begriff gegen die Frage und liefert die getroffenen Wörter
// (leeres Array = kein Treffer).
function matchTerm(term, tokens, paddedText) {
  if (term.includes(' ')) {
    if (!paddedText.includes(` ${term}`)) return [];
    const words = term.split(' ');
    return tokens.filter(t => words.some(w => t.startsWith(w)));
  }
  if (term.endsWith('$')) {
    const exact = term.slice(0, -1);
    return tokens.filter(t => t === exact);
  }
  return tokens.filter(t =>
    t === term
    || (term.length >= 3 && t.startsWith(term))
    || (term.length >= 6 && t.includes(term)),
  );
}

function scoreEntry(entry, tokens, paddedText) {
  const covered = new Set();
  let score = 0;
  for (const group of entry.all) {
    let best = 0;
    for (const term of group) {
      const hits = matchTerm(term, tokens, paddedText);
      if (hits.length) {
        hits.forEach(h => covered.add(h));
        best = Math.max(best, term.replace('$', '').length);
      }
    }
    if (!best) return null;
    score += 10 + best / 10;
  }
  for (const term of entry.any || []) {
    // Zusatzpunkte nur für inhaltstragende Wörter — ein getroffenes
    // Fragewort ("welche", "beste") darf keinen Eintrag nach vorn schieben.
    const hits = matchTerm(term, tokens, paddedText).filter(h => !NEUTRAL.has(h));
    if (hits.length) {
      hits.forEach(h => covered.add(h));
      score += 2;
    }
  }
  return { score, covered };
}

function analyze(question) {
  const normalized = normalizeText(question);
  const tokens = tokenize(normalized).filter(t => !STOPWORDS.has(t));
  const contentTokens = tokens.filter(t => !NEUTRAL.has(t) && t.length >= 2);
  return { normalized, tokens, contentTokens, paddedText: ` ${normalized} ` };
}

function rankEntries(analysis) {
  const ranked = [];
  for (const entry of FAQ_ENTRIES) {
    const result = scoreEntry(entry, analysis.tokens, analysis.paddedText);
    if (!result) continue;
    const coveredContent = analysis.contentTokens.filter(t => result.covered.has(t)).length;
    const coverage = analysis.contentTokens.length
      ? coveredContent / analysis.contentTokens.length
      : 1;
    ranked.push({ entry, score: result.score, coverage });
  }
  // Stabil sortieren: bei Gleichstand gewinnt die höhere Abdeckung, danach die
  // Reihenfolge in der Datenbank.
  return ranked.sort((a, b) => (b.score - a.score) || (b.coverage - a.coverage));
}

/**
 * Bester FAQ-Treffer für eine Frage.
 * @returns {{ entry, score, coverage, contentTokens: number } | null}
 */
export function findFaqMatch(question) {
  const analysis = analyze(question);
  if (!analysis.tokens.length) return null;
  const [best] = rankEntries(analysis);
  return best ? { ...best, contentTokens: analysis.contentTokens.length } : null;
}

/**
 * Die bis zu `limit` besten Wissens-Einträge zu einer Frage (ohne Smalltalk),
 * für den LLM-Prompt im Backend.
 */
export function getRelevantFaqEntries(question, { limit = 3 } = {}) {
  const analysis = analyze(question);
  if (!analysis.tokens.length) return [];
  return rankEntries(analysis)
    .filter(r => r.entry.category !== 'smalltalk')
    .slice(0, limit)
    .map(r => r.entry);
}

/** Erkennt Aufforderungen zu App-Aktionen (Eintragen, Öffnen, Speichern …). */
export function isActionRequest(question) {
  const normalized = normalizeText(question);
  const words = tokenize(normalized).filter(w => !['bitte', 'hey', 'buddy', 'ok', 'okay', 'und', 'jetzt'].includes(w));
  if (words.length && ACTION_IMPERATIVES.has(words[0])) return true;
  if (ACTION_PHRASES.test(normalized)) return true;
  return ACTION_REQUEST.test(normalized) && ACTION_INFINITIVES.test(normalized);
}

/** Bezieht sich die Frage auf eigene Daten, den Standort oder einen Zeitpunkt? */
export function needsPersonalContext(question) {
  const normalized = normalizeText(question);
  return PERSONAL_DATA.test(normalized) || tokenize(normalized).some(t => CONTEXT_TOKENS.has(t));
}

/** Knüpft die Frage erkennbar an die vorherige Antwort an? */
export function isFollowUpQuestion(question) {
  const normalized = normalizeText(question);
  return FOLLOW_UP_START.test(normalized) || FOLLOW_UP_MARKERS.test(normalized);
}

// Letzte Variante je Eintrag — verhindert, dass Smalltalk zweimal gleich klingt.
const lastVariant = new Map();

/** Antworttext eines Eintrags; Varianten rotieren ohne direkte Wiederholung. */
export function pickFaqAnswer(entry, random = Math.random) {
  if (!Array.isArray(entry.answer)) return entry.answer;
  const variants = entry.answer;
  if (variants.length === 1) return variants[0];
  const previous = lastVariant.get(entry.id);
  let index = Math.floor(random() * variants.length) % variants.length;
  if (index === previous) index = (index + 1) % variants.length;
  lastVariant.set(entry.id, index);
  return variants[index];
}

/**
 * Entscheidet, ob der Buddy eine Frage lokal beantwortet.
 *
 * Online ('instant'): nur bei eindeutig allgemeinen Standardfragen — hohe
 * Abdeckung, kurz, keine App-Aktion, kein Bezug auf eigene Daten/Ort/Zeit und
 * (in einem laufenden Gespräch) kein Rückbezug. Alles andere geht an die KI.
 *
 * Offline ('offline'): jeder Treffer ist besser als keine Antwort; ist die
 * Frage spezieller als der Eintrag, wird das offen dazugesagt.
 *
 * @param {string} question
 * @param {{ online?: boolean, inConversation?: boolean }} [options]
 * @returns {{ mode: 'instant'|'offline', entry, answer: string, page: string|null } | null}
 */
export function resolveLocalAnswer(question, { online = true, inConversation = false } = {}) {
  const match = findFaqMatch(question);
  if (!match) return null;
  const { entry, coverage, contentTokens } = match;

  if (online) {
    if (coverage < INSTANT_MIN_COVERAGE) return null;
    if (contentTokens > INSTANT_MAX_CONTENT_TOKENS) return null;
    if (isActionRequest(question) || needsPersonalContext(question)) return null;
    if (inConversation && isFollowUpQuestion(question)) return null;
    return { mode: 'instant', entry, answer: pickFaqAnswer(entry), page: entry.page || null };
  }

  // Offline: Ein Treffer, der kein einziges Inhaltswort der Frage erklärt (etwa
  // nur das "Hallo" in "Hallo, ich hab eine Frage zu meinem Boot"), wäre eine
  // Antwort am Thema vorbei — dann lieber die ehrliche Fallback-Nachricht.
  if (coverage === 0) return null;
  let answer = pickFaqAnswer(entry);
  if (isActionRequest(question)) {
    answer = `Solange meine Online-KI nicht erreichbar ist, kann ich nichts in der App anlegen oder öffnen — das klappt wieder, sobald sie antwortet. Soweit ich es aus meinem eingebauten Wissen sagen kann: ${answer}`;
  } else if (coverage < INSTANT_MIN_COVERAGE || needsPersonalContext(question)) {
    answer = `Meine Online-KI ist gerade nicht erreichbar, deshalb antworte ich nur allgemein, nicht auf deine Daten, deinen Ort oder die aktuelle Lage bezogen: ${answer}`;
  }
  return { mode: 'offline', entry, answer, page: entry.page || null };
}

/** Antwort, wenn offline kein Eintrag passt — nennt, was lokal verfügbar ist. */
export function getOfflineFallback(random = Math.random) {
  const variants = [
    'Meine Online-KI ist gerade nicht erreichbar, und dazu weiß ich ohne sie leider nichts Passendes. Frag mich zu Fischarten wie Hecht, Zander oder Karpfen, zu Ködern, Montagen, Knoten, Wetter oder Schonzeiten — das kann ich auch ohne Netz beantworten.',
    'Ohne Verbindung komme ich bei dieser Frage nicht weiter. Mein eingebautes Wissen deckt Köderführung, Montagen, Knoten, Fischarten, Jahreszeiten, Wetter-Grundlagen und Regeln ab — probier es gern damit, oder frag noch einmal, sobald du wieder Netz hast.',
  ];
  return variants[Math.floor(random() * variants.length) % variants.length];
}

/**
 * Antwort, wenn das Netz steht, die Online-KI aber nicht antwortet (Guthaben,
 * Konfiguration, Überlast) und kein Eintrag passt. Anders als
 * getOfflineFallback darf sie nicht "ohne Verbindung" behaupten.
 */
export function getUnavailableFallback(random = Math.random) {
  const variants = [
    'Meine Online-KI antwortet gerade nicht, und dazu weiß ich ohne sie leider nichts Passendes. Frag mich zu Fischarten wie Hecht, Zander oder Karpfen, zu Ködern, Montagen, Knoten, Wetter oder Schonzeiten — das beantworte ich aus meinem eingebauten Wissen.',
    'Bei dieser Frage brauche ich meine Online-KI, und die ist gerade nicht verfügbar. Mein eingebautes Wissen deckt Köderführung, Montagen, Knoten, Fischarten, Jahreszeiten, Wetter-Grundlagen und Regeln ab — probier es gern damit, oder frag später noch einmal.',
  ];
  return variants[Math.floor(random() * variants.length) % variants.length];
}

/**
 * Prompt-Abschnitt mit den zur Frage passenden FAQ-Einträgen. Ersetzt die
 * früher in JEDEN Prompt kopierte Komplett-Liste: kürzer (schnellere Antwort),
 * und die KI bleibt inhaltlich konsistent zu den lokalen Sofort-Antworten.
 */
export function buildFaqPromptSection(question, { limit = 3 } = {}) {
  const entries = getRelevantFaqEntries(question, { limit });
  if (!entries.length) return '';
  const blocks = entries.map(e => {
    const answer = Array.isArray(e.answer) ? e.answer[0] : e.answer;
    return `Frage: ${e.question}\nGeprüfte Antwort: ${answer}`;
  });
  return `GEPRÜFTES BUDDY-WISSEN ZUR AKTUELLEN FRAGE (aus der lokalen FAQ-Datenbank, die die App auch offline nutzt — bleib inhaltlich konsistent dazu, beantworte aber genau die gestellte Frage und beziehe App-Daten ein, wo vorhanden):\n${blocks.join('\n\n')}`;
}
