import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/api/frontendClient', () => ({
  functions: { invoke: (...args) => invokeMock(...args) },
}));

import {
  speakWithFallback,
  speakWithElevenLabs,
  cancelElevenLabs,
  splitIntoSentences,
  createSpeechQueue,
} from './elevenLabsTTS';

const tick = () => new Promise((r) => setTimeout(r, 0));

// Alle abgespielten FakeAudio-Instanzen, um Überlappungen prüfen zu können.
let audioInstances;
let lastAudio;

class FakeAudio {
  constructor(url) {
    this.src = url;
    this.onended = null;
    this.onerror = null;
    this.paused = false;
    audioInstances.push(this);
    lastAudio = this;
  }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}

beforeEach(() => {
  vi.clearAllMocks();
  audioInstances = [];
  lastAudio = null;

  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('Audio', FakeAudio);

  invokeMock.mockResolvedValue({ audioBase64: btoa('audio-bytes'), contentType: 'audio/mpeg' });
});

afterEach(() => {
  // Modul-globalen Singleton-Zustand (currentAudio/Generation) zurücksetzen.
  cancelElevenLabs();
  vi.unstubAllGlobals();
});

describe('speakWithFallback – Blob-URL-Leak-Regression', () => {
  it('gibt die Blob-URL beim onended frei (revokeObjectURL)', async () => {
    const p = speakWithFallback('Hallo Welt', { voiceEnabled: true });

    // Warten, bis play() aufgelöst und die (gewrappten) Handler gesetzt sind.
    await new Promise((r) => setTimeout(r, 0));
    expect(lastAudio).not.toBeNull();
    expect(typeof lastAudio.onended).toBe('function');

    // Audio-Ende simulieren → Original-Cleanup muss die URL freigeben.
    lastAudio.onended();
    await p;

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('überschreibt die Original-Cleanup-Handler nicht (onended bleibt eine Funktion)', async () => {
    const p = speakWithFallback('Hallo Welt', { voiceEnabled: true });
    await new Promise((r) => setTimeout(r, 0));

    // Der gewrappte Handler muss weiterhin gesetzt sein — würde speakWithFallback
    // ihn wie früher plump durch `resolve` ersetzen, ginge die Freigabe verloren.
    expect(typeof lastAudio.onended).toBe('function');

    lastAudio.onended();
    await p;
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('speakWithFallback – nur die ElevenLabs-Stimme, still bei Fehlern', () => {
  it('löst still auf, wenn der TTS-Request fehlschlägt (kein Browser-TTS-Fallback)', async () => {
    invokeMock.mockRejectedValue(new Error('offline'));

    await expect(speakWithFallback('Hallo', { voiceEnabled: true })).resolves.toBeUndefined();
    expect(audioInstances).toHaveLength(0);
  });

  it('löst still auf, wenn kein Audio geliefert wird (z. B. API-Key fehlt)', async () => {
    invokeMock.mockResolvedValue({ error: 'ELEVENLABS_API_KEY not configured' });

    await expect(speakWithFallback('Hallo', { voiceEnabled: true })).resolves.toBeUndefined();
    expect(audioInstances).toHaveLength(0);
  });

  it('spielt nichts ab, wenn voiceEnabled false ist', async () => {
    await speakWithFallback('Hallo', { voiceEnabled: false });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe('speakWithElevenLabs – überlappende Aufrufe (Doppelstimmen-Race)', () => {
  it('verwirft die ältere Antwort, wenn während des Requests ein neuer Aufruf startet', async () => {
    // Erster Aufruf: Request bleibt hängen, bis wir ihn manuell auflösen.
    let resolveFirst;
    invokeMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; })
    );

    const first = speakWithElevenLabs('Erster Text');
    await new Promise((r) => setTimeout(r, 0));

    // Zweiter Aufruf übernimmt (löst sofort auf und spielt ab).
    const second = await speakWithElevenLabs('Zweiter Text');
    expect(second).toBeInstanceOf(FakeAudio);
    expect(audioInstances).toHaveLength(1);

    // Jetzt trifft die verspätete Antwort des ersten Aufrufs ein: Sie darf
    // KEIN zweites Audio erzeugen — sonst sprächen zwei Stimmen gleichzeitig.
    resolveFirst({ audioBase64: btoa('altes-audio'), contentType: 'audio/mpeg' });
    await expect(first).resolves.toBeNull();
    expect(audioInstances).toHaveLength(1);
  });

  it('cancelElevenLabs verhindert die Wiedergabe eines noch laufenden Requests', async () => {
    let resolveRequest;
    invokeMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveRequest = resolve; })
    );

    const speaking = speakWithElevenLabs('Text');
    await new Promise((r) => setTimeout(r, 0));

    cancelElevenLabs();
    resolveRequest({ audioBase64: btoa('audio'), contentType: 'audio/mpeg' });

    await expect(speaking).resolves.toBeNull();
    expect(audioInstances).toHaveLength(0);
  });
});

describe('splitIntoSentences', () => {
  it('teilt an Satzgrenzen, wenn die Mindestlänge erreicht ist', () => {
    const { sentences, rest } = splitIntoSentences(
      'Der erste Satz ist lang genug hier. Der zweite Satz auch, keine Frage.',
    );
    expect(sentences).toEqual([
      'Der erste Satz ist lang genug hier.',
      'Der zweite Satz auch, keine Frage.',
    ]);
    expect(rest).toBe('');
  });

  it('verschmilzt zu kurze Fragmente mit dem Folgesatz (kein Zerhacken)', () => {
    // "Ja." (3 Zeichen) ist zu kurz → wird mit dem nächsten Satz zusammengefasst.
    const { sentences } = splitIntoSentences('Ja. Genau das habe ich auch gedacht, Kollege.');
    expect(sentences).toEqual(['Ja. Genau das habe ich auch gedacht, Kollege.']);
  });

  it('splittet nicht an Dezimalzahlen (Punkt ohne folgendes Whitespace)', () => {
    const { sentences } = splitIntoSentences('Der Fisch wog stolze 3.5 kg und war richtig kräftig.');
    expect(sentences).toEqual(['Der Fisch wog stolze 3.5 kg und war richtig kräftig.']);
  });

  it('gibt unvollständige Sätze als rest zurück, bis geflusht wird', () => {
    const partial = splitIntoSentences('Ein noch nicht beendeter Satz ohne Ende');
    expect(partial.sentences).toEqual([]);
    expect(partial.rest).toBe('Ein noch nicht beendeter Satz ohne Ende');

    const flushed = splitIntoSentences('Ein noch nicht beendeter Satz ohne Ende', { flush: true });
    expect(flushed.sentences).toEqual(['Ein noch nicht beendeter Satz ohne Ende']);
    expect(flushed.rest).toBe('');
  });
});

describe('createSpeechQueue – satzweise, pipelined Wiedergabe', () => {
  it('spielt Sätze in Reihenfolge und ruft onDrain nach dem letzten', async () => {
    const onDrain = vi.fn();
    const q = createSpeechQueue({ onDrain });
    q.push('Der erste Satz ist lang genug hier. Der zweite Satz ist ebenfalls lang genug.');
    q.flush();

    // Erster Satz wird synthetisiert und abgespielt.
    await tick();
    expect(audioInstances).toHaveLength(1);
    expect(onDrain).not.toHaveBeenCalled();

    // Ende des ersten Satzes → zweiter Satz startet.
    lastAudio.onended();
    await tick();
    expect(audioInstances).toHaveLength(2);

    // Ende des zweiten (letzten) Satzes → onDrain feuert.
    lastAudio.onended();
    await tick();
    expect(onDrain).toHaveBeenCalledTimes(1);
  });

  it('cancel() bricht die Queue ab — kein weiteres Audio, kein onDrain', async () => {
    const onDrain = vi.fn();
    const q = createSpeechQueue({ onDrain });
    q.push('Der erste Satz ist lang genug hier. Der zweite Satz ist ebenfalls lang genug.');
    q.flush();

    await tick();
    expect(audioInstances).toHaveLength(1);

    q.cancel();
    // Das Ende-Event des laufenden Audios darf keinen weiteren Satz starten.
    lastAudio.onended();
    await tick();
    expect(audioInstances).toHaveLength(1);
    expect(onDrain).not.toHaveBeenCalled();
  });

  it('eine neue Queue löst die alte ab (Generation-Token)', async () => {
    const onDrainOld = vi.fn();
    const oldQ = createSpeechQueue({ onDrain: onDrainOld });
    oldQ.push('Der erste Satz ist lang genug hier.');
    oldQ.flush();
    await tick();
    expect(audioInstances).toHaveLength(1);

    // Neue Queue übernimmt den Singleton; die alte darf nicht weiterlaufen.
    const newQ = createSpeechQueue({});
    oldQ.push('Dieser Satz darf nicht mehr gesprochen werden, wirklich nicht.');
    oldQ.flush();
    await tick();
    // Kein zusätzliches Audio aus der alten Queue.
    expect(audioInstances).toHaveLength(1);
    newQ.cancel();
  });
});

describe('Stimmen-Stufe nach Plan', () => {
  let spoken;
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  beforeEach(async () => {
    spoken = [];
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      speak: (u) => { spoken.push(u); },
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'de-DE', localService: true, name: 'Deutsch' }],
    });
  });
  afterEach(async () => {
    const { setVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('browser');
  });

  it('Basic/Pro (browser) sprechen mit der Gerätestimme ohne Server-Aufruf', async () => {
    const { setVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('browser');
    const p = speakWithFallback('Hallo Angler', { voiceEnabled: true });
    await tick();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('de-DE');
    spoken[0].onend();
    await p;
  });

  it('Ultimate (premium) nutzt die Server-Stimme', async () => {
    const { setVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('premium');
    const p = speakWithFallback('Hallo Angler', { voiceEnabled: true });
    await tick();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(0);
    lastAudio.onended();
    await p;
  });

  it('fällt bei 403 premium_voice_required auf die Gerätestimme zurück und bleibt dort', async () => {
    const { setVoiceTier, getVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('premium');
    invokeMock.mockRejectedValueOnce(Object.assign(new Error('HTTP 403'), { status: 403, data: { code: 'premium_voice_required' } }));
    const p = speakWithFallback('Hallo', { voiceEnabled: true });
    await tick();
    expect(spoken).toHaveLength(1);
    expect(getVoiceTier()).toBe('browser');
    spoken[0].onend();
    await p;
  });

  it('Satz-Queue spricht im Browser-Modus satzweise mit der Gerätestimme', async () => {
    const q = createSpeechQueue();
    q.push('Das ist der erste lange Satz hier. Und das ist der zweite lange Satz.');
    q.flush();
    await tick();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(1);
    spoken[0].onend();
    await tick(); await tick();
    expect(spoken).toHaveLength(2);
  });
});

// Regressionstests zum Mehrfach-Stimmen-Bug: Tier und Cloud-Provider wurden
// früher PRO SATZ neu ermittelt statt einmal pro Antwort/Queue gepinnt — ein
// Plan-Update oder ein transienter Provider-Fehler mitten in einer Antwort
// konnte dadurch hörbar die Stimme wechseln.
describe('Eine Stimme pro Antwort (Tier- und Provider-Pinning)', () => {
  let spoken;
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  beforeEach(() => {
    spoken = [];
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      speak: (u) => { spoken.push(u); },
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'de-DE', localService: true, name: 'Deutsch' }],
    });
  });
  afterEach(async () => {
    const { setVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('browser');
  });

  it('bleibt bei der Gerätestimme für den Rest der Antwort, auch wenn der Tier mittendrin auf premium wechselt', async () => {
    const { setVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('browser');

    const q = createSpeechQueue();
    q.push('Das ist der erste lange Satz hier. Und das ist der zweite lange Satz danach.');
    q.flush();
    await tick();
    expect(spoken).toHaveLength(1);
    expect(invokeMock).not.toHaveBeenCalled();

    // Plan-Update kommt mitten in der Antwort an (z.B. Kauf-Webhook) —
    // darf den bereits laufenden Satz-Stream nicht auf Premium umschalten.
    setVoiceTier('premium');
    spoken[0].onend();
    await tick(); await tick();

    expect(spoken).toHaveLength(2);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('pinnt den Cloud-Provider des ersten Satzes ab dem dritten Satz dieser Antwort', async () => {
    // Satz 2 wird bereits parallel zu Satz 1 vorab angefordert (Pipelining
    // "spricht, bevor die ganze Antwort fertig ist" — CLAUDE.md), BEVOR
    // bekannt ist, welcher Provider Satz 1 beantwortet hat. Das Pinning greift
    // deshalb technisch bedingt erst ab Satz 3 — das genügt, um den
    // gemeldeten Bug (wiederholte Stimmwechsel über eine ganze Antwort) zu
    // beheben, ohne die Latenz-kritische Pipelining-Optimierung zu opfern.
    const { setVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('premium');

    invokeMock.mockResolvedValueOnce({ audioBase64: btoa('satz-1'), contentType: 'audio/mpeg', provider: 'openai' });
    invokeMock.mockResolvedValueOnce({ audioBase64: btoa('satz-2'), contentType: 'audio/mpeg', provider: 'openai' });
    invokeMock.mockResolvedValueOnce({ audioBase64: btoa('satz-3'), contentType: 'audio/mpeg', provider: 'openai' });

    const q = createSpeechQueue();
    q.push('Das ist der erste lange Satz hier. Und das ist der zweite lange Satz danach. Und hier kommt noch ein dritter langer Satz.');
    q.flush();
    await tick();
    expect(audioInstances).toHaveLength(1);
    // Erster Satz: noch kein gepinnter Provider.
    expect(invokeMock.mock.calls[0][1]).toMatchObject({ preferred_provider: undefined });

    lastAudio.onended();
    await tick(); await tick();
    expect(audioInstances).toHaveLength(2);

    lastAudio.onended();
    await tick(); await tick();
    expect(audioInstances).toHaveLength(3);
    // Dritter Satz: der vom ersten Satz gemeldete Provider wird mitgeschickt.
    expect(invokeMock.mock.calls[2][1]).toMatchObject({ preferred_provider: 'openai' });
  });
});

describe('Lautlos und Sprech-Status', () => {
  afterEach(async () => {
    const { setVoiceMuted } = await import('@/lib/voiceActivity');
    setVoiceMuted(false);
  });

  it('spricht nicht, wenn lautlos geschaltet ist', async () => {
    const { setVoiceMuted } = await import('@/lib/voiceActivity');
    setVoiceMuted(true);
    await speakWithFallback('Hallo', { voiceEnabled: true });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(audioInstances).toHaveLength(0);
  });

  it('meldet Sprechen während der Wiedergabe', async () => {
    const { isVoiceSpeaking } = await import('@/lib/voiceActivity');
    const { setVoiceTier } = await import('@/lib/ttsVoice');
    setVoiceTier('premium');
    const p = speakWithFallback('Hallo', { voiceEnabled: true });
    await tick();
    expect(isVoiceSpeaking()).toBe(true);
    lastAudio.onended();
    await p;
    setVoiceTier('browser');
  });
});
