// Schnellfragen der Startseite (Dashboard-Vorlage): Zielfisch aus dem Profil,
// sonst passend zur Jahreszeit.

const SEASONS = {
  spring: { months: [3, 4, 5], species: ['Hecht', 'Barsch', 'Forelle'], label: 'Frühling' },
  summer: { months: [6, 7, 8], species: ['Zander', 'Karpfen', 'Wels'], label: 'Sommer' },
  autumn: { months: [9, 10, 11], species: ['Hecht', 'Zander', 'Barsch'], label: 'Herbst' },
  winter: { months: [12, 1, 2], species: ['Hecht', 'Barsch', 'Forelle'], label: 'Winter' },
};

function currentSeason(date = new Date()) {
  const month = date.getMonth() + 1;
  return Object.values(SEASONS).find(s => s.months.includes(month)) || SEASONS.spring;
}

/** Zielfisch für Vorschläge: eigener Zielfisch aus dem Profil, sonst der Saisonfisch. */
export function suggestionSpecies(targetSpecies, date = new Date()) {
  const own = Array.isArray(targetSpecies) ? targetSpecies.find(s => typeof s === 'string' && s.trim()) : null;
  return own ? own.trim() : currentSeason(date).species[0];
}

/**
 * Die vier Schnellfragen der Startseite (Dashboard-Vorlage). `label` ist der
 * kurze Chip-Text, `question` die vollständige Frage an den Buddy.
 */
export function homePromptChips({ targetSpecies, date = new Date() } = {}) {
  const species = suggestionSpecies(targetSpecies, date);
  return [
    { id: 'spots', icon: 'spots', label: `Gute ${species}-Spots am Wochenende`, question: `Zeig mir gute ${species}-Spots für das Wochenende.` },
    { id: 'times', icon: 'weather', label: 'Beste Angelzeiten morgen', question: 'Wann sind morgen die besten Angelzeiten?' },
    { id: 'baits', icon: 'fish', label: `Welche Köder für ${species}?`, question: `Welche Köder passen gerade für ${species}?` },
    { id: 'analysis', icon: 'sparkles', label: 'Analyse meiner letzten Fänge', question: 'Analysiere meine letzten Fänge.' },
  ];
}
