import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Geräte-Pfad des Voice Buddys: Welche KI antwortet, entscheidet useLocalBuddy.
const { localBuddy } = vi.hoisted(() => ({
  localBuddy: { engineFor: vi.fn(), askLocal: vi.fn(), canFallBack: false, readyModel: { id: 'qwen3.5-4b' }, mode: 'auto' },
}));
vi.mock('@/hooks/useLocalBuddy', () => ({ useLocalBuddy: () => localBuddy }));
vi.mock('@/components/premium/PremiumGuard', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('@/components/ai/BuddyAvatar', () => ({ default: () => <div /> }));
vi.mock('@/hooks/useFeatureTracking', () => ({ useFeatureTracking: () => {} }));
vi.mock('@/hooks/useEventActivityTracking', () => ({ useEventActivityTracking: () => ({ trackAIChat: vi.fn() }) }));
vi.mock('@/hooks/useElevenLabsVoice', () => {
  const stop = vi.fn();
  return { useElevenLabsVoice: () => ({ speak: vi.fn(), stop, isSpeaking: false }) };
});
vi.mock('@/api/frontendClient', () => ({
  auth: {
    getCurrentUser: vi.fn(async () => null),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  events: { getActiveEvent: vi.fn(async () => ({})) },
  ai: { chatStream: vi.fn() },
}));
vi.mock('@/components/utils/elevenLabsTTS', () => ({
  createSpeechQueue: vi.fn(() => ({ push: vi.fn(), flush: vi.fn(), cancel: vi.fn() })),
}));
vi.mock('@/functions/catchgbtChat', () => ({ catchgbtChat: vi.fn() }));
vi.mock('@/utils/buddyActions', () => ({ executeBuddyAction: vi.fn(async () => ({ success: true, message: null })) }));

import KiBuddyBeta from './KiBuddyBeta';
import { ai } from '@/api/frontendClient';
import { catchgbtChat } from '@/functions/catchgbtChat';
import { executeBuddyAction } from '@/utils/buddyActions';

async function ask(text) {
  const input = await screen.findByPlaceholderText('Frage stellen...');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function renderBuddy() {
  return render(<MemoryRouter><KiBuddyBeta /></MemoryRouter>);
}

describe('KiBuddyBeta – KI auf dem Gerät', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localBuddy.canFallBack = false;
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => cleanup());

  it('beantwortet über das Gerät, zeigt Hinweise und führt Seitenwechsel danach aus', async () => {
    localBuddy.engineFor.mockReturnValue('local');
    localBuddy.askLocal.mockImplementation(async ({ onDelta, history, question }) => {
      expect(history).toEqual([]);
      expect(question).toBe('Trag einen Hecht mit 80 cm ein');
      onDelta('Hecht ');
      onDelta('ist drin.');
      return { reply: 'Hecht ist drin.', notices: ['Fang Hecht wurde im Fangbuch eingetragen.'], action: { type: 'navigate', params: { page: 'logbuch' } } };
    });
    renderBuddy();
    await ask('Trag einen Hecht mit 80 cm ein');
    expect(await screen.findByText('Hecht ist drin.')).toBeInTheDocument();
    expect(screen.getByText('Auf deinem Gerät beantwortet')).toBeInTheDocument();
    expect(screen.getByText('Fang Hecht wurde im Fangbuch eingetragen.')).toBeInTheDocument();
    expect(executeBuddyAction).toHaveBeenCalledWith({ type: 'navigate', params: { page: 'logbuch' } }, expect.anything());
    expect(ai.chatStream).not.toHaveBeenCalled();
  });

  it('Modus "Nur Gerät" ohne Modell: keine Cloud, ehrlicher Hinweis', async () => {
    localBuddy.engineFor.mockReturnValue('none');
    renderBuddy();
    await ask('Wie lief mein letzter Trip?');
    expect(await screen.findByText(/noch nicht eingerichtet/)).toBeInTheDocument();
    expect(ai.chatStream).not.toHaveBeenCalled();
    expect(catchgbtChat).not.toHaveBeenCalled();
  });

  it('Automatik: fällt die Cloud aus, antwortet das Gerät', async () => {
    localBuddy.engineFor.mockReturnValue('cloud');
    localBuddy.canFallBack = true;
    ai.chatStream.mockRejectedValue(new Error('kein Stream'));
    catchgbtChat.mockRejectedValue(new Error('Netzwerkfehler'));
    localBuddy.askLocal.mockResolvedValue({ reply: 'Vom Handy beantwortet.', notices: [], action: null });
    renderBuddy();
    await ask('Wie liefen meine letzten Fänge?');
    expect(await screen.findByText('Vom Handy beantwortet.')).toBeInTheDocument();
    expect(screen.getByText(/Cloud-KI nicht erreichbar/)).toBeInTheDocument();
  });

  it('Fehler auf dem Gerät: Hinweis und Antwort aus dem Buddy-Wissen', async () => {
    localBuddy.engineFor.mockReturnValue('local');
    localBuddy.askLocal.mockRejectedValue(Object.assign(new Error('model_missing'), { code: 'model_missing' }));
    renderBuddy();
    await ask('Wie montiere ich ein Dropshot-Rig mit Fluorocarbon am See im Herbst?');
    expect(await screen.findByText(/Modell auf dem Gerät fehlt/)).toBeInTheDocument();
  });
});
