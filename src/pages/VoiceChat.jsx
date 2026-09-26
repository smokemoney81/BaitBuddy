import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, PhoneOff, Phone, X, Loader2, User as UserIcon } from 'lucide-react';
import { functions, ai } from '@/api/frontendClient';
import { createSpeechQueue, cancelElevenLabs } from '@/components/utils/elevenLabsTTS';
import { stripActionMarker } from '@/lib/streamingReply';
import { resolveLocalAnswer, getOfflineFallback } from '@/lib/buddyFaq';
import { useFitToViewport } from '@/hooks/useFitToViewport';
import BuddyAvatar from '@/components/ai/BuddyAvatar';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { getVoiceTier } from '@/lib/ttsVoice';

// Status-Phasen des Gesprächs
const PHASE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

const GREETING = 'Hi, ich bin dein KI-Buddy für alles rund ums Angeln. Was möchtest du wissen?';
const MIC_DENIED = 'Mikrofon-Zugriff wurde verweigert. Bitte erlauben und erneut versuchen.';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// Verständliche Meldung für einen gescheiterten Chat-Aufruf. Der Server legt
// bei 503 (fehlender Schlüssel) bzw. 429 (Limit) eine fertige Antwort in
// `reply`/`error` — die hat Vorrang vor einem generischen Text.
function describeChatError(err) {
  const serverText = err?.data?.reply || err?.data?.message;
  if (serverText) return serverText;
  if (err?.status === 401) return 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an, dann können wir weiterreden.';
  if (err?.status === 429) return err?.data?.error || 'Du hast gerade sehr viele Fragen gestellt. Warte kurz und frag dann noch einmal.';
  return null;
}

