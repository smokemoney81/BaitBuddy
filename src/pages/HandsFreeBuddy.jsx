import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, Check, AudioLines, MessageSquare, MapPin, CalendarDays, Clock, Fish,
  Lightbulb, Pause, Play, Power, Square, Settings2, ShieldCheck, Loader2, Compass,
} from 'lucide-react';
import PremiumGuard from '@/components/premium/PremiumGuard';
import { ai } from '@/api/frontendClient';
import { FishingPlan } from '@/entities/FishingPlan';
import { useLocation as useGeoLocation } from '@/components/location/LocationManager';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { createSpeechQueue, cancelElevenLabs } from '@/components/utils/elevenLabsTTS';
import { stripActionMarker } from '@/lib/streamingReply';
import { executeBuddyAction } from '@/utils/buddyActions';
import { selectNextTrip, readPlanSpot } from '@/lib/tripJourney';
import { readTripStart, writeTripStart } from '@/lib/anglerMode';
import { readPrivacyPrefs } from '@/lib/privacyPrefs';
import { detectWakeWord, HANDS_FREE_EXAMPLES, HANDS_FREE_IDLE_SECONDS } from '@/lib/wakeWord';
import { fishImageFor } from '@/lib/fishImages';
import { useLocalBuddy } from '@/hooks/useLocalBuddy';

const HISTORY_TURNS = 10;
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

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

export default function HandsFreeBuddy() {
  return (
    // Nutzt denselben Chat-Endpunkt wie der KI-Buddy (Gratis: 5 Nachrichten/Tag).
    <PremiumGuard requiredPlan="free" feature="Hands-free Buddy">
      <HandsFreeInner />
    </PremiumGuard>
  );
}

const STEPS = [
  { id: 'wake', icon: Check, title: 'Erkannt', text: '„Hey Buddy“' },
  { id: 'listening', icon: Mic, title: 'Mikro offen', text: 'Ich höre zu …' },
  { id: 'thinking', icon: AudioLines, title: 'Ende erkannt', text: 'Ich denke nach' },
  { id: 'speaking', icon: MessageSquare, title: 'Antwort', text: 'Ich antworte dir' },
];
const STEP_INDEX = { waiting: -1, listening: 1, thinking: 2, speaking: 3 };

