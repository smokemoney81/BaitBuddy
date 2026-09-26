// Deterministische Spot-Empfehlung — reine Funktionen ohne Datenbankzugriff,
// analog zu `anglerInsights.js`. Neue Feature-Basis (es gab vorher keine
// Spot-Rankinglogik im Code): bewusst grobe, erklärbare Heuristiken statt
// Scheingenauigkeit. Harte Filter (Eigentümerschaft der Spots) bleiben beim
// Aufrufer (`routes/spots.js`) — diese Datei bewertet nur, sie filtert nicht.
import { isInClosedSeason } from './closedSeason.js';

const NEUTRAL = 0.5;

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

// Anteil der Fänge AN DIESEM SPOT, die der Zielfischart entsprechen. Ohne
// Zielfischart oder ohne Fänge an diesem Spot: neutral (0.5) — es gibt schlicht
// kein Signal, weder dafür noch dagegen.
function speciesMatch(spotName, targetSpecies, catches) {
  if (!targetSpecies) return NEUTRAL;
  const atSpot = catches.filter((c) => normalize(c.water_body || c.spot_name) === normalize(spotName));
  if (!atSpot.length) return NEUTRAL;
  const matching = atSpot.filter((c) => normalize(c.species) === normalize(targetSpecies));
  return matching.length / atSpot.length;
}

// Schonzeit der Zielfischart — deterministisch aus rule_entries, dieselbe
// Quelle wie der RuleAssistant (siehe CLAUDE.md: Jev darf hier nie
// authoritative sein). Keine passende Regel gefunden: neutral.
function seasonMatch(targetSpecies, ruleEntries) {
  if (!targetSpecies) return NEUTRAL;
  const rule = ruleEntries.find((r) => normalize(r.fish) === normalize(targetSpecies));
  if (!rule) return NEUTRAL;
  return isInClosedSeason(rule.closed_from, rule.closed_to) ? 0 : 1;
}

// Grobe, spot-unabhängige Wetter-Verträglichkeit — kein Ersatz für eine echte
// Bedingungsanalyse (siehe Bissindex-Baustelle in der Architekturskizze),
// sondern ein einfacher Wind-Schwellenwert. Ohne Wetterdaten: neutral.
function weatherMatch(weather) {
  if (!weather || typeof weather.windSpeed !== 'number') return NEUTRAL;
  if (weather.windSpeed <= 15) return 1;
  if (weather.windSpeed <= 25) return 0.6;
  return 0.3;
}

const WEIGHTS = { species: 0.4, season: 0.3, weather: 0.3 };

/**
 * Bewertet und sortiert Spots (bereits auf den Eigentümer gefiltert). Liefert
 * für jeden Spot die Einzelwerte UND den Gesamtscore — die Einzelwerte sind
 * die Grundlage für ein optionales Jev-Re-Ranking (siehe `jevSpotRanking.js`).
 */
export function rankSpots({ spots, catches = [], targetSpecies = null, ruleEntries = [], weather = null }) {
  return spots
    .map((spot) => {
      const breakdown = {
        species: speciesMatch(spot.name, targetSpecies, catches),
        season: seasonMatch(targetSpecies, ruleEntries),
        weather: weatherMatch(weather),
      };
      const score = breakdown.species * WEIGHTS.species
        + breakdown.season * WEIGHTS.season
        + breakdown.weather * WEIGHTS.weather;
      return { spot, breakdown, score };
    })
    .sort((a, b) => b.score - a.score);
}
