// Fangbuch-Muster-Klassifizierung durch Jev (Phase 3, siehe CLAUDE.md „Jev
// Decision Layer"). Ergänzt die deterministische Evidence-Stufe aus
// `anglerInsights.js` (`classifyEvidence`) — ersetzt sie nie ohne Fallback und
// bekommt NUR aggregierte Zahlen (count/total/share einer bereits gebildeten
// Aussage), nie rohe Fangbuch-Zeilen. Gleiches Shadow-/Active-Muster wie der
// Buddy-Context-Router (`jevBuddyContext.js`): Phase 1 vergleicht nur, Phase 2
// (eigenes Flag `JEV_FANGBUCH`) darf die Stufe tatsächlich ersetzen.
import { askJev, isJevEnabled, isJevShadowMode } from './jevClient.js';

const EVIDENCE_CRITERIA = {
  EARLY: 'Wenige Datenpunkte oder kein klarer Mehrheitsanteil — erste Tendenz, noch kein verlässliches Muster.',
  MODERATE: 'Mehrere Datenpunkte mit klarem Mehrheitsanteil — plausibles, aber noch nicht sehr robustes Muster.',
  STRONG: 'Viele Datenpunkte mit deutlichem Mehrheitsanteil — statistisch robustes Muster.',
};

function buildQuestions(patterns) {
  const questions = {};
  for (const pattern of patterns) {
    questions[`evidence_${pattern.id}`] = {
      type: 'choice',
      instructions: `Wie belastbar ist das Muster "${pattern.label}: ${pattern.value}" aus ${pattern.sample.count} von ${pattern.sample.total} Datenpunkten (${pattern.sample.share} %)?`,
      criteria: EVIDENCE_CRITERIA,
    };
  }
  return questions;
}

// Nur Muster mit Stichprobe (frequenzbasiert) sind hier relevant — `personal_best`
// trägt bewusst keine Evidence-Stufe (siehe `anglerInsights.js`) und wird
// unverändert durchgereicht.
function evidencePatterns(patterns) {
  return patterns.filter((p) => p.sample && p.evidence);
}

/**
 * Phase 1 (Shadow Mode): vergleicht Jevs Einschätzung asynchron mit der
 * deterministischen Stufe, ohne die Antwort zu beeinflussen oder zu verzögern.
 */
export function runFangbuchEvidenceShadow(patterns) {
  if (!isJevEnabled() || !isJevShadowMode()) return;
  const relevant = evidencePatterns(patterns);
  if (!relevant.length) return;
  askJev({
    state: { screen: 'fangbuch_insights' },
    questions: buildQuestions(relevant),
  })
    .then((answers) => {
      if (!answers) return;
      const comparison = relevant.map((p) => ({
        id: p.id,
        deterministic: p.evidence,
        jev: answers[`evidence_${p.id}`]?.choice || null,
      }));
      const mismatches = comparison.filter((c) => c.jev && c.jev !== c.deterministic);
      console.log('[jev-shadow] fangbuch-evidence', { comparison, mismatches });
    })
    .catch(() => {
      // askJev fängt bereits alles ab; zusätzliches Sicherheitsnetz.
    });
}

/**
 * Phase 2 (Active Mode, Flag `JEV_FANGBUCH`): ersetzt die Evidence-Stufe pro
 * Muster fail-open — beantwortet Jev ein Muster nicht eindeutig oder schlägt
 * der Aufruf fehl/Timeout, bleibt genau für dieses Muster die deterministische
 * Stufe aus `classifyEvidence` bestehen.
 */
export async function resolveActiveEvidence(patterns) {
  const relevant = evidencePatterns(patterns);
  if (!relevant.length) return patterns;
  const answers = await askJev({
    state: { screen: 'fangbuch_insights' },
    questions: buildQuestions(relevant),
  });
  if (!answers) return patterns;
  return patterns.map((pattern) => {
    if (!pattern.sample || !pattern.evidence) return pattern;
    const jevChoice = answers[`evidence_${pattern.id}`]?.choice;
    if (!jevChoice || !(jevChoice in EVIDENCE_CRITERIA)) return pattern;
    return { ...pattern, evidence: jevChoice };
  });
}
