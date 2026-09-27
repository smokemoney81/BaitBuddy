import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// PremiumGuard und schwere Abhängigkeiten wegmocken, damit der Test die
// Chat-/History-Logik isoliert prüft.
vi.mock('@/components/premium/PremiumGuard', () => ({
  default: ({ children }) => <>{children}</>,
}));
vi.mock('@/components/ai/BuddyAvatar', () => ({ default: () => <div data-testid="buddy-avatar" /> }));
vi.mock('@/hooks/useFeatureTracking', () => ({ useFeatureTracking: () => {} }));
vi.mock('@/hooks/useEventActivityTracking', () => ({
  useEventActivityTracking: () => ({ trackAIChat: vi.fn() }),
}));
// stop muss über Renders hinweg stabil sein (wie die echte useCallback-Variante),
// sonst re-triggert der [stopVoice]-Effekt jeden Render und bricht den laufenden
// Request-Controller ab.
vi.mock('@/hooks/useElevenLabsVoice', () => {
  const stop = vi.fn();
  return {
    useElevenLabsVoice: () => ({ speak: vi.fn(async () => true), stop, isSpeaking: false }),
  };
});
vi.mock('@/api/frontendClient', () => ({
  auth: {
    getCurrentUser: vi.fn(async () => null),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  events: { getActiveEvent: vi.fn(async () => ({})) },
  ai: { chatStream: vi.fn() },
  // Buddy Live: HandsFree-/Live-Ansicht werden immer mitimportiert (auch wenn
  // im Standardmodus "text" nicht gerendert) — entities/functions brauchen
  // daher einen Mock, auch wenn diese Tests nur den Chat-Modus prüfen.
  entities: { FishingPlan: { list: vi.fn(async () => []) } },
  functions: { invoke: vi.fn() },
}));
// Sprech-Queue wegmocken: die Chat-/History-Logik ist hier der Prüfgegenstand,
// nicht die (bereits separat getestete) TTS-Wiedergabe.
vi.mock('@/components/utils/elevenLabsTTS', () => ({
  createSpeechQueue: vi.fn(() => ({ push: vi.fn(), flush: vi.fn(), cancel: vi.fn() })),
}));
vi.mock('@/functions/catchgbtChat', () => ({ catchgbtChat: vi.fn() }));
vi.mock('@/utils/buddyActions', () => ({ executeBuddyAction: vi.fn(async () => ({ success: true, message: 'Fang Karpfen wurde im Fangbuch eingetragen.' })) }));

import KiBuddyBeta from './KiBuddyBeta';
import { catchgbtChat } from '@/functions/catchgbtChat';
import { ai } from '@/api/frontendClient';
import { executeBuddyAction } from '@/utils/buddyActions';

function renderBuddy() {
  return render(
    <MemoryRouter>
      <KiBuddyBeta />
    </MemoryRouter>
  );
}

async function ask(text) {
  const input = await screen.findByPlaceholderText('Frage stellen...');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('KiBuddyBeta – Chat-Historie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Standard: Streaming nicht verfügbar → Beta fällt auf catchgbtChat zurück
    // (die History-/Abort-Tests prüfen genau diesen bewährten Pfad).
    ai.chatStream.mockRejectedValue(new Error('kein Stream'));
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => cleanup());

  it('sendet beim zweiten Turn die vollständige Historie ohne Duplikat (Stale-Closure-Fix)', async () => {
    catchgbtChat
      .mockResolvedValueOnce({ reply: 'erste Antwort' })
      .mockResolvedValueOnce({ reply: 'zweite Antwort' });

    renderBuddy();

    await ask('erste Frage');
    expect(await screen.findByText('erste Antwort')).toBeInTheDocument();

    await ask('zweite Frage');
    expect(await screen.findByText('zweite Antwort')).toBeInTheDocument();

    // Der zweite LLM-Aufruf muss die komplette Historie enthalten: den ersten
    // User-Turn, die erste Antwort und den neuen User-Turn – jeweils genau einmal.
    const secondCall = catchgbtChat.mock.calls[1][0];
    expect(secondCall.messages).toEqual([
      { role: 'user', content: 'erste Frage' },
      { role: 'assistant', content: 'erste Antwort' },
      { role: 'user', content: 'zweite Frage' },
    ]);
  });
});

