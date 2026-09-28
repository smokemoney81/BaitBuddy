// Dynamische Prompt-Vorschläge für das Dashboard-Eingabefeld.
// Erzeugt kontextabhängige Vorschläge basierend auf Tageszeit, Saison, Wetter und Nutzerdaten.

const SEASONS = {
  spring: { months: [3, 4, 5], species: ['Hecht', 'Barsch', 'Forelle'], label: 'Frühling' },
  summer: { months: [6, 7, 8], species: ['Zander', 'Karpfen', 'Wels'], label: 'Sommer' },
  autumn: { months: [9, 10, 11], species: ['Hecht', 'Zander', 'Barsch'], label: 'Herbst' },
  winter: { months: [12, 1, 2], species: ['Hecht', 'Barsch', 'Forelle'], label: 'Winter' },
};

function currentSeason() {
  const month = new Date().getMonth() + 1;
  return Object.values(SEASONS).find(s => s.months.includes(month)) || SEASONS.spring;
}

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 6) return 'night';
  if (h < 10) return 'morning';
  if (h < 14) return 'midday';
  if (h < 18) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

export function generateSuggestions({ weather, catches, trips, targetSpecies } = {}) {
  const season = currentSeason();
  const tod = timeOfDay();
  const suggestions = [];

  if (tod === 'morning') {
    suggestions.push('Welcher Koeder passt heute Morgen?');
    suggestions.push(`Was beisst im ${season.label} am besten?`);
  } else if (tod === 'evening') {
    suggestions.push('Lohnt sich ein Abendansitz?');
  } else if (tod === 'night') {
    suggestions.push('Plane meinen naechsten Angeltrip.');
  }

  if (weather?.temperature != null) {
    if (weather.temperature < 5) {
      suggestions.push('Welche Koeder bei Kaelte?');
    } else if (weather.temperature > 25) {
      suggestions.push('Wo stehen die Fische bei Hitze?');
    }
    if (weather.wind_speed > 20) {
      suggestions.push('Tipps zum Angeln bei Wind?');
    }
  }

  const species = targetSpecies?.[0] || season.species[0];
  suggestions.push(`Wie stehen die Chancen auf ${species}?`);
  suggestions.push('Plane meinen naechsten Trip.');

  if (catches?.length > 0) {
    suggestions.push('Zeig mir meine Fangstatistik.');
  }

  if (trips?.length > 0) {
    suggestions.push('Wie wird das Wetter fuer meinen Trip?');
  }

  suggestions.push('Welche Montage empfiehlst du?');
  suggestions.push('Erklaer mir die Koederfuehrung.');
  suggestions.push(`Beste Beisszeit im ${season.label}?`);

  const unique = [...new Set(suggestions)];
  return unique.slice(0, 8);
}
