import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Phone, Loader2, User as UserIcon } from 'lucide-react';
import { functions } from '@/api/frontendClient';
import BuddyAvatar from '@/components/ai/BuddyAvatar';
import { getVoiceTier } from '@/lib/ttsVoice';

const PHASE = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

const MIC_DENIED = 'Mikrofon-Zugriff wurde verweigert. Bitte erlauben und erneut versuchen.';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Live-Modus des gemeinsamen "Buddy Live"-Screens: echtes Vollduplex-Gespräch
 * über OpenAI Realtime (WebRTC) — ab Pro, siehe requirePremiumVoice serverseitig.
 * Finalisierte Turns werden zusätzlich in den geteilten Gesprächsverlauf des
 * Eltern-Screens geschrieben (appendMessages), damit ein Wechsel zurück in den
 * Chat-Modus denselben Kontext zeigt. Steht die Realtime-Verbindung nicht zur
 * Verfügung (kein Pro-Plan, offline, Verbindungsabbruch), übergibt dieser
 * Modus über `onFallback` an die bereits vorhandene, turn-basierte
 * Gesprächs-Engine des Eltern-Screens (Chat-Modus mit Freisprechen) — statt
 * eine zweite, eigene Fallback-Pipeline zu pflegen.
 *
 * @param {{ appendMessages: (msg: {role:string, text:string}) => void, onFallback: (reason: string) => void }} props
 */
export default function BuddyLiveCallView({ appendMessages, onFallback }) {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [errorMsg, setErrorMsg] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioElRef = useRef(null);
  const chatRef = useRef(null);
  const assistantBufRef = useRef('');
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const cleanup = useCallback(() => {
    try { dcRef.current?.close(); } catch { /* noop */ }
    try { pcRef.current?.getSenders?.().forEach(s => s.track?.stop()); } catch { /* noop */ }
    try { pcRef.current?.close(); } catch { /* noop */ }
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    if (audioElRef.current) { audioElRef.current.srcObject = null; }
    pcRef.current = null; dcRef.current = null; micStreamRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const pushTurn = useCallback((role, text) => {
    if (!text) return;
    setTranscript(prev => [...prev, { role, text }]);
    appendMessages({ role: role === 'user' ? 'user' : 'assistant', text });
  }, [appendMessages]);

  const handleEvent = useCallback((evt) => {
    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        setPhase(PHASE.LISTENING);
        break;
      case 'response.created':
        assistantBufRef.current = '';
        setPhase(PHASE.SPEAKING);
        break;
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if (evt.delta) assistantBufRef.current += evt.delta;
        break;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
      case 'response.done': {
        const text = (evt.transcript || assistantBufRef.current || '').trim();
        pushTurn('assistant', text);
        assistantBufRef.current = '';
        setPhase(PHASE.LISTENING);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        pushTurn('user', (evt.transcript || '').trim());
        break;
      }
      case 'error':
        console.error('Realtime error event', evt);
        break;
      default:
        break;
    }
  }, [pushTurn]);

  async function start() {
    setErrorMsg('');
    setPhase(PHASE.CONNECTING);
    try {
      if (isOffline()) throw new Error('offline');
      // Live-Voice (Realtime) gibt es ab Pro; das verbindliche Gate sitzt im Backend.
      if (getVoiceTier() !== 'premium') throw new Error('live_voice_requires_pro');
      const session = await functions.invoke('realtimeSession');
      const ephemeralKey = session?.client_secret?.value;
      const model = session?.model || 'gpt-realtime';
      if (!ephemeralKey) {
        throw new Error(session?.error || 'Kein Voice-Token erhalten.');
      }

      const audioEl = audioElRef.current || new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'failed' || st === 'disconnected' || st === 'closed') {
          if (pcRef.current === pc && phaseRef.current !== PHASE.IDLE && phaseRef.current !== PHASE.ERROR) {
            cleanup();
            setMuted(false);
            setPhase(PHASE.IDLE);
            onFallback('Die Live-Verbindung ist abgebrochen. Wir sprechen jetzt Schritt für Schritt weiter.');
          }
        }
      };

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
      mic.getTracks().forEach(t => pc.addTrack(t, mic));

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch { /* noop */ } };
      dc.onopen = () => setPhase(PHASE.LISTENING);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

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
      if (pcRef.current !== pc) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      cleanup();
      if (phaseRef.current === PHASE.IDLE) return;
      if (e?.name === 'NotAllowedError' || /Permission/i.test(e?.message || '')) {
        setErrorMsg(MIC_DENIED);
        setPhase(PHASE.ERROR);
        return;
      }
      setPhase(PHASE.IDLE);
      const reason = e?.message === 'live_voice_requires_pro' || e?.status === 403
        ? 'Live-Gespräch gibt es ab dem Pro-Plan. Wir sprechen Schritt für Schritt weiter.'
        : 'Live-Gespräch gerade nicht verfügbar. Wir sprechen Schritt für Schritt weiter.';
      onFallback(reason);
    }
  }

  const hangUp = useCallback(() => {
    cleanup();
    setMuted(false);
    setTranscript([]);
    setPhase(PHASE.IDLE);
  }, [cleanup]);

  useEffect(() => () => hangUp(), []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="bb-live">
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
        {transcript.length === 0 && (
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
      </div>

      <div className="bb-live-controls">
        {!active && phase !== PHASE.CONNECTING ? (
          <button type="button" onClick={start} className="bb-live-call is-start">
            <Phone size={20} /> {phase === PHASE.IDLE && !transcript.length ? 'Gespräch starten' : 'Erneut verbinden'}
          </button>
        ) : (
          <>
            <button type="button"
              onClick={toggleMute}
              disabled={phase === PHASE.CONNECTING}
              className={`bb-live-round ${muted ? 'is-muted' : ''}`}
              aria-label={muted ? 'Stummschaltung aufheben' : 'Stummschalten'}
            >
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button type="button" onClick={hangUp} className="bb-live-call is-end">
              <PhoneOff size={20} /> Beenden
            </button>
          </>
        )}
      </div>
    </div>
  );
}