describe('KiBuddyBeta – Abbruch bei Unmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Standard: Streaming nicht verfügbar → Beta fällt auf catchgbtChat zurück
    // (die History-/Abort-Tests prüfen genau diesen bewährten Pfad).
    ai.chatStream.mockRejectedValue(new Error('kein Stream'));
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => cleanup());

  it('übergibt ein AbortSignal an den Streaming-Request und aktualisiert nach Unmount keinen State mehr', async () => {
    let resolveChat;
    // Streaming-Request hängen lassen, bis wir ihn manuell auflösen.
    ai.chatStream.mockImplementation(() => new Promise((res) => {
      resolveChat = () => res({ reply: 'zu spät' });
    }));

    const { unmount } = renderBuddy();

    await ask('frage vor unmount');

    // Der laufende Streaming-Request bekommt ein AbortSignal mit, damit er beim
    // Unmount abgebrochen werden kann (3. Argument: options).
    const opts = ai.chatStream.mock.calls[0][2];
    expect(opts?.signal).toBeInstanceOf(AbortSignal);

    unmount();

    // Späte Auflösung nach dem Unmount darf keinen State-Update/Crash auslösen.
    await act(async () => {
      resolveChat();
      await Promise.resolve();
    });

    expect(screen.queryByText('zu spät')).not.toBeInTheDocument();
  });
});

describe('KiBuddyBeta – Live-Streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => cleanup());

  it('streamt die Antwort live und ruft NICHT den gepufferten catchgbtChat auf', async () => {
    ai.chatStream.mockImplementation(async (_messages, _loc, { onDelta } = {}) => {
      onDelta?.('Klar, ');
      onDelta?.('Hechte beißen früh am Morgen am besten.');
      return { reply: 'Klar, Hechte beißen früh am Morgen am besten.' };
    });

    renderBuddy();
    // Bezug auf "heute" → keine lokale Sofort-Antwort, die Frage geht an die KI.
    await ask('Wann beißen Hechte heute?');

    expect(await screen.findByText('Klar, Hechte beißen früh am Morgen am besten.')).toBeInTheDocument();
    // Im Streaming-Erfolgsfall wird der gepufferte Pfad nicht mehr angefasst.
    expect(catchgbtChat).not.toHaveBeenCalled();
  });

  it('führt die Aktion aus der Antwort aus und meldet das Ergebnis', async () => {
    const action = { type: 'log_catch', params: { species: 'Karpfen' } };
    ai.chatStream.mockImplementation(async (_messages, _loc, { onDelta } = {}) => {
      onDelta?.('Mach ich.');
      return { reply: 'Mach ich.', action };
    });

    renderBuddy();
    await ask('Karpfen ins Fangbuch');

    expect(await screen.findByText('Fang Karpfen wurde im Fangbuch eingetragen.')).toBeInTheDocument();
    expect(executeBuddyAction).toHaveBeenCalledWith(action, expect.objectContaining({ navigate: expect.any(Function) }));
  });
});

