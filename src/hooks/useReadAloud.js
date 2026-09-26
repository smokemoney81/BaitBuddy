import { useEffect } from 'react';
import { speakWithFallback, cancelElevenLabs } from '@/components/utils/elevenLabsTTS';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Vorlesetext für eine Multiple-Choice-Frage: „Frage 3 von 10. … A: …, B: …"
export function buildQuestionSpeech({ index, total, question, answers = [] }) {
  const head = Number.isFinite(index) && Number.isFinite(total) ? `Frage ${index + 1} von ${total}. ` : '';
  const options = answers
    .map((a, i) => `${LETTERS[i] || i + 1}: ${String(a).trim().replace(/[.:]+$/, '')}`)
    .join('. ');
  return `${head}${String(question || '').trim()} ${options ? `Antworten. ${options}.` : ''}`.trim();
}

// Liest `text` vor, sobald er sich ändert (Lautlos/Stimme-aus prüft die
// TTS-Utility). Beim Verlassen der Seite wird die Ausgabe abgebrochen.
export function useReadAloud(text) {
  useEffect(() => {
    if (text) speakWithFallback(text);
  }, [text]);
  useEffect(() => () => cancelElevenLabs(), []);
}
