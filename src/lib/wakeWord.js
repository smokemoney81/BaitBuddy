// Aktivierungswort "Hey Buddy" für den Hands-free Buddy.
//
// Die Spracherkennung (Web Speech API) liefert Freitext. Sie hört "Buddy"
// je nach Aussprache als "Baddy", "Body" oder "Bady" und "Hey" als "Hei",
// "He" oder "Hallo". Diese Varianten werden hier toleriert; alles, was nach dem
// Aktivierungswort im selben Satz folgt, ist bereits die Frage.

const GREETINGS = ['hey', 'hei', 'hej', 'he', 'hi', 'hallo', 'ey', 'okay', 'ok'];
const NAMES = ['buddy', 'baddy', 'bady', 'budy', 'body', 'buddie', 'buddi', 'bodie', 'bitte buddy'];

export function normalizeTranscript(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[„“"'.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WAKE_PATTERN = new RegExp(
  `(?:^|\\s)(?:${GREETINGS.join('|')})\\s+(?:${NAMES.join('|')})(?=\\s|$)`,
);

/**
 * Sucht das Aktivierungswort im erkannten Text.
 * @returns {{ detected: boolean, command: string }}
 *   command = Text nach dem Aktivierungswort (leer, wenn nur "Hey Buddy" fiel).
 */
export function detectWakeWord(text) {
  const normalized = normalizeTranscript(text);
  const match = WAKE_PATTERN.exec(normalized);
  if (!match) return { detected: false, command: '' };
  const command = normalized.slice(match.index + match[0].length).trim();
  return { detected: true, command };
}

// Beispiele, die der Buddy im Hands-free-Modus wirklich umsetzen kann
// (Aktionen aus buddyActionCatalog bzw. Wissensfragen mit Standort-Kontext).
export const HANDS_FREE_EXAMPLES = [
  'Wie ist das Wetter?',
  'Welcher Köder passt jetzt?',
  'Trag einen Barsch mit 32 cm ein',
  'Speichere diesen Spot',
];

// Nach so vielen Sekunden ohne erkannte Sprache beendet sich der Modus.
export const HANDS_FREE_IDLE_SECONDS = 60;