describe('KiBuddyBeta – lokale FAQ-Datenbank', () => {
  let onLineSpy;
  beforeEach(() => {
    vi.clearAllMocks();
    ai.chatStream.mockRejectedValue(new Error('kein Stream'));
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    onLineSpy?.mockRestore();
    onLineSpy = undefined;
    cleanup();
  });

  it('beantwortet eine Standardfrage sofort lokal, ohne API-Aufruf', async () => {
    renderBuddy();
    await ask('Welcher Köder ist gut für Hecht?');

    expect(await screen.findByText(/Für Hecht haben sich drei Köder bewährt/)).toBeInTheDocument();
    expect(screen.getByText('Sofort-Antwort aus dem Buddy-Wissen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Köderführung 3D öffnen' })).toHaveAttribute('href', '/Koeder3D');
    expect(ai.chatStream).not.toHaveBeenCalled();
    expect(catchgbtChat).not.toHaveBeenCalled();
  });

  it('schickt Fragen zu eigenen Daten weiterhin an die KI', async () => {
    catchgbtChat.mockResolvedValueOnce({ reply: 'Deine Fänge sagen: Gummifisch.' });
    renderBuddy();
    await ask('Welche Köder passen zu meinen letzten Fängen?');

    expect(await screen.findByText('Deine Fänge sagen: Gummifisch.')).toBeInTheDocument();
    expect(ai.chatStream).toHaveBeenCalledTimes(1);
  });

  it('antwortet ohne Netz direkt aus der Datenbank, ohne Request und Retries', async () => {
    onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    renderBuddy();
    await ask('Schonzeit Hecht Bayern');

    expect(await screen.findByText(/antworte ich nur allgemein/)).toBeInTheDocument();
    expect(screen.getByText('Offline-Antwort aus dem Buddy-Wissen')).toBeInTheDocument();
    expect(ai.chatStream).not.toHaveBeenCalled();
    expect(catchgbtChat).not.toHaveBeenCalled();
  });

  it('meldet ohne Netz ehrlich, wenn die Datenbank nichts Passendes kennt', async () => {
    onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    renderBuddy();
    await ask('Wie geht die Bundesliga aus?');

    expect(await screen.findByText(/Du bist gerade offline/)).toBeInTheDocument();
    expect(ai.chatStream).not.toHaveBeenCalled();
  });

  it('fällt bei Verbindungsfehlern auf die lokale Datenbank zurück', async () => {
    catchgbtChat.mockRejectedValue(new TypeError('Failed to fetch'));
    renderBuddy();
    await ask('Schonzeit Hecht Bayern');

    expect(await screen.findByText(/Meine Online-KI ist gerade nicht erreichbar/)).toBeInTheDocument();
    expect(ai.chatStream).toHaveBeenCalledTimes(1);
  });

  it('zeigt bei einem echten Verbindungsfehler ohne lokalen Treffer eine menschliche Meldung mit Retry statt eines rohen Fehlers', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    catchgbtChat.mockRejectedValue(new TypeError('Failed to fetch'));
    renderBuddy();
    await ask('asdkjhwqe unsinnige anfrage 12345 xyz');

    // Keine rohe Fehlermeldung ("TypeError", "Failed to fetch") im UI —
    // stattdessen eine Buddy-artige Meldung mit Retry-Button.
    const retryButton = await screen.findByRole('button', { name: 'Nochmal versuchen' }, { timeout: 5000 });
    expect(screen.getByText(/Ich erreiche meinen Dienst gerade nicht/)).toBeInTheDocument();
    expect(screen.queryByText(/TypeError/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    // Der technische Fehler wird geloggt, aber nicht angezeigt.
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Retry stellt dieselbe Frage erneut.
    catchgbtChat.mockResolvedValueOnce({ reply: 'Antwort nach Retry.' });
    fireEvent.click(retryButton);
    expect(await screen.findByText('Antwort nach Retry.')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  }, 10000);
});

describe('KiBuddyBeta – Datenquelle (Punkt 8: Wissen vs. KI-Modell)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ai.chatStream.mockRejectedValue(new Error('kein Stream'));
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('Modus "Datenbank": ruft nie das Modell auf, auch bei personenbezogenen Fragen', async () => {
    localStorage.setItem('bb_buddy_data_source', 'database');
    renderBuddy();
    await ask('Welche Köder passen zu meinen letzten Fängen?');

    // Antwort kommt ausschließlich aus der Wissensbasis (Treffer oder ehrlicher
    // Fallback) — nie aus einer Modellanfrage. Auf die Antwort-Bubble warten,
    // bevor "wurde nicht aufgerufen" geprüft wird (sonst prüft man zu früh).
    await waitFor(() => expect(document.querySelectorAll('.bb-voice-bubble').length).toBeGreaterThan(1));
    expect(ai.chatStream).not.toHaveBeenCalled();
    expect(catchgbtChat).not.toHaveBeenCalled();
  });

  it('Modus "KI-Modell": ruft auch bei einer sonst sofort lokal beantworteten Standardfrage das Modell auf', async () => {
    catchgbtChat.mockResolvedValueOnce({ reply: 'Antwort vom Modell.' });
    localStorage.setItem('bb_buddy_data_source', 'model');
    renderBuddy();
    await ask('Welcher Köder ist gut für Hecht?');

    expect(await screen.findByText('Antwort vom Modell.')).toBeInTheDocument();
    expect(ai.chatStream).toHaveBeenCalledTimes(1);
  });

  it('Modus "Auto" (Standard): beantwortet Standardfragen weiterhin sofort lokal', async () => {
    renderBuddy();
    await ask('Welcher Köder ist gut für Hecht?');

    expect(await screen.findByText(/Für Hecht haben sich drei Köder bewährt/)).toBeInTheDocument();
    expect(ai.chatStream).not.toHaveBeenCalled();
  });
});
