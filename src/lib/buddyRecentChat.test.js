import { describe, it, expect, beforeEach } from 'vitest';
import { lastExchange, saveRecentBuddyChat, readRecentBuddyChat, RECENT_CHAT_MAX_AGE_MS } from './buddyRecentChat';

describe('buddyRecentChat', () => {
  beforeEach(() => localStorage.clear());
  const msgs = [
    { role: 'system', text: 'Hallo' },
    { role: 'user', text: 'Welche Köder?', at: 1 },
    { role: 'assistant', text: 'Gummifisch.<<ACTION>>{"type":"x"}<<END>>', at: 2 },
  ];
  it('nimmt das letzte vollständige Paar ohne Aktionsblock', () => {
    expect(lastExchange(msgs)).toEqual([
      { role: 'user', text: 'Welche Köder?', at: 1 },
      { role: 'assistant', text: 'Gummifisch.', at: 2 },
    ]);
  });
  it('ignoriert streamende Antworten', () => {
    expect(lastExchange([...msgs.slice(0, 2), { role: 'assistant', text: 'Gu', streaming: true }])).toBeNull();
  });
  it('zeigt nur dem eigenen Konto und nur frisch', () => {
    saveRecentBuddyChat('u1', msgs, 1000);
    expect(readRecentBuddyChat('u1', 2000)).toHaveLength(2);
    expect(readRecentBuddyChat('u2', 2000)).toEqual([]);
    expect(readRecentBuddyChat('u1', 1000 + RECENT_CHAT_MAX_AGE_MS + 1)).toEqual([]);
  });
});
