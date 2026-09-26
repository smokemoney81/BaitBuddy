// Prüf-Warteschlangen-Priorisierung durch Jev (Phase 6, siehe CLAUDE.md „Jev
// Decision Layer"). Ergänzt die deterministische Priorität aus
// `submissionPlausibility.js` (`classifyReviewPriority`, rein aus der Anzahl
// fehlgeschlagener Auffälligkeits-Checks) — für die Prüf-Warteschlange des
// Veranstalters (`GET /events/:id/review`), NICHT für die öffentliche
// Wettbewerbs-Rangliste. Ändert NIE, ob eine Einreichung zählt oder wie viele
// Punkte sie bringt — nur die Sichtungsreihenfolge für den Veranstalter
// ("Kategorien/Relevanz", keine Ergebnismanipulation, siehe CLAUDE.md). Jev
// bekommt nur die Check-IDs/Schweregrade, nie Artname/Länge/Gewicht/Foto.
import { askJev, isJevEnabled, isJevShadowMode } from './jevClient.js';

const PRIORITY_CRITERIA = {
  low: 'Nur eine kleine Auffälligkeit (z. B. fehlendes Foto) — kann warten.',
  medium: 'Eine deutliche Auffälligkeit — sollte zeitnah geprüft werden.',
  high: 'Mehrere Auffälligkeiten gleichzeitig — sollte zuerst geprüft werden.',
};

function buildQuestions(submissions) {
  const questions = {};
  for (const s of submissions) {
    const failedChecks = (s.plausibility || []).filter((c) => !c.ok && c.severity === 'review').map((c) => c.id);
    questions[`priority_${s.id}`] = {
      type: 'choice',
      instructions: `Diese Wettbewerbs-Einreichung hat folgende Auffälligkeiten: ${failedChecks.join(', ') || 'nur Genehmigungspflicht des Events'}. Wie dringend sollte der Veranstalter sie prüfen?`,
      criteria: PRIORITY_CRITERIA,
    };
  }
  return questions;
}

/**
 * Phase 1 (Shadow Mode): vergleicht Jevs Priorisierung asynchron mit der
 * deterministischen Stufe, ohne die zurückgegebene Reihenfolge zu beeinflussen.
 */
export function runReviewPriorityShadow(submissionsWithPriority) {
  if (!isJevEnabled() || !isJevShadowMode() || !submissionsWithPriority.length) return;
  askJev({ state: { screen: 'event_review_queue' }, questions: buildQuestions(submissionsWithPriority) })
    .then((answers) => {
      if (!answers) return;
      const comparison = submissionsWithPriority.map((s) => ({
        id: s.id,
        deterministic: s.review_priority,
        jev: answers[`priority_${s.id}`]?.choice || null,
      }));
      const mismatches = comparison.filter((c) => c.jev && c.jev !== c.deterministic);
      console.log('[jev-shadow] review-priority', { comparison, mismatches });
    })
    .catch(() => {
      // askJev fängt bereits alles ab; zusätzliches Sicherheitsnetz.
    });
}

/**
 * Phase 2 (Active Mode, Flag `JEV_REVIEW`): ersetzt die Priorität pro
 * Einreichung fail-open. Sortiert NICHT selbst — der Aufrufer sortiert nach
 * dem zurückgegebenen `review_priority`-Feld.
 */
export async function resolveActivePriorities(submissionsWithPriority) {
  if (!submissionsWithPriority.length) return submissionsWithPriority;
  const answers = await askJev({ state: { screen: 'event_review_queue' }, questions: buildQuestions(submissionsWithPriority) });
  if (!answers) return submissionsWithPriority;
  return submissionsWithPriority.map((s) => {
    const jevChoice = answers[`priority_${s.id}`]?.choice;
    if (!jevChoice || !(jevChoice in PRIORITY_CRITERIA)) return s;
    return { ...s, review_priority: jevChoice };
  });
}
