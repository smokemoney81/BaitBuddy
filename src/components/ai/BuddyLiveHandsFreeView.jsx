import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, Check, AudioLines, MessageSquare, MapPin, CalendarDays, Clock, Fish,
  Lightbulb, Pause, Play, Power, Square, ShieldCheck, Loader2, Compass,
} from 'lucide-react';
import { FishingPlan } from '@/entities/FishingPlan';
import { selectNextTrip, readPlanSpot } from '@/lib/tripJourney';
import { readTripStart, writeTripStart } from '@/lib/anglerMode';
import { readPrivacyPrefs } from '@/lib/privacyPrefs';
import { detectWakeWord, HANDS_FREE_EXAMPLES, HANDS_FREE_IDLE_SECONDS } from '@/lib/wakeWord';
import { fishImageFor } from '@/lib/fishImages';

const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);
const RESTART_DELAY_MS = 500;

function getRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function formatSince(startMs, now) {
  if (!startMs) return '';
  const minutes = Math.max(0, Math.floor((now - startMs) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `Seit ${h}h ${m}min` : `Seit ${m} min`;
}

const STEPS = [
  { id: 'wake', icon: Check, title: 'Erkannt', text: 'Aktivierungswort' },
  { id: 'listening', icon: Mic, title: 'Mikro offen', text: 'Ich höre zu …' },
  { id: 'thinking', icon: AudioLines, title: 'Ende erkannt', text: 'Ich denke nach' },
  { id: 'speaking', icon: MessageSquare, title: 'Antwort', text: 'Ich antworte dir' },
];
const STEP_INDEX = { waiting: -1, listening: 1, thinking: 2, speaking: 3 };

export default function BuddyLiveHandsFreeView({ onAsk, registerSpeakingDoneHandler, speakingStatus, lastAnswerText }) {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(() => readPrivacyPrefs());
  const wakeWordOn = prefs.wakeWord;
  const wakePhrase = prefs.wakeWordPhrase || 'Hey Buddy';
  const Recognition = getRecognition();

  const [plan, setPlan] = useState(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [startMs, setStartMs] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [phase, setPhase] = useState('off');
  const [heard, setHeard] = useState('');
  const [notice, setNotice] = useState('');
  const [idleLeft, setIdleLeft] = useState(HANDS_FREE_IDLE_SECONDS);

  const phaseRef = useRef('off');
  const activeRef = useRef(false);
  const recRef = useRef(null);
  const restartRef = useRef(null);
  const generationRef = useRef(0);
  const lastSpeechRef = useRef(Date.now());
  const utteranceRef = useRef(() => {});

  const setPhaseBoth = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    const update = (event) => setPrefs(event.detail || readPrivacyPrefs());
    window.addEventListener('privacy-prefs-changed', update);
    return () => window.removeEventListener('privacy-prefs-changed', update);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await FishingPlan.list('-created_at');
        if (!alive) return;
        const next = selectNextTrip(Array.isArray(list) ? list : []);
        const active = next && next.is_active ? next : null;
        setPlan(active);
        if (active) {
          let s = readTripStart(active.id);
          if (!s) { s = Date.now(); writeTripStart(active.id, s); }
          setStartMs(s);
        }
      } catch {
        if (alive) setPlan(null);
      } finally {
        if (alive) setLoadingTrip(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const stopRecognition = useCallback(() => {
    clearTimeout(restartRef.current);
    generationRef.current += 1;
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try { rec.abort ? rec.abort() : rec.stop(); } catch { /* bereits beendet */ }
  }, []);

  const releaseVoiceSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent('baitbuddy-voice-session-end'));
  }, []);

  const stopHandsFree = useCallback((message = '') => {
    activeRef.current = false;
    stopRecognition();
    setPhaseBoth('off');
    setHeard('');
    setIdleLeft(HANDS_FREE_IDLE_SECONDS);
    releaseVoiceSession();
    if (message) setNotice(message);
  }, [releaseVoiceSession, setPhaseBoth, stopRecognition]);

  const listenPhase = wakeWordOn ? 'waiting' : 'listening';

  const startRecognition = useCallback(() => {
    if (!Recognition || recRef.current || !activeRef.current || document.visibilityState !== 'visible') return;
    const generation = generationRef.current;
    const rec = new Recognition();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      if (generation !== generationRef.current || recRef.current !== rec) return;
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim || finalText) lastSpeechRef.current = Date.now();
      if (interim && phaseRef.current === 'listening') setHeard(interim);
      const text = finalText.trim();
      if (text) utteranceRef.current(text);
    };
    rec.onerror = (event) => {
      if (generation !== generationRef.current || recRef.current !== rec) return;
      if (FATAL_ERRORS.has(event?.error)) {
        stopHandsFree('Kein Zugriff auf das Mikrofon. Erlaube es unter Privatsphäre & Berechtigungen.');
      }
    };
    rec.onend = () => {
      if (generation !== generationRef.current) return;
      if (recRef.current === rec) recRef.current = null;
      const p = phaseRef.current;
      if (activeRef.current && document.visibilityState === 'visible' && (p === 'waiting' || p === 'listening')) {
        clearTimeout(restartRef.current);
        restartRef.current = setTimeout(() => {
          if (generation === generationRef.current) startRecognition();
        }, RESTART_DELAY_MS);
      }
    };
    try {
      rec.start();
      recRef.current = rec;
    } catch {
      recRef.current = null;
    }
  }, [Recognition, stopHandsFree]);

  const resumeListening = useCallback(() => {
    if (!activeRef.current) return;
    lastSpeechRef.current = Date.now();
    setHeard('');
    setPhaseBoth(listenPhase);
    startRecognition();
  }, [listenPhase, setPhaseBoth, startRecognition]);

  const ask = useCallback((question) => {
    stopRecognition();
    setPhaseBoth('thinking');
    setHeard(question);
    onAsk(question);
  }, [onAsk, setPhaseBoth, stopRecognition]);

  utteranceRef.current = (text) => {
    if (phaseRef.current === 'waiting') {
      const { detected, command } = detectWakeWord(text, wakePhrase);
      if (!detected) return;
      if (command) { ask(command); return; }
      setHeard('');
      setPhaseBoth('listening');
      return;
    }
    if (phaseRef.current === 'listening') ask(text);
  };

  const startHandsFree = () => {
    if (!Recognition || document.visibilityState !== 'visible') return;
    window.dispatchEvent(new CustomEvent('baitbuddy-voice-session-start'));
    setNotice('');
    activeRef.current = true;
    lastSpeechRef.current = Date.now();
    setPhaseBoth(listenPhase);
    startRecognition();
  };

  const togglePause = () => {
    if (phaseRef.current === 'paused') {
      window.dispatchEvent(new CustomEvent('baitbuddy-voice-session-start'));
      resumeListening();
      return;
    }
    stopRecognition();
    setPhaseBoth('paused');
    releaseVoiceSession();
  };

  useEffect(() => {
    registerSpeakingDoneHandler(() => resumeListening());
    return () => registerSpeakingDoneHandler(null);
  }, [registerSpeakingDoneHandler, resumeListening]);

  useEffect(() => {
    if (speakingStatus === 'speaking' && phaseRef.current === 'thinking') setPhaseBoth('speaking');
  }, [speakingStatus, setPhaseBoth]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const p = phaseRef.current;
      if (!activeRef.current || (p !== 'waiting' && p !== 'listening')) return;
      const left = HANDS_FREE_IDLE_SECONDS - Math.floor((Date.now() - lastSpeechRef.current) / 1000);
      setIdleLeft(Math.max(0, left));
      if (left <= 0) stopHandsFree(`Hands-free beendet: ${HANDS_FREE_IDLE_SECONDS} Sekunden keine Sprache erkannt.`);
    }, 1000);
    return () => clearInterval(id);
  }, [stopHandsFree]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && activeRef.current) stopHandsFree('Hands-free pausiert, weil die App in den Hintergrund ging.');
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stopHandsFree]);

  useEffect(() => () => {
    activeRef.current = false;
    clearTimeout(restartRef.current);
    generationRef.current += 1;
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    recRef.current = null;
    releaseVoiceSession();
  }, [releaseVoiceSession]);

  if (!prefs.handsFree) {
    return (
      <div className="bb-card text-center">
        <MicOff size={40} aria-hidden="true" className="mx-auto mb-3 text-slate-400" />
        <p className="text-slate-200">Hands-free Buddy ist ausgeschaltet.</p>
        <Link to="/Privatsphaere" className="bb-action mt-4 inline-flex">Unter Privatsphäre einschalten</Link>
      </div>
    );
  }

  if (loadingTrip) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-cyan-300" aria-label="Lädt" /></div>;
  }

  if (!plan) {
    return (
      <div className="bb-card text-center">
        <Compass size={40} aria-hidden="true" className="mx-auto mb-3 text-cyan-300" />
        <h2 className="text-lg font-semibold text-slate-100">Kein aktiver Trip</h2>
        <p className="text-sm text-slate-400 mt-1">Hands-free läuft nur während eines Trips. Starte zuerst einen geplanten Ausflug.</p>
        <Link to="/TripPlanner" className="bb-action mt-4 inline-flex"><Compass size={18} aria-hidden="true" /> Zur Planung</Link>
      </div>
    );
  }

  const spot = readPlanSpot(plan.spot_info);
  const fishImage = fishImageFor(plan.target_fish);
  const active = phase !== 'off';
  const stepIndex = STEP_INDEX[phase] ?? -2;

  return (
    <div className="bb-hf">
      <section className="bb-card bb-hf-trip">
        <span className="bb-hf-trip-fish" aria-hidden="true">
          {fishImage ? <img src={fishImage} alt="" /> : <Fish size={30} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="bb-hf-trip-title">{plan.title || plan.target_fish || 'Aktueller Trip'}</h2>
          {spot.name && <p className="bb-hf-trip-line"><MapPin size={15} aria-hidden="true" />{spot.name}</p>}
          <p className="bb-hf-trip-line"><CalendarDays size={15} aria-hidden="true" />{new Date(now).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
          <p className="bb-hf-trip-line"><Clock size={15} aria-hidden="true" />{formatSince(startMs, now)}</p>
        </div>
        <span className="bb-hf-trip-badge"><i aria-hidden="true" />Trip aktiv</span>
      </section>

      <div className="bb-hf-stage">
        <button
          type="button"
          className={`bb-hf-orb is-${phase}`}
          onClick={active ? togglePause : startHandsFree}
          disabled={!Recognition}
          aria-label={active ? (phase === 'paused' ? 'Mikrofon fortsetzen' : 'Mikrofon pausieren') : 'Hands-free starten'}
        >
          {phase === 'paused' || !active ? <MicOff size={64} aria-hidden="true" /> : <Mic size={64} aria-hidden="true" />}
        </button>
        <p className="bb-hf-wake">{wakeWordOn ? `„${wakePhrase}“` : 'Sprich einfach los'}</p>
        <p className={`bb-hf-status is-${phase}`} role="status" aria-live="polite">
          {!Recognition ? 'Spracherkennung wird hier nicht unterstützt'
            : phase === 'off' ? 'Tippe, um Hands-free zu starten'
              : phase === 'paused' ? 'Mikrofon pausiert'
                : phase === 'waiting' ? 'Aktivierungswort aktiv'
                  : phase === 'listening' ? 'Ich höre zu …'
                    : phase === 'thinking' ? 'Ich denke nach …'
                      : 'Ich antworte …'}
        </p>
        {heard && (phase === 'listening' || phase === 'thinking') && <p className="bb-hf-heard">„{heard}“</p>}
        <p className="bb-hf-mic-note">
          <ShieldCheck size={15} aria-hidden="true" />
          Erkennung über die Spracherkennung deines Geräts. Nichts wird aufgezeichnet.
        </p>
      </div>

      <ol className="bb-hf-steps" aria-label="Ablauf">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const state = !wakeWordOn && index === 0 ? 'skip' : index < stepIndex ? 'done' : index === stepIndex ? 'active' : 'idle';
          return (
            <li key={step.id} className={`is-${state}`}>
              <span className="bb-hf-step-ring"><Icon size={22} aria-hidden="true" /></span>
              <strong>{step.title}</strong>
              <small>{step.id === 'wake' && wakeWordOn ? `„${wakePhrase}“` : step.text}</small>
            </li>
          );
        })}
      </ol>

      {lastAnswerText && <p className="bb-card bb-hf-answer">{lastAnswerText}</p>}
      {notice && <p className="bb-card bb-card-warn bb-hf-answer">{notice}</p>}

      <section className="bb-card bb-hf-examples">
        <h2 className="bb-hf-examples-title"><Lightbulb size={20} aria-hidden="true" />Du kannst z. B. sagen:</h2>
        <ul>{HANDS_FREE_EXAMPLES.map(example => <li key={example}>„{example}“</li>)}</ul>
      </section>

      {active && phase !== 'paused' && (phase === 'waiting' || phase === 'listening') && (
        <div className="bb-card bb-card-warn bb-hf-idle">
          <Clock size={24} aria-hidden="true" />
          <p>Falls {HANDS_FREE_IDLE_SECONDS} Sekunden keine Sprache erkannt wird, beendet sich der Hands-free-Modus automatisch.</p>
          <strong aria-live="off">00:{String(idleLeft).padStart(2, '0')}</strong>
        </div>
      )}

      <div className="bb-hf-controls">
        <button type="button" className="bb-hf-ctrl" onClick={togglePause} disabled={!active}>
          {phase === 'paused' ? <Play size={20} aria-hidden="true" /> : <Pause size={20} aria-hidden="true" />}
          {phase === 'paused' ? 'Mikro fortsetzen' : 'Mikro pausieren'}
        </button>
        {active ? (
          <button type="button" className="bb-hf-ctrl is-cyan" onClick={() => stopHandsFree()}>
            <Power size={20} aria-hidden="true" />Hands-free beenden
          </button>
        ) : (
          <button type="button" className="bb-hf-ctrl is-cyan" onClick={startHandsFree} disabled={!Recognition}>
            <Mic size={20} aria-hidden="true" />Hands-free starten
          </button>
        )}
        <button type="button" className="bb-hf-ctrl is-red" onClick={() => { stopHandsFree(); navigate('/AnglerMode?end=1'); }}>
          <Square size={18} aria-hidden="true" />Trip beenden
        </button>
      </div>
    </div>
  );
}
