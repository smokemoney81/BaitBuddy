// KI-Buddy-Context-Router — geteilte Logik für Jev Shadow Mode (Phase 1) UND
// Active Mode (Phase 2), siehe CLAUDE.md „Jev Decision Layer".
//
// Phase 2 (aktive Steuerung) darf laut CLAUDE.md erst nach Auswertung echter
// Shadow-Mode-Daten produktiv geschaltet werden (`JEV_BUDDY=true`). Der Code
// hier ist vollständig fertig und getestet, bleibt aber ohne dieses Flag ein
// reines No-op — `isJevBuddyActive()` in `jevClient.js` ist der einzige Schalter.
import { askJev } from './jevClient.js';

export const CONTEXT_QUESTIONS = {
  needs_catches: {
    type: 'noul',
    instructions: 'Würde der Zugriff auf die gespeicherte Fanghistorie des Nutzers diese Antwort verbessern?',
  },
  needs_rules: {
    type: 'noul',
    instructions: 'Geht es in der Frage um gesetzliche Angelregeln, Schonzeiten oder Mindestmaße?',
  },
  needs_spots: {
    type: 'noul',
    instructions: 'Würde der Zugriff auf die gespeicherten Angelspots des Nutzers diese Antwort verbessern?',
  },
  needs_weather: {
    type: 'noul',
    instructions: 'Würden aktuelle Wetterdaten diese Antwort verbessern?',
  },
  needs_planning: {
    type: 'noul',
    instructions: 'Plant der Nutzer einen konkreten Angel-Trip (Ausrüstung, Termin, Ziel)?',
  },
};

const QUESTION_TO_FLAG = {
  needs_catches: 'catches',
  needs_rules: 'rules',
  needs_spots: 'spots',
  needs_weather: 'weather',
  needs_planning: 'planning',
};

function toBool(noulAnswer) {
  if (!noulAnswer || typeof noulAnswer.probability !== 'number') return null;
  return noulAnswer.probability >= 0.5;
}

// Wandelt Jevs rohe `answers` in dieselbe Flag-Form wie die bestehenden
// regelbasierten `wants*`-Variablen in `buildChatPrompt` um. Fragen, die Jev
// nicht eindeutig beantwortet hat (kein `probability`-Wert), werden als
// `null` durchgereicht — der Aufrufer entscheidet, wie er damit umgeht.
export function parseContextAnswers(answers) {
  const flags = {};
  for (const [question, flagKey] of Object.entries(QUESTION_TO_FLAG)) {
    flags[flagKey] = toBool(answers?.[question]);
  }
  return flags;
}

async function askJevForContext(lastMsg) {
  return askJev({
    state: { message: lastMsg.slice(0, 500), screen: 'buddy_chat' },
    questions: CONTEXT_QUESTIONS,
  });
}

/**
 * Phase 2 (Active Mode): fragt Jev nach der Kontext-Relevanz und liefert die
 * resultierenden Flags. Fail-open PRO FLAG — für jede Frage, die Jev nicht
 * eindeutig beantwortet hat (oder wenn der Aufruf komplett fehlschlägt/
 * Timeout), wird der entsprechende regelbasierte Wert aus `ruleBasedFlags`
 * übernommen. Wirft nie, verzögert die Antwort um höchstens das
 * Jev-Timeout (800 ms, siehe `jevClient.js`).
 */
export async function resolveActiveContextFlags({ lastMsg, ruleBasedFlags }) {
  const answers = await askJevForContext(lastMsg);
  if (!answers) return { ...ruleBasedFlags };
  const jevFlags = parseContextAnswers(answers);
  const resolved = {};
  for (const key of Object.keys(ruleBasedFlags)) {
    resolved[key] = jevFlags[key] === null || jevFlags[key] === undefined
      ? ruleBasedFlags[key]
      : jevFlags[key];
  }
  return resolved;
}

/**
 * Phase 1 (Shadow Mode): fire-and-forget-Vergleich, beeinflusst die Antwort
 * nicht. Siehe `jevShadow.js` für den Aufrufer.
 */
export function logShadowComparison(ruleBasedFlags, answers) {
  const jevFlags = parseContextAnswers(answers);
  const mismatches = Object.keys(ruleBasedFlags).filter(
    (key) => jevFlags[key] !== null && jevFlags[key] !== ruleBasedFlags[key]
  );
  console.log('[jev-shadow] buddy-context', {
    ruleBasedFlags,
    jevFlags,
    mismatches,
  });
}

export { askJevForContext };
