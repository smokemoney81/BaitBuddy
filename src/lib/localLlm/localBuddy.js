// KI-Buddy auf dem Gerät: Gesprächsführung mit Tool-Calling.
//
// Ablauf pro Frage:
//   1. Prompt = fester System-Teil (Persönlichkeit + Tools) + Verlauf + Frage.
//   2. Qwen antwortet — entweder direkt oder mit <tool_call>.
//   3. Tool-Calls führt die App aus (Wetter, Fangbuch, Spots, Regeln,
//      Wissensbasis, Aktionen); die Ergebnisse gehen als <tool_response>
//      zurück, und das Modell formuliert die Antwort. Höchstens MAX_ROUNDS Runden.
// Der System-Teil ist über das ganze Gespräch identisch; die Engine rechnet ihn
// nur einmal (Checkpoint), Folgefragen kosten nur ihren eigenen Text.

import { findFaqMatch, getRelevantFaqEntries, needsPersonalContext, isActionRequest, normalizeText } from '@/lib/buddyFaq';
import { nativeGenerate } from './nativeBridge';
import {
  buildSystemPrefix,
  buildConversationSuffix,
  parseModelOutput,
  visibleStreamingText,
  TOOL_CALL_STOP,
} from './qwenPrompt';
import { LOCAL_TOOLS, executeLocalTool } from './localTools';

export const MAX_ROUNDS = 3;
// Verlauf im Prompt: jede Zeile kostet auf dem Handy Rechenzeit.
const MAX_TURNS = 3;
const MAX_HISTORY_CHARS = 5000;
const FAQ_HINT_MIN_COVERAGE = 0.4;
const PERSONAL_HINT = /\bbei mir\b|\bmeine?[mnrs]?\b/;

// Qwen empfiehlt für den Nicht-Denk-Modus 0.7; mit 0.4 entscheidet das
// Modell verlässlicher, ob ein Werkzeug nötig ist (im Test kündigte es bei 0.7
// gelegentlich "Ich trage das ein" an, ohne log_catch aufzurufen).
const SAMPLING = { temperature: 0.4, topP: 0.8, topK: 20, minP: 0, repeatPenalty: 1.05 };

// Kurz gehalten: Der feste Teil wird bei jedem Modellstart einmal komplett
// durchgerechnet (auf Mittelklasse-Handys rund 30–60 Token pro Sekunde).
function systemText(now = new Date()) {
  const date = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `Du bist BaitBuddy, ein erfahrener, lockerer Angel-Kumpel in der App BaitBuddy und läufst direkt auf dem Handy. Heute ist ${date}.
Regeln:
- Immer Deutsch, duzen, ganze Sätze. Keine Emojis, kein Fettdruck, keine Sternchen-Listen.
- Smalltalk kurz (1-3 Sätze). Anleitungen (Montage, Köderführung, Knoten) erklärst du selbst Schritt für Schritt mit konkreten Zahlen, nie nur mit Verweis auf Videos.
- Fragen zu eigenen Fängen, Spots, Wetter oder Schonzeiten beantwortest du NUR mit dem passenden Werkzeug. Ohne Werkzeug-Ergebnis behauptest du nie, Daten zu kennen. Meldet ein Werkzeug einen Fehler, sag das ehrlich.
- Bei Fachfragen ohne mitgeliefertes Hintergrundwissen nutze search_knowledge.
- Aktionen (eintragen, speichern, anlegen, öffnen) führst du nur mit dem Werkzeug aus, und nur auf ausdrücklichen Wunsch. Kündige nie eine Aktion an, ohne das Werkzeug im selben Zug aufzurufen. Für einen Fang reicht die Fischart: trag sofort mit den genannten Angaben ein und frag nicht nach optionalen. Fehlt eine Pflichtangabe, frag nach statt zu raten.
- Regeln unterscheiden sich je Bundesland; Verbindliches steht in den örtlichen Vorschriften.`;
}