export default function VoiceChat() {
  const navigate = useNavigate();
  const pageRef = useRef(null);
  useFitToViewport(pageRef);

  const [phase, setPhase] = useState(PHASE.IDLE);
  const [errorMsg, setErrorMsg] = useState('');
  const [transcript, setTranscript] = useState([]); // {role, text, streaming?}
  const [interim, setInterim] = useState('');
  const [muted, setMuted] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioElRef = useRef(null);
  const chatRef = useRef(null);
  const assistantBufRef = useRef('');
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Fallback-Modus (turn-basiert): greift, wenn die OpenAI-Realtime-Verbindung
  // nicht zustande kommt. Pipeline: Web-Speech → gestreamte Claude-Antwort →
  // satzweise TTS (wie KiBuddyBeta), abgesichert durch Retry und lokale FAQ.
  const [fallbackMode, setFallbackMode] = useState(false);
  const fallbackActiveRef = useRef(false);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const queueRef = useRef(null);
  const transcriptRef = useRef([]);

  const updateTranscript = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(transcriptRef.current) : updater;
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

  // Nur der Verlauf scrollt — intern, nie die Seite.
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, interim]);

  const cleanup = useCallback(() => {
    try { dcRef.current?.close(); } catch { /* noop */ }
    try { pcRef.current?.getSenders?.().forEach(s => s.track?.stop()); } catch { /* noop */ }
    try { pcRef.current?.close(); } catch { /* noop */ }
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    if (audioElRef.current) { audioElRef.current.srcObject = null; }
    pcRef.current = null; dcRef.current = null; micStreamRef.current = null;
  }, []);

  const stopFallback = useCallback(() => {
    fallbackActiveRef.current = false;
    try { recognitionRef.current?.abort?.(); } catch { /* noop */ }
    recognitionRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current?.cancel();
    queueRef.current = null;
    cancelElevenLabs();
    setInterim('');
  }, []);

  useEffect(() => () => { cleanup(); stopFallback(); }, [cleanup, stopFallback]);

  const handleEvent = useCallback((evt) => {
    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        setPhase(PHASE.LISTENING);
        break;
      case 'response.created':
        assistantBufRef.current = '';
        setPhase(PHASE.SPEAKING);
        break;
      // GA-Eventnamen ('response.output_audio_transcript.*') und Beta-Namen
      // ('response.audio_transcript.*') parallel behandeln.
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if (evt.delta) assistantBufRef.current += evt.delta;
        break;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
      case 'response.done': {
        const text = (evt.transcript || assistantBufRef.current || '').trim();
        if (text) updateTranscript(prev => [...prev, { role: 'assistant', text }]);
        assistantBufRef.current = '';
        setPhase(PHASE.LISTENING);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = (evt.transcript || '').trim();
        if (text) updateTranscript(prev => [...prev, { role: 'user', text }]);
        break;
      }
      case 'error':
        console.error('Realtime error event', evt);
        break;
      default:
        break;
    }
  }, [updateTranscript]);

  // ── Fallback-Pipeline (turn-basiert) ───────────────────────────────────────
  // Als Funktions-Deklarationen (hoisted), damit sie sich gegenseitig aufrufen
  // können. Sie arbeiten ausschließlich über Refs/Setter und haben daher keine
  // veralteten Closures.

  // Spricht `text` (bzw. die bereits in `queue` gestreamten Sätze) zu Ende und
  // hört danach wieder zu.
  function finishTurn(queue, text) {
    if (!fallbackActiveRef.current) { queue?.cancel(); return; }
    const q = queue || createSpeechQueue({ onDrain: resumeListening });
    queueRef.current = q;
    if (!queue && text) q.push(text);
    setPhase(PHASE.SPEAKING);
    q.flush();
  }

  function resumeListening() {
    queueRef.current = null;
    if (fallbackActiveRef.current) startFallbackRecognition();
  }

  function replyWith(text) {
    updateTranscript(prev => [...prev, { role: 'assistant', text }]);
    finishTurn(null, text);
  }

  async function askFallback(q, attempt = 0) {
    setPhase(PHASE.THINKING);
    const history = transcriptRef.current
      .filter(t => !t.streaming && t.text)
      .map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text }));
    const inConversation = history.length > 2;

    // Standardfragen beantwortet die lokale FAQ sofort, ohne API. Offline
    // gilt das für jede halbwegs passende Frage.
    const offline = isOffline();
    const local = resolveLocalAnswer(q, { online: !offline, inConversation });
    if (local) { replyWith(local.answer); return; }
    if (offline) { replyWith(getOfflineFallback()); return; }

    const controller = new AbortController();
    abortRef.current = controller;
    const queue = createSpeechQueue({ onDrain: resumeListening });
    queueRef.current = queue;
    let raw = '';
    let spokenLen = 0;
    let bubbleAdded = false;

    const showPartial = (visible) => {
      updateTranscript(prev => {
        if (bubbleAdded) {
          const next = prev.slice();
          next[next.length - 1] = { role: 'assistant', text: visible, streaming: true };
          return next;
        }
        bubbleAdded = true;
        return [...prev, { role: 'assistant', text: visible, streaming: true }];
      });
    };
    const dropPartial = () => {
      if (bubbleAdded) updateTranscript(prev => prev.slice(0, -1));
      bubbleAdded = false;
    };

    try {
      let result;
      try {
        result = await ai.chatStream(history.concat({ role: 'user', content: q }), null, {
          signal: controller.signal,
          onDelta: (delta) => {
            if (!fallbackActiveRef.current) return;
            raw += delta;
            const visible = stripActionMarker(raw);
            if (visible.trim()) showPartial(visible);
            if (visible.length > spokenLen) {
              if (phaseRef.current !== PHASE.SPEAKING) setPhase(PHASE.SPEAKING);
              queue.push(visible.slice(spokenLen));
              spokenLen = visible.length;
            }
          },
        });
      } catch (streamErr) {
        if (streamErr?.name === 'AbortError' || controller.signal.aborted) throw streamErr;
        // Streaming nicht verfügbar (SSE blockiert, 401 ohne Refresh im
        // Stream-Pfad …) → gepufferter Standard-Pfad mit Token-Refresh.
        queue.cancel();
        dropPartial();
        spokenLen = 0;
        const res = await functions.invoke('catchgbtChat', {
          messages: history.concat({ role: 'user', content: q }),
          context: 'voice_chat',
        });
        result = { reply: res?.reply || res?.message };
      }

      if (!fallbackActiveRef.current) return;
      const answer = (result?.reply || stripActionMarker(raw) || '').trim()
        || 'Entschuldige, ich habe gerade keine Antwort parat.';
      updateTranscript(prev => {
        const base = bubbleAdded ? prev.slice(0, -1) : prev;
        return [...base, { role: 'assistant', text: answer }];
      });
      bubbleAdded = false;
      finishTurn(spokenLen > 0 ? queue : null, answer);
    } catch (err) {
      if (err?.name === 'AbortError' || !fallbackActiveRef.current) return;
      queue.cancel();
      dropPartial();

      const known = describeChatError(err);
      if (known) { replyWith(known); return; }

      // Netz-/Serverfehler ohne verwertbare Antwort: einmal kurz neu versuchen,
      // dann auf das lokale Wissen ausweichen statt nur „Verbindungsproblem".
      if (attempt < 1) {
        await new Promise(r => setTimeout(r, 800));
        if (fallbackActiveRef.current) askFallback(q, attempt + 1);
        return;
      }
      const offlineAnswer = resolveLocalAnswer(q, { online: false });
      replyWith(offlineAnswer?.answer || getOfflineFallback());
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function startFallbackRecognition() {
    if (!fallbackActiveRef.current || recognitionRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErrorMsg('Spracherkennung wird von diesem Browser nicht unterstützt.');
      setPhase(PHASE.ERROR);
      stopFallback();
      setFallbackMode(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim((finalText + live).trim());
    };
    rec.onend = () => {
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      setInterim('');
      const q = finalText.trim();
      if (!fallbackActiveRef.current) return;
      if (!q) { startFallbackRecognition(); return; }
      updateTranscript(prev => [...prev, { role: 'user', text: q }]);
      askFallback(q);
    };
    rec.onerror = (ev) => {
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
        recognitionRef.current = null;
        stopFallback();
        setFallbackMode(false);
        setErrorMsg(MIC_DENIED);
        setPhase(PHASE.ERROR);
      }
      // no-speech u. Ä.: onend startet einfach neu.
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setPhase(PHASE.LISTENING);
    } catch {
      recognitionRef.current = null;
    }
  }

  function startFallbackConversation() {
    fallbackActiveRef.current = true;
    setFallbackMode(true);
    setErrorMsg('');
    if (transcriptRef.current.length) {
      startFallbackRecognition();
    } else {
      replyWith(GREETING);
    }
  }

  async function start() {
    setErrorMsg('');
    setPhase(PHASE.CONNECTING);
    try {
      if (isOffline()) throw new Error('offline');
      // Live-Voice (Realtime) gibt es ab Ultimate; kleinere Pläne sprechen
      // turn-basiert mit der Gerätestimme. Das verbindliche Gate sitzt im Backend.
      if (getVoiceTier() !== 'premium') throw new Error('live_voice_requires_ultimate');
      // 1) Kurzlebiges Token vom eigenen Backend holen (echter Key bleibt serverseitig)
      const session = await functions.invoke('realtimeSession');
      const ephemeralKey = session?.client_secret?.value;
      const model = session?.model || 'gpt-realtime';
      if (!ephemeralKey) {
        throw new Error(session?.error || 'Kein Voice-Token erhalten.');
      }

      // 2) Audio-Element für die Antwort-Stimme
      const audioEl = audioElRef.current || new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      // 3) WebRTC-Peer
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'failed' || st === 'disconnected' || st === 'closed') {
          if (pcRef.current === pc && phaseRef.current !== PHASE.IDLE && phaseRef.current !== PHASE.ERROR) {
            // Verbindung weg → Gespräch im turn-basierten Modus fortsetzen.
            cleanup();
            setMuted(false);
            startFallbackConversation();
          }
        }
      };

      // 4) Mikrofon
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
      mic.getTracks().forEach(t => pc.addTrack(t, mic));

      // 5) Datenkanal für Events / Transkript
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch { /* noop */ } };
      dc.onopen = () => setPhase(PHASE.LISTENING);

      // 6) SDP-Offer an OpenAI
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // GA-API: SDP-Austausch laeuft ueber /v1/realtime/calls (der alte
      // Beta-Pfad /v1/realtime wurde zusammen mit /v1/realtime/sessions entfernt).
      const resp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!resp.ok) throw new Error('OpenAI-Verbindung fehlgeschlagen (' + resp.status + ')');
      const answerSdp = await resp.text();
      // Falls der Nutzer zwischenzeitlich aufgelegt/die Seite verlassen hat,
      // ist die Verbindung schon zu — dann nicht mehr fortsetzen.
      if (pcRef.current !== pc) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      cleanup();
      if (phaseRef.current === PHASE.IDLE) return; // zwischenzeitlich aufgelegt
      // Mikrofon-Verweigerung würde auch den Fallback treffen -> direkt melden.
      if (e?.name === 'NotAllowedError' || /Permission/i.test(e?.message || '')) {
        setErrorMsg(MIC_DENIED);
        setPhase(PHASE.ERROR);
        toast.error(MIC_DENIED);
        return;
      }
      // Realtime nicht verfügbar (kein Key, Netzfehler, 4xx/5xx) -> nahtlos auf
      // die turn-basierte Pipeline wechseln, damit das Gespräch trotzdem läuft.
      if (e?.message === 'live_voice_requires_ultimate' || e?.status === 403) {
        toast.info('Live-Gespräch gibt es mit Ultimate. Wir sprechen Schritt für Schritt weiter.');
      } else {
        console.warn('[VoiceChat] Realtime nicht verfügbar, wechsle auf Fallback:', e?.message);
      }
      startFallbackConversation();
    }
  }

  const hangUp = useCallback(() => {
    stopFallback();
    cleanup();
    setFallbackMode(false);
    setMuted(false);
    updateTranscript(prev => prev.filter(t => !t.streaming));
    setPhase(PHASE.IDLE);
  }, [cleanup, stopFallback, updateTranscript]);

  const toggleMute = useCallback(() => {
    const tracks = micStreamRef.current?.getAudioTracks() || [];
    const next = !muted;
    tracks.forEach(t => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const active = phase === PHASE.LISTENING || phase === PHASE.SPEAKING || phase === PHASE.THINKING;
  const statusText = {
    [PHASE.IDLE]: transcript.length ? 'Gespräch beendet' : 'Bereit für ein Gespräch',
    [PHASE.CONNECTING]: 'Verbinde…',
    [PHASE.LISTENING]: muted ? 'Mikrofon stumm' : 'Ich höre zu…',
    [PHASE.THINKING]: 'Buddy überlegt…',
    [PHASE.SPEAKING]: 'Buddy spricht…',
    [PHASE.ERROR]: errorMsg,
  }[phase];

  return (
    <div ref={pageRef} className="bb-page bb-voice bb-live">
      <div className="bb-live-head">
        <div className="bb-live-title">
          <h1>Live-Gespräch</h1>
          <span className={`bb-live-badge ${active ? 'is-on' : ''}`}>
            <i />{active ? (fallbackMode ? 'Sprachmodus' : 'Live') : 'Bereit'}
          </span>
        </div>
        <button type="button"
          onClick={() => { hangUp(); navigate(createPageUrl('KiBuddyBeta')); }}
          className="bb-live-close"
          aria-label="Schließen"
        >
          <X size={18} />
        </button>
      </div>

      <div className={`bb-live-stage is-${phase}`}>
        <div className="bb-live-orb">
          <span className="bb-live-ring" />
          <span className="bb-live-ring is-delayed" />
          {phase === PHASE.CONNECTING ? (
            <div className="bb-live-orb-loading"><Loader2 size={34} className="animate-spin" /></div>
          ) : (
            <BuddyAvatar speaking={phase === PHASE.SPEAKING} listening={phase === PHASE.LISTENING} size={96} />
          )}
        </div>
        <div className="bb-live-status">
          <div className={`bb-live-bars ${active ? 'is-on' : ''}`} aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <p className={phase === PHASE.ERROR ? 'is-error' : ''} role="status" aria-live="polite">{statusText}</p>
        </div>
      </div>

      <div ref={chatRef} className="bb-voice-chat bb-live-chat">
        {transcript.length === 0 && !interim && (
          <p className="bb-live-hint">
            {phase === PHASE.IDLE
              ? 'Tippe auf „Gespräch starten“ und frag einfach drauflos, wie am Telefon — zum Beispiel: „Wie fange ich eine Forelle?“'
              : 'Das Gespräch erscheint hier als Text.'}
          </p>
        )}
        {transcript.map((t, i) => (
          <div key={i} className={`bb-voice-row ${t.role === 'user' ? 'is-user' : ''}`}>
            {t.role !== 'user' && <span className="bb-voice-avatar"><BuddyAvatar size={34} /></span>}
            <div className={`bb-voice-bubble ${t.role === 'user' ? 'is-user' : ''}`}>{t.text}</div>
            {t.role === 'user' && <span className="bb-voice-avatar is-user"><UserIcon size={16} /></span>}
          </div>
        ))}
        {interim && (
          <div className="bb-voice-row is-user">
            <div className="bb-voice-bubble is-user is-interim">{interim}</div>
          </div>
        )}
        {phase === PHASE.THINKING && !transcript[transcript.length - 1]?.streaming && (
          <div className="bb-voice-row">
            <span className="bb-voice-avatar"><BuddyAvatar size={34} /></span>
            <div className="bb-voice-bubble"><span className="bb-voice-typing"><i /><i /><i /></span></div>
          </div>
        )}
      </div>

      <div className="bb-live-controls">
        {!active && phase !== PHASE.CONNECTING ? (
          <button type="button" onClick={start} className="bb-live-call is-start">
            <Phone size={20} /> {phase === PHASE.IDLE && !transcript.length ? 'Gespräch starten' : 'Erneut verbinden'}
          </button>
        ) : (
          <>
            {/* Stummschalten nur im echten Realtime-Modus (persistenter Mic-Stream) */}
            {!fallbackMode && (
              <button type="button"
                onClick={toggleMute}
                disabled={phase === PHASE.CONNECTING}
                className={`bb-live-round ${muted ? 'is-muted' : ''}`}
                aria-label={muted ? 'Stummschaltung aufheben' : 'Stummschalten'}
              >
                {muted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            <button type="button" onClick={hangUp} className="bb-live-call is-end">
              <PhoneOff size={20} /> Beenden
            </button>
          </>
        )}
      </div>
    </div>
  );
}
