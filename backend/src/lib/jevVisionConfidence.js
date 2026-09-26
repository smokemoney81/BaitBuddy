// Vision-Confidence-Routing durch Jev (Phase 5, siehe CLAUDE.md „Jev Decision
// Layer"). Ergänzt die bestehende deterministische Schwellenwert-Logik für die
// KI-Fischerkennung (`POST /analyze-photo`, Frontend-Pendant
// `src/components/log/FishRecognitionResult.jsx`: ≥75 % sicher/grün, ≥45 %
// zweite Analyse/gelb, sonst nutzer fragen/rot) — ersetzt NIE die eigentliche
// Vision-Erkennung (Art, Länge, Gewicht …) selbst, nur die Einordnung, wie
// stark man dem `confidence`-Wert vertrauen sollte. Jev bekommt ausschließlich
// die Zahl + die erkannte Art, nie das Bild.
import { askJev, isJevEnabled, isJevShadowMode } from './jevClient.js';

// Dieselben Schwellen wie FishRecognitionResult.jsx (0..1-Skala, wie sie
// `/analyze-photo` liefert — die UI zeigt sie *100 als Prozent an).
export function classifyConfidenceBand(confidence) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  if (confidence >= 0.75) return 'sicher';
  if (confidence >= 0.45) return 'zweite_analyse';
  return 'nutzer_fragen';
}

const BAND_CRITERIA = {
  sicher: 'Die Erkennung ist verlässlich genug, um direkt ins Fangbuch übernommen zu werden.',
  zweite_analyse: 'Grenzfall — eine zweite Analyse oder ein schärferes Foto wäre sinnvoll.',
  nutzer_fragen: 'Zu unsicher, um automatisch übernommen zu werden — der Nutzer sollte das Ergebnis prüfen.',
};

function buildQuestion(confidence, species) {
  return {
    band: {
      type: 'choice',
      instructions: `Die Bilderkennung hat "${species || 'einen Fisch'}" mit einer Selbst-Einschätzung von ${confidence} (0..1) erkannt. Wie sollte dieses Ergebnis eingeordnet werden?`,
      criteria: BAND_CRITERIA,
    },
  };
}

/**
 * Phase 1 (Shadow Mode): vergleicht Jevs Einordnung asynchron mit der
 * deterministischen Band-Klassifizierung, ohne die Antwort zu beeinflussen.
 */
export function runVisionConfidenceShadow({ confidence, species }) {
  if (!isJevEnabled() || !isJevShadowMode()) return;
  const deterministic = classifyConfidenceBand(confidence);
  if (!deterministic) return;
  askJev({ state: { screen: 'fish_recognition' }, questions: buildQuestion(confidence, species) })
    .then((answers) => {
      const jevBand = answers?.band?.choice;
      if (!jevBand) return;
      console.log('[jev-shadow] vision-confidence', {
        deterministic,
        jev: jevBand,
        mismatch: jevBand !== deterministic,
      });
    })
    .catch(() => {
      // askJev fängt bereits alles ab; zusätzliches Sicherheitsnetz.
    });
}

/**
 * Phase 2 (Active Mode, Flag `JEV_VISION`): liefert die Band-Klassifizierung,
 * fail-open auf die deterministische Schwelle bei Fehler/Timeout/uneindeutiger
 * Antwort. Ändert NIEMALS den rohen `confidence`-Wert selbst.
 */
export async function resolveActiveConfidenceBand({ confidence, species }) {
  const deterministic = classifyConfidenceBand(confidence);
  if (!deterministic) return deterministic;
  const answers = await askJev({ state: { screen: 'fish_recognition' }, questions: buildQuestion(confidence, species) });
  const jevBand = answers?.band?.choice;
  return jevBand && jevBand in BAND_CRITERIA ? jevBand : deterministic;
}