/** Fester Prompt-Anfang für das aktuelle Datum. */
export function buildLocalPrefix(now = new Date()) {
  return buildSystemPrefix(systemText(now), LOCAL_TOOLS);
}

/**
 * Bei einer klaren allgemeinen Wissensfrage die passende geprüfte Antwort
 * gleich mitgeben: spart eine Tool-Runde (auf dem Handy mehrere Sekunden).
 * Nie bei Fragen zu eigenen Daten oder Aktionen — dort lenkt das Wissen vom
 * nötigen Werkzeug ab (im Test beantwortete das Modell "mein bester Köder"
 * dann aus der Wissensbasis statt aus dem Fangbuch).
 */
export function withKnowledgeHint(question) {
  if (needsPersonalContext(question) || isActionRequest(question) || PERSONAL_HINT.test(normalizeText(question))) {
    return question;
  }
  const match = findFaqMatch(question);
  if (!match || match.coverage < FAQ_HINT_MIN_COVERAGE || match.entry.category === 'smalltalk') return question;
  // Zwei Einträge: Bei "Knoten für Geflochtene" liegt die Antwort teils unter
  // "Schnur", teils unter "Knoten" — mit nur einem Eintrag erfand das Modell im
  // Test Knotennamen.
  const facts = getRelevantFaqEntries(question, { limit: 2 })
    .map(e => (Array.isArray(e.answer) ? e.answer[0] : e.answer));
  if (!facts.length) return question;
  return `${question}\n\n(Geprüftes Hintergrundwissen aus der BaitBuddy-Wissensbasis. Halte dich daran und nenne keine Namen oder Zahlen, die dort nicht stehen, wenn du dir nicht sicher bist: ${facts.join(' ')})`;
}

/** Gesprächszustand des lokalen Modells (eine Instanz pro Chat-Seite). */
export function createLocalSession() {
  return { turns: [] };
}

function pairsFromHistory(history) {
  const turns = [];
  let pendingUser = null;
  for (const m of history) {
    if (typeof m?.content !== 'string' || !m.content.trim()) continue;
    if (m.role === 'user') pendingUser = m.content;
    else if (m.role === 'assistant' && pendingUser != null) {
      turns.push({ question: pendingUser, user: pendingUser, rounds: [], reply: m.content.trim(), shown: m.content.trim() });
      pendingUser = null;
    }
  }
  return turns;
}

function turnChars(turn) {
  return turn.user.length + turn.reply.length
    + (turn.rounds || []).reduce((n, r) => n + (r.raw || '').length + r.results.join('').length, 0);
}

/**
 * Bringt den Sitzungsverlauf mit dem sichtbaren Chat in Einklang. Stimmt das
 * Ende überein, bleiben die Rohtexte erhalten (Cache-Treffer); sonst — etwa
 * weil zwischendurch die Cloud geantwortet hat — wird aus dem Chat neu aufgebaut.
 */
function alignSession(session, history) {
  const fromChat = pairsFromHistory(history);
  const last = session.turns[session.turns.length - 1];
  const lastChat = fromChat[fromChat.length - 1];
  const aligned = last && lastChat && last.question === lastChat.question && last.shown === lastChat.shown;
  if (!aligned) session.turns = fromChat;
  // Wird das Budget überschritten, fällt gleich die ältere Hälfte weg: Jede
  // Kürzung zwingt die Engine, ab dem Checkpoint neu zu rechnen — besser
  // selten viel als bei jeder Frage ein bisschen.
  const total = () => session.turns.reduce((n, t) => n + turnChars(t), 0);
  if (session.turns.length > MAX_TURNS || total() > MAX_HISTORY_CHARS) {
    while (session.turns.length > 1 && (session.turns.length > Math.ceil(MAX_TURNS / 2) || total() > MAX_HISTORY_CHARS / 2)) {
      session.turns.shift();
    }
    if (total() > MAX_HISTORY_CHARS) session.turns = [];
  }
  return session.turns;
}

