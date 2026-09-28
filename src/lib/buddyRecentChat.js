// Letzter Wortwechsel mit dem KI-Buddy für das Dashboard.
//
// Der Chatverlauf lebt clientseitig in KiBuddyBeta (kein Server-Verlauf). Damit
// die Startseite — wie in der Vorlage — die letzte Frage und die Antwort des
// Buddys zeigen kann, merkt sich KiBuddyBeta das letzte vollständige Paar
// (Frage + Antwort). Pro Konto gespeichert, damit auf einem geteilten Gerät
// kein fremder Verlauf erscheint, und nach MAX_AGE_MS nicht mehr angezeigt.

import { stripActionMarker } from '@/lib/streamingReply';

export const RECENT_CHAT_KEY = 'bb_buddy_recent_chat';
export const RECENT_CHAT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 600;

function cleanText(text) {
  return stripActionMarker(String(text || '')).replace(/\s+\n/g, '\n').trim().slice(0, MAX_TEXT);
}

/**
 * Sucht das letzte abgeschlossene Paar aus Nutzerfrage und Buddy-Antwort.
 * Streamende Antworten, Systemnachrichten und leere Texte zählen nicht.
 */
export function lastExchange(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i > 0; i -= 1) {
    const answer = messages[i];
    if (answer?.role !== 'assistant' || answer.streaming) continue;
    const answerText = cleanText(answer.text);
    if (!answerText) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      const question = messages[j];
      if (question?.role !== 'user') continue;
      const questionText = cleanText(question.text);
      if (!questionText) break;
      return [
        { role: 'user', text: questionText, at: Number(question.at) || null },
        { role: 'assistant', text: answerText, at: Number(answer.at) || null },
      ];
    }
    return null;
  }
  return null;
}

export function saveRecentBuddyChat(owner, messages, now = Date.now()) {
  if (!owner) return false;
  const exchange = lastExchange(messages);
  if (!exchange) return false;
  try {
    localStorage.setItem(RECENT_CHAT_KEY, JSON.stringify({ owner, savedAt: now, items: exchange }));
    return true;
  } catch {
    return false;
  }
}

export function readRecentBuddyChat(owner, now = Date.now()) {
  if (!owner) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_CHAT_KEY) || 'null');
    if (!raw || raw.owner !== owner || !Array.isArray(raw.items)) return [];
    if (!(now - Number(raw.savedAt) <= RECENT_CHAT_MAX_AGE_MS)) return [];
    return raw.items
      .filter(item => (item?.role === 'user' || item?.role === 'assistant') && typeof item.text === 'string' && item.text)
      .slice(0, 2);
  } catch {
    return [];
  }
}
