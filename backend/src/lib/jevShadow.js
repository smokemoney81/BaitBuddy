// Shadow-Mode für den KI-Buddy-Context-Router (Phase 1 des Jev-Rollouts, siehe
// CLAUDE.md „Jev Decision Layer"). Vergleicht die bestehende regelbasierte
// Kontext-Auswahl (wantsCatches/wantsRules/wantsSpots/wantsWeather/wantsPlanning
// in `buildChatPrompt`) parallel mit Jevs Einschätzung — OHNE das Ergebnis der
// eigentlichen Antwort zu beeinflussen. Nutzer merken davon nichts.
//
// Zweck: echte Qualitätsdaten sammeln, bevor Jev irgendeine Benutzeraktion
// tatsächlich steuert (Rollout-Phase 0/1 gemäß CLAUDE.md).
import { isJevEnabled, isJevShadowMode } from './jevClient.js';
import { askJevForContext, logShadowComparison } from './jevBuddyContext.js';

// Nur für Logging/Vergleich relevant — kein Nutzerprofil, keine E-Mail, keine
// Standortdaten (Datenminimierungs-Regel aus CLAUDE.md).
export function runBuddyContextShadow({ lastMsg, ruleBasedFlags }) {
  if (!isJevEnabled() || !isJevShadowMode()) return;
  // Fire-and-forget: darf die Antwortzeit des Buddys unter keinen Umständen
  // verzögern. Fehler werden ausschließlich in askJev() selbst protokolliert.
  askJevForContext(lastMsg)
    .then((answers) => {
      if (!answers) return;
      logShadowComparison(ruleBasedFlags, answers);
    })
    .catch(() => {
      // askJev fängt selbst bereits alles ab; dieser catch ist nur ein
      // zusätzliches Sicherheitsnetz gegen unbehandelte Promise-Rejections.
    });
}