function HandsFreeInner() {
  const navigate = useNavigate();
  const { buddy } = useBuddyPreferences();
  const localBuddy = useLocalBuddy();
  const { currentLocation } = useGeoLocation();
  const [prefs] = useState(() => readPrivacyPrefs());
  const wakeWordOn = prefs.wakeWord;
  const Recognition = getRecognition();

  const [plan, setPlan] = useState(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [startMs, setStartMs] = useState(null);
  const [now, setNow] = useState(Date.now());

  // off | waiting | listening | thinking | speaking | paused
  const [phase, setPhase] = useState('off');
  const [heard, setHeard] = useState('');
  const [log, setLog] = useState([]);
  const [notice, setNotice] = useState('');
  const [idleLeft, setIdleLeft] = useState(HANDS_FREE_IDLE_SECONDS);

  const phaseRef = useRef('off');
  const activeRef = useRef(false);
  const recRef = useRef(null);
  const restartRef = useRef(null);
  const abortRef = useRef(null);
  const queueRef = useRef(null);
  const historyRef = useRef([]);
  const lastSpeechRef = useRef(Date.now());
  const locationRef = useRef(null);
  locationRef.current = currentLocation;
  // Die Erkennung lebt länger als ein Render; sie ruft den Satz-Handler über
  // diese Ref auf und sieht so immer die aktuelle Version.
  const utteranceRef = useRef(() => {});

  const setPhaseBoth = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
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
    const rec = recRef.current;
    recRef.current = null;
    try { rec?.abort ? rec.abort() : rec?.stop(); } catch { /* bereits beendet */ }
  }, []);

  const stopHandsFree = useCallback((message = '') => {
    activeRef.current = false;
    stopRecognition();
    abortRef.current?.abort();
    queueRef.current?.cancel();
    queueRef.current = null;
    cancelElevenLabs();
    setPhaseBoth('off');
    setHeard('');
    setIdleLeft(HANDS_FREE_IDLE_SECONDS);
    if (message) setNotice(message);
  }, [setPhaseBoth, stopRecognition]);

  const listenPhase = wakeWordOn ? 'waiting' : 'listening';

  // Hört je nach Phase auf das Aktivierungswort oder direkt auf die Frage.
  const startRecognition = useCallback(() => {
    if (!Recognition || recRef.current || !activeRef.current) return;
    const rec = new Recognition();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
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
      if (!text) return;
      utteranceRef.current(text);
    };
    rec.onerror = (event) => {
      if (FATAL_ERRORS.has(event?.error)) {
        stopHandsFree('Kein Zugriff auf das Mikrofon. Erlaube es unter Privatsphäre & Berechtigungen.');
      }
    };
    rec.onend = () => {
      if (recRef.current === rec) recRef.current = null;
      // Die Erkennung beendet sich nach Pausen von selbst — weiterhören,
      // solange der Modus läuft und gerade nicht gesprochen wird.
      const p = phaseRef.current;
      if (activeRef.current && (p === 'waiting' || p === 'listening')) {
        clearTimeout(restartRef.current);
        restartRef.current = setTimeout(() => startRecognition(), 250);
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

  const ask = useCallback(async (question) => {
    stopRecognition();
    setPhaseBoth('thinking');
    setHeard(question);
    setLog(prev => [...prev.slice(-5), { role: 'user', text: question }]);
    historyRef.current = [...historyRef.current, { role: 'user', content: question }].slice(-HISTORY_TURNS);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const loc = locationRef.current;
    const userLocation = loc?.lat != null ? { latitude: loc.lat, longitude: loc.lon } : null;

    const speak = buddy.voiceEnabled !== false;
    let queue = speak ? createSpeechQueue({ rate: 1.0, onDrain: () => resumeListening() }) : null;
    queueRef.current = queue;
    let raw = '';
    let spokenLen = 0;
    let result = null;

    // KI auf dem Gerät: streamt Text-Stücke direkt in die Sprech-Queue.
    const runOnDevice = async () => {
      raw = '';
      spokenLen = 0;
      const res = await localBuddy.askLocal({
        history: historyRef.current.slice(0, -1),
        question,
        signal: controller.signal,
        context: { navigate, userLocation },
        onDelta: (delta) => {
          if (!activeRef.current) return;
          raw += delta;
          if (queue) {
            if (phaseRef.current !== 'speaking') setPhaseBoth('speaking');
            queue.push(delta);
            spokenLen = raw.length;
          }
        },
      });
      return { reply: res.reply, action: res.action, notices: res.notices, onDevice: true };
    };

    try {
      const engine = localBuddy.engineFor();
      if (engine === 'none') {
        throw Object.assign(new Error('Die KI auf dem Gerät ist noch nicht eingerichtet.'), { code: 'local_unavailable' });
      }
      if (engine === 'local') {
        result = await runOnDevice();
      } else {
        try {
          result = await ai.chatStream(historyRef.current, userLocation, {
            signal: controller.signal,
            onDelta: (delta) => {
              if (!activeRef.current) return;
              raw += delta;
              const visible = stripActionMarker(raw);
              if (queue && visible.length > spokenLen) {
                if (phaseRef.current !== 'speaking') setPhaseBoth('speaking');
                queue.push(visible.slice(spokenLen));
                spokenLen = visible.length;
              }
            },
          });
        } catch {
          if (controller.signal.aborted) return;
          spokenLen = 0;
          try {
            result = await ai.chat(historyRef.current, userLocation);
          } catch (cloudError) {
            // Automatik-Modus: ohne Cloud antwortet das Gerät.
            if (!localBuddy.canFallBack || controller.signal.aborted) throw cloudError;
            queue?.cancel();
            const deviceQueue = speak ? createSpeechQueue({ rate: 1.0, onDrain: () => resumeListening() }) : null;
            queueRef.current = deviceQueue;
            queue = deviceQueue;
            result = await runOnDevice();
          }
        }
      }
      if (!activeRef.current) return;

      let answer = stripActionMarker(result?.reply || result?.message || raw || '').trim() || 'Dazu habe ich gerade keine Antwort.';
      const action = result?.action;
      if (action?.type === 'navigate') {
        // Seitenwechsel würde Hands-free beenden — nur anbieten.
        answer += ' Die Seite öffne ich, sobald du Hands-free beendest.';
      } else if (action) {
        const outcome = await executeBuddyAction(action, { navigate, userLocation });
        if (outcome?.message) answer += ` ${outcome.message}`;
      }
      for (const notice of result?.notices || []) answer += ` ${notice}`;
      historyRef.current = [...historyRef.current, { role: 'assistant', content: answer }].slice(-HISTORY_TURNS);
      setLog(prev => [...prev.slice(-5), { role: 'assistant', text: answer }]);

      if (queue) {
        setPhaseBoth('speaking');
        // Gerät: Gestreamtes ist schon in der Queue, nur Zusätze fehlen noch.
        if (result?.onDevice && spokenLen > 0) {
          const extra = answer.slice((result.reply || '').length).trim();
          if (extra) queue.push(` ${extra}`);
        } else if (answer.length > spokenLen) {
          queue.push(answer.slice(spokenLen));
        }
        queue.flush();
      } else {
        resumeListening();
      }
    } catch (error) {
      if (controller.signal.aborted || !activeRef.current) return;
      queue?.cancel();
      const message = error?.code === 'local_unavailable'
        ? 'Die KI auf dem Gerät ist noch nicht eingerichtet. Lade ein Modell unter Einstellungen > KI-Buddy herunter.'
        : error?.status === 429
          ? 'Dein Tageslimit für den KI-Buddy ist erreicht.'
          : 'Keine Verbindung zum Buddy. Ich höre weiter zu.';
      setLog(prev => [...prev.slice(-5), { role: 'system', text: message }]);
      if (error?.status === 429) stopHandsFree(message);
      else resumeListening();
    }
  }, [buddy.voiceEnabled, localBuddy, navigate, resumeListening, setPhaseBoth, stopHandsFree, stopRecognition]);

  // Erkannter Satz → Aktivierungswort prüfen oder direkt als Frage stellen.
  utteranceRef.current = (text) => {
    if (phaseRef.current === 'waiting') {
      const { detected, command } = detectWakeWord(text);
      if (!detected) return;
      if (command) { ask(command); return; }
      setHeard('');
      setPhaseBoth('listening');
      return;
    }
    if (phaseRef.current === 'listening') ask(text);
  };
  const startHandsFree = () => {
    if (!Recognition) return;
    setNotice('');
    setLog([]);
    historyRef.current = [];
    activeRef.current = true;
    lastSpeechRef.current = Date.now();
    setPhaseBoth(listenPhase);
    startRecognition();
  };

  const togglePause = () => {
    if (phaseRef.current === 'paused') {
      resumeListening();
      return;
    }
    stopRecognition();
    abortRef.current?.abort();
    queueRef.current?.cancel();
    cancelElevenLabs();
    setPhaseBoth('paused');
  };

  // 60 Sekunden ohne Sprache → Modus beendet sich (Akku, Privatsphäre).
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

  // App im Hintergrund → Mikrofon freigeben.
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
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    recRef.current = null;
    abortRef.current?.abort();
    queueRef.current?.cancel();
    cancelElevenLabs();
  }, []);

  if (!prefs.handsFree) {
    return (
      <div className="bb-page">
        <HandsFreeTitle />
        <div className="bb-card text-center">
          <MicOff size={40} aria-hidden="true" className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-200">Hands-free Buddy ist ausgeschaltet.</p>
          <Link to="/Privatsphaere" className="bb-action mt-4 inline-flex">Unter Privatsphäre einschalten</Link>
        </div>
      </div>
    );
  }

  if (loadingTrip) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-cyan-300" aria-label="Lädt" /></div>;
  }

  if (!plan) {
    return (
      <div className="bb-page">
        <HandsFreeTitle />
        <div className="bb-card text-center">
          <Compass size={40} aria-hidden="true" className="mx-auto mb-3 text-cyan-300" />
          <h2 className="text-lg font-semibold text-slate-100">Kein aktiver Trip</h2>
          <p className="text-sm text-slate-400 mt-1">Der Hands-free Buddy läuft nur während eines Trips. Starte zuerst einen geplanten Ausflug.</p>
          <Link to="/TripPlanner" className="bb-action mt-4 inline-flex"><Compass size={18} aria-hidden="true" /> Zur Planung</Link>
        </div>
      </div>
    );
  }

  const spot = readPlanSpot(plan.spot_info);
  const fishImage = fishImageFor(plan.target_fish);
  const active = phase !== 'off';
  const stepIndex = STEP_INDEX[phase] ?? -2;
  const lastAnswer = [...log].reverse().find(entry => entry.role !== 'user');

  return (
    <div className="bb-page bb-hf">
      <HandsFreeTitle />

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
        <p className="bb-hf-wake">{wakeWordOn ? '„Hey Buddy“' : 'Sprich einfach los'}</p>
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
              <small>{step.text}</small>
            </li>
          );
        })}
      </ol>

      {lastAnswer && (
        <p className={`bb-card bb-hf-answer${lastAnswer.role === 'system' ? ' is-system' : ''}`}>{lastAnswer.text}</p>
      )}
      {notice && <p className="bb-card bb-card-warn bb-hf-answer">{notice}</p>}

      <section className="bb-card bb-hf-examples">
        <h2 className="bb-hf-examples-title"><Lightbulb size={20} aria-hidden="true" />Du kannst z. B. sagen:</h2>
        <ul>
          {HANDS_FREE_EXAMPLES.map(example => <li key={example}>„{example}“</li>)}
        </ul>
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

function HandsFreeTitle() {
  return (
    <header className="bb-hf-head">
      <div className="min-w-0">
        <h1 className="bb-hf-title">Hands-free <span className="bb-title-accent">Buddy</span></h1>
        <p className="bb-hf-sub">Dein Sprachassistent – nur für diesen Trip aktiv.</p>
      </div>
      <Link to="/Privatsphaere" className="bb-round-btn" aria-label="Datenschutz-Einstellungen">
        <Settings2 size={22} aria-hidden="true" />
      </Link>
    </header>
  );
}
