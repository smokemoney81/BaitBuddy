// Shadow-Mode für den KI-Buddy-Context-Router (Phase 1 des Jev-Rollouts, siehe
// CLAUDE.md „Jev Decision Layer"). Vergleicht die bestehende regelbasierte
// Kontext-Auswahl (wantsCatches/wantsRules/wantsSpots/wantsWeather/wantsPlanning
// in `buildChatPrompt`) parallel mit Jevs Einschätzung — OHNE das Ergebnis der
// eigentlichen Antwort zu beeinflussen. Nutzer merken davon nichts.
//
// Zweck: echte Qualitätsdaten sammeln, bevor Jev irgendeine Benutzeraktion
// tatsächlich steuert (Rollout-Phase 0/1 gemäß CLAUDE.md).
import { askJev, isJevEnabled, isJevShadowMode } from './jevClient.js';

const CONTEXT_QUESTIONS = {
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

// Nur für Logging/Vergleich relevant — kein Nutzerprofil, keine E-Mail, keine
// Standortdaten (Datenminimierungs-Regel aus CLAUDE.md).
export function runBuddyContextShadow({ lastMsg, ruleBasedFlags }) {
  if (!isJevEnabled() || !isJevShadowMode()) return;
  // Fire-and-forget: darf die Antwortzeit des Buddys unter keinen Umständen
  // verzögern. Fehler werden ausschließlich in askJev() selbst protokolliert.
  askJev({
    state: { message: lastMsg.slice(0, 500), screen: 'buddy_chat' },
    questions: CONTEXT_QUESTIONS,
  })
    .then((answers) => {
      if (!answers) return;
      logShadowComparison(ruleBasedFlags, answers);
    })
    .catch(() => {
      // askJev fängt selbst bereits alles ab; dieser catch ist nur ein
      // zusätzliches Sicherheitsnetz gegen unbehandelte Promise-Rejections.
    });
}

function toBool(noulAnswer) {
  if (!noulAnswer || typeof noulAnswer.probability !== 'number') return null;
  return noulAnswer.probability >= 0.5;
}

function logShadowComparison(ruleBasedFlags, answers) {
  const jevFlags = {
    catches: toBool(answers.needs_catches),
    rules: toBool(answers.needs_rules),
    spots: toBool(answers.needs_spots),
    weather: toBool(answers.needs_weather),
    planning: toBool(answers.needs_planning),
  };
  const mismatches = Object.keys(ruleBasedFlags).filter(
    (key) => jevFlags[key] !== null && jevFlags[key] !== ruleBasedFlags[key]
  );
  console.log('[jev-shadow] buddy-context', {
    ruleBasedFlags,
    jevFlags,
    mismatches,
  });
}
