// Spot-Re-Ranking durch Jev (Phase 3, siehe CLAUDE.md „Jev Decision Layer").
// Bekommt NUR die bereits berechnete Score-Aufschlüsselung aus
// `spotRecommendation.js` (Name + drei 0..1-Werte) — nie Koordinaten, Notizen
// oder rohe Fangdaten. Harte Filter (Eigentümerschaft) sind zu diesem
// Zeitpunkt schon angewendet; Jev re-rankt nur die Reihenfolge, erfindet keine
// neuen Spots. Gleiches Shadow-/Active-Muster wie die anderen Module.
import { askJev, isJevEnabled, isJevShadowMode } from './jevClient.js';

// Mehr als das würde die Jev-Anfrage unnötig aufblähen — die Top-Kandidaten
// aus der deterministischen Sortierung reichen für ein sinnvolles Re-Ranking.
const MAX_CANDIDATES = 8;

function buildState(ranked, targetSpecies) {
  return {
    screen: 'spot_recommendation',
    targetSpecies: targetSpecies || null,
    candidates: ranked.slice(0, MAX_CANDIDATES).map((r, i) => ({
      index: i,
      name: r.spot.name,
      species_match: r.breakdown.species,
      season_match: r.breakdown.season,
      weather_match: r.breakdown.weather,
      deterministic_score: Math.round(r.score * 100) / 100,
    })),
  };
}

const RANKING_QUESTION = {
  best_spot_index: {
    type: 'choice',
    instructions: 'Welcher Kandidat (per "index") ist die beste Angel-Empfehlung, basierend auf species_match, season_match und weather_match?',
    criteria: Object.fromEntries(
      Array.from({ length: MAX_CANDIDATES }, (_, i) => [String(i), `Kandidat mit index ${i}`])
    ),
  },
};

/**
 * Phase 1 (Shadow Mode): vergleicht Jevs Top-Wahl mit der deterministischen
 * Reihenfolge, ohne die Antwort zu beeinflussen.
 */
export function runSpotRankingShadow({ ranked, targetSpecies }) {
  if (!isJevEnabled() || !isJevShadowMode() || !ranked.length) return;
  askJev({ state: buildState(ranked, targetSpecies), questions: RANKING_QUESTION })
    .then((answers) => {
      const jevChoice = answers?.best_spot_index?.choice;
      if (jevChoice == null) return;
      console.log('[jev-shadow] spot-ranking', {
        deterministicTop: ranked[0]?.spot.name,
        jevTop: ranked[Number(jevChoice)]?.spot.name ?? null,
        mismatch: Number(jevChoice) !== 0,
      });
    })
    .catch(() => {
      // askJev fängt bereits alles ab; zusätzliches Sicherheitsnetz.
    });
}

/**
 * Phase 2 (Active Mode, Flag `JEV_SPOTS`): bringt Jevs Top-Wahl an die erste
 * Stelle, lässt die übrige deterministische Reihenfolge sonst unverändert.
 * Fail-open auf die deterministische Reihenfolge bei Fehler/Timeout/uneindeutiger
 * Antwort.
 */
export async function resolveActiveRanking({ ranked, targetSpecies }) {
  if (!ranked.length) return ranked;
  const answers = await askJev({ state: buildState(ranked, targetSpecies), questions: RANKING_QUESTION });
  const jevChoice = answers?.best_spot_index?.choice;
  const index = jevChoice == null ? NaN : Number(jevChoice);
  if (!Number.isInteger(index) || index <= 0 || index >= ranked.length) return ranked;
  const reordered = [...ranked];
  const [chosen] = reordered.splice(index, 1);
  reordered.unshift(chosen);
  return reordered;
}
