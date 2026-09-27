// Aktivierungswort-Erkennung für den globalen Voice-Buddy und Hands-free.
//
// Die Spracherkennung (Web Speech API) liefert Freitext. Für das Standardwort
// "Hey Buddy" tolerieren wir typische Erkennungsvarianten; benutzerdefinierte
// Aktivierungswörter werden normalisiert und als zusammenhängende Phrase gesucht.

const GREETINGS = ['hey', 'hei', 'hej', 'he', 'hi', 'hallo', 'ey', 'okay', 'ok'];
const NAMES = ['buddy', 'baddy', 'bady', 'budy', 'body', 'buddie', 'buddi', 'bodie', 'bitte buddy'];

export function normalizeTranscript(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[„“"'.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DEFAULT_WAKE_PATTERN = new RegExp(
  `(?:^|\\s)(?:${GREETINGS.join('|')})\\s+(?:${NAMES.join('|')})(?=\\s|$)`,
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sucht das konfigurierte Aktivierungswort im erkannten Text.
 * @returns {{ detected: boolean, command: string }}
 * command = Text nach dem Aktivierungswort (leer, wenn nur das Wake-Word fiel).
 */
export function detectConfiguredWakeWord(text, phrase = 'Hey Buddy') {
  const normalized = normalizeTranscript(text);
  const normalizedPhrase = normalizeTranscript(phrase) || 'hey buddy';

  let match;
  if (normalizedPhrase === 'hey buddy') {
    match = DEFAULT_WAKE_PATTERN.exec(normalized);
  } else {
    const customPattern = new RegExp(`(?:^|\\s)${escapeRegExp(normalizedPhrase)}(?=\\s|$)`);
    match = customPattern.exec(normalized);
  }

  if (!match) return { detected: false, command: '' };
  const command = normalized.slice(match.index + match[0].length).trim();
  return { detected: true, command };
}

// Rückwärtskompatibel für den vorhandenen Hands-free-Modus.
export function detectWakeWord(text) {
  return detectConfiguredWakeWord(text, 'Hey Buddy');
}

// Beispiele, die der Buddy im Hands-free-Modus wirklich umsetzen kann
// (Aktionen aus buddyActionCatalog bzw. Wissensfragen mit Standort-Kontext).
export const HANDS_FREE_EXAMPLES = [
  'Wie ist das Wetter?',
  'Welcher Köder passt jetzt?',
  'Trag einen Barsch mit 32 cm ein',
  'Speichere diesen Spot',
];

// Nach so vielen Sekunden ohne erkannte Sprache beendet sich der Hands-free-Modus.
export const HANDS_FREE_IDLE_SECONDS = 60;