/**
 * Beantwortet eine Frage auf dem Gerät.
 *
 * @param {object} options
 * @param {string} options.modelId
 * @param {Array<{role:'user'|'assistant', content:string}>} options.history  Chat OHNE die aktuelle Frage
 * @param {string} options.question
 * @param {{turns:Array}} [options.session]  aus createLocalSession(); hält die Rohtexte für den Cache
 * @param {(text:string) => void} [options.onDelta]  neue sichtbare Text-Stücke
 * @param {AbortSignal} [options.signal]
 * @param {{ navigate?: Function, userLocation?: object }} [options.context]
 * @returns {Promise<{ reply: string, notices: string[], action: object|null, rounds: number, stats: object[] }>}
 */
export async function runLocalBuddy({
  modelId,
  history = [],
  question,
  session = createLocalSession(),
  onDelta,
  signal,
  context = {},
  generate = nativeGenerate,
  executeTool = executeLocalTool,
  now = new Date(),
}) {
  const prefix = buildLocalPrefix(now);
  const userText = withKnowledgeHint(question);
  const turns = alignSession(session, history);
  // Was der Nutzer zuletzt selbst gesagt hat — Grundlage, um erfundene
  // Werte in Aktionen zu erkennen (groundCatchArguments).
  const userTexts = [question, ...history.filter(m => m.role === 'user').slice(-2).map(m => m.content)];
  const toolContext = { ...context, userTexts };
  const rounds = [];
  const notices = [];
  const stats = [];
  let action = null;
  let reply = '';
  let finalRaw = '';

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    let raw = '';
    let emitted = 0;
    const separator = reply ? ' ' : '';
    const request = () => generate({
      modelId,
      prefix,
      suffix: buildConversationSuffix(turns, userText, rounds),
      maxTokens: 450,
      stop: [TOOL_CALL_STOP],
      ...SAMPLING,
    }, {
      signal,
      onDelta: (delta) => {
        raw += delta;
        const visible = visibleStreamingText(raw);
        if (visible.length > emitted) {
          onDelta?.((emitted === 0 ? separator : '') + visible.slice(emitted));
          emitted = visible.length;
        }
      },
    });

    let result;
    for (;;) {
      try {
        result = await request();
        break;
      } catch (err) {
        // Zu langer Verlauf: ältesten Turn weglassen und erneut versuchen.
        if (err?.code === 'context_overflow' && turns.length > 0 && raw === '') {
          turns.shift();
          continue;
        }
        throw err;
      }
    }
    stats.push(result);

    const parsed = parseModelOutput(raw);
    if (parsed.content) reply = reply ? `${reply}${separator}${parsed.content}` : parsed.content;
    if (!parsed.toolCalls.length || round === MAX_ROUNDS) {
      finalRaw = raw;
      break;
    }

    const results = [];
    // Die Engine stoppt nach dem ersten Tool-Call; mehrere pro Runde kommen
    // nur vor, wenn das Modell sie ohne Stop-Text verkettet.
    for (const call of parsed.toolCalls) {
      if (signal?.aborted) {
        const err = new Error('Abgebrochen');
        err.name = 'AbortError';
        throw err;
      }
      const outcome = await executeTool(call, toolContext);
      results.push(outcome.result);
      if (outcome.notice) notices.push(outcome.notice);
      if (outcome.deferredAction) action = outcome.deferredAction;
    }
    rounds.push({ raw, content: parsed.content, toolCalls: parsed.toolCalls, results });
  }

  const shown = reply.trim();
  session.turns.push({ question, user: userText, rounds, reply: finalRaw, shown });
  return { reply: shown, notices, action, rounds: rounds.length, stats };
}
/**
 * Rechnet den festen Prompt-Teil schon beim Öffnen des Buddys vor, damit die
 * erste Frage nur noch ihren eigenen Text verarbeiten muss.
 */
export function primeLocalBuddy(modelId, { now = new Date(), generate = nativeGenerate } = {}) {
  return generate({ modelId, prefix: buildLocalPrefix(now), suffix: '', maxTokens: 0 }).catch(() => null);
}
