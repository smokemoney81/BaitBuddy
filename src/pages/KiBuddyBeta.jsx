import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Settings2, AudioLines, Mic, BrainCircuit, Volume2, VolumeX, User as UserIcon, MapPin, Fish, PlusCircle, ChevronRight, Send, Square } from 'lucide-react';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { useState, useRef, useEffect } from "react";
import { catchgbtChat } from "@/functions/catchgbtChat";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import { useEventActivityTracking } from "@/hooks/useEventActivityTracking";
import { events, ai } from "@/api/frontendClient";
import { createSpeechQueue } from "@/components/utils/elevenLabsTTS";
import { stripActionMarker } from "@/lib/streamingReply";
import { resolveLocalAnswer, getOfflineFallback, faqPageLabel } from "@/lib/buddyFaq";
import { buildGreeting } from "@/lib/buddyGreetings";
import { executeBuddyAction } from "@/utils/buddyActions";

import PremiumGuard from "@/components/premium/PremiumGuard";
import BuddyAvatar from "@/components/ai/BuddyAvatar";

export default function KiBuddyBeta() {
  return (
    // Gratis-Tarif darf chatten (serverseitig auf 5 Nachrichten/Tag begrenzt,
    // siehe checkChatRateLimit) — wie in der Tool-Registry (ki-buddy: free).
    <PremiumGuard requiredPlan="free" feature="KI-Buddy Chat">
      <KiBuddyBetaInner />
    </PremiumGuard>
  );
}

function KiBuddyBetaInner() {
  const { buddy, activeBuddy } = useBuddyPreferences();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useFeatureTracking("ai_buddy");
  const { trackAIChat } = useEventActivityTracking();
  // Begrüßung variiert bei jedem Öffnen (Tageszeit, Stimmung, gelegentlich ein
  // Funktions-Tipp) statt eines immer gleichen statischen Textes.
  const [messages, setMessages] = useState(() => [{ role: "system", text: buildGreeting({}) }]);
  const [input, setInput] = useState(() => searchParams.get("question") || "");
  const [status, setStatus] = useState("");
  const [tonAn, setTonAn] = useState(buddy.voiceEnabled);
  useEffect(() => setTonAn(buddy.voiceEnabled), [buddy.voiceEnabled]);
  const [recording, setRecording] = useState(false);
  const [waveBars, setWaveBars] = useState([4, 4, 4, 4, 4]);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [activeEventId, setActiveEventId] = useState(null);
  const [conversationActive, setConversationActive] = useState(false);
  const chatRef = useRef();
  const recRef = useRef(null);
  const waveRef = useRef(null);
  const timeoutRef = useRef(null);
  const retryRef = useRef(0);
  // Bricht einen laufenden /api/ai/chat-Request beim Unmount ab, damit nach dem
  // Verlassen der Seite keine Antwort mehr verarbeitet wird (zweite Verteidigungs-
  // linie neben isMountedRef). Wird pro ask()-Aufruf neu gesetzt.
  const abortRef = useRef(null);
  // Läuft ein fortlaufendes Gespräch? Als Ref, damit die TTS-Callbacks (die in
  // einer alten Closure hängen) immer den aktuellen Wert sehen.
  const conversationActiveRef = useRef(false);
  // Spiegelt `messages` synchron, damit `ask()` beim Aufbau der Chat-Historie
  // die soeben hinzugefügten Turns bereits sieht — der State-Update ist zum
  // Zeitpunkt des Aufrufs noch nicht geflusht (Stale-Closure). Zugleich Guard
  // gegen State-Updates/TTS nach Unmount.
  const messagesRef = useRef(messages);
  const isMountedRef = useRef(true);
  // useElevenLabsVoice nur noch fürs Stoppen (cancelElevenLabs) — die eigentliche
  // Wiedergabe läuft jetzt über die satzweise Sprech-Queue (createSpeechQueue),
  // die denselben Audio-Singleton nutzt. „Spricht gerade" wird über den
  // status-State ("speaking") abgebildet.
  const { stop: stopVoice } = useElevenLabsVoice();
  const isSpeaking = status === "speaking";
  // Aktive Streaming-Queue des laufenden Turns (für Abbruch bei neuem Turn/Unmount).
  const speechQueueRef = useRef(null);

  // Einzige Schreibstelle für Nachrichten: hält Ref und State synchron und
  // unterbindet Updates nach dem Unmount.
  function appendMessages(...items) {
    if (!isMountedRef.current || items.length === 0) return;
    messagesRef.current = [...messagesRef.current, ...items];
    setMessages(messagesRef.current);
  }

  // Live-Streaming der Assistant-Antwort: aktualisiert die letzte Bubble
  // in-place (streaming) bzw. legt sie beim ersten Delta an.
  function upsertAssistantStreaming(text) {
    if (!isMountedRef.current) return;
    const arr = messagesRef.current;
    const last = arr[arr.length - 1];
    const next = last && last.role === "assistant" && last.streaming
      ? [...arr.slice(0, -1), { role: "assistant", text, streaming: true }]
      : [...arr, { role: "assistant", text, streaming: true }];
    messagesRef.current = next;
    setMessages(next);
  }

  // Ersetzt die streamende Bubble durch die finale Antwort (bzw. legt sie an,
  // falls kein Streaming lief — Fallback-Pfad).
  function finalizeAssistant(text) {
    if (!isMountedRef.current) return;
    const arr = messagesRef.current;
    const last = arr[arr.length - 1];
    const next = last && last.role === "assistant" && last.streaming
      ? [...arr.slice(0, -1), { role: "assistant", text }]
      : [...arr, { role: "assistant", text }];
    messagesRef.current = next;
    setMessages(next);
  }

  useEffect(() => {
    const loadActiveEvent = async () => {
      try {
        const event = await events.getActiveEvent();
        if (event?.active_event?.id) {
          setActiveEventId(event.active_event.id);
        }
      } catch {
        // Event loading non-critical
      }
    };
    loadActiveEvent();
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  function startWave() {
    // Vorheriges Intervall zuerst löschen, damit sich bei schneller Abfolge
    // (z. B. mehrere TTS-Antworten hintereinander) keine verwaisten Intervalle
    // stapeln, die die waveRef überschreiben und nicht mehr gestoppt werden.
    clearInterval(waveRef.current);
    waveRef.current = setInterval(() => {
      setWaveBars([...Array(5)].map(() => Math.random() * 18 + 4));
    }, 120);
  }

  function stopWave() {
    clearInterval(waveRef.current);
    waveRef.current = null;
    setWaveBars([4, 4, 4, 4, 4]);
  }

  // Spricht einen fertigen Text (Fallback-/Offline-Antworten) satzweise über
  // die Sprech-Queue — spürbar schneller, weil der erste Satz sofort startet.
  // Bei Ton aus wird direkt weiter zugehört.
  function speakAnswer(text) {
    if (!isMountedRef.current) return;
    if (!tonAn || !text) {
      setStatus("");
      stopWave();
      maybeContinueConversation();
      return;
    }
    setStatus("speaking");
    startWave();
    const queue = createSpeechQueue({
      rate: 1.0,
      onDrain: () => {
        if (!isMountedRef.current) return;
        setStatus("");
        stopWave();
        maybeContinueConversation();
      },
    });
    speechQueueRef.current = queue;
    queue.push(text);
    queue.flush();
  }

  function stopSpeaking() {
    speechQueueRef.current?.cancel();
    speechQueueRef.current = null;
    stopVoice();
    stopWave();
    setStatus("");
  }

  // Nach jeder Antwort im laufenden Gespräch das Mikrofon automatisch wieder
  // öffnen — so entsteht ein flüssiges Hin und Her, ohne erneut zu tippen.
  function maybeContinueConversation() {
    if (isMountedRef.current && conversationActiveRef.current && !recRef.current) {
      startListening();
    }
  }

  function startConversation() {
    setConversationActive(true);
    conversationActiveRef.current = true;
    appendMessages({ role: "system", text: "Gespräch gestartet. Stell mir deine Frage." });
    startListening();
  }

  function endConversation() {
    setConversationActive(false);
    conversationActiveRef.current = false;
    stopMic();
    stopSpeaking();
    appendMessages({ role: "system", text: "Gespräch beendet." });
  }

  // Antwort aus der lokalen FAQ-Datenbank (ohne API). `local` = null heißt:
  // offline und nichts Passendes gefunden → ehrliche Fallback-Nachricht.
  function answerLocally(local) {
    retryRef.current = 0;
    if (!local) {
      setStatus("");
      appendMessages(
        {
          role: "system",
          text: typeof navigator !== "undefined" && navigator.onLine === false
            ? "Offline-Modus: Keine Internetverbindung."
            : "KI-Dienst gerade nicht erreichbar.",
        },
        { role: "assistant", text: getOfflineFallback(), source: "offline" }
      );
      maybeContinueConversation();
      return;
    }
    appendMessages({ role: "assistant", text: local.answer, source: local.mode, page: local.page });
    if (activeEventId && local.mode === "instant" && local.entry.category !== "smalltalk") {
      trackAIChat(activeEventId);
    }
    speakAnswer(local.answer);
  }

  async function ask(q, isRetry = false) {
    if (!isRetry) {
      // Häufige Standardfragen beantwortet die lokale FAQ-Datenbank sofort —
      // ohne API-Aufruf und Wartezeit. Ohne Netz geht es direkt in den
      // Offline-Pfad, statt erst Timeouts und Retries abzuwarten.
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      const inConversation = messagesRef.current.some(m => m.role === "assistant");
      const local = resolveLocalAnswer(q, { online, inConversation });
      if (local || !online) {
        // Ein noch laufender Request/eine Sprachausgabe des vorherigen Turns
        // darf die lokale Antwort nicht überholen.
        abortRef.current?.abort();
        speechQueueRef.current?.cancel();
        speechQueueRef.current = null;
        answerLocally(local);
        return;
      }
    }
    setStatus("thinking");
    // Vorherigen laufenden Request abbrechen und für diesen Turn einen frischen
    // Controller anlegen; das Unmount-Cleanup abortet über diese Ref.
    if (!isRetry) {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
    }
    // Vorherige Sprech-Queue beenden (neuer Turn übernimmt die Wiedergabe).
    speechQueueRef.current?.cancel();
    speechQueueRef.current = null;

    const signal = abortRef.current?.signal;
    // Satz-Queue fürs Live-Streaming: spricht den ersten Satz, sobald er da ist.
    const queue = tonAn ? createSpeechQueue({
      rate: 1.0,
      onDrain: () => {
        if (!isMountedRef.current) return;
        setStatus("");
        stopWave();
        maybeContinueConversation();
      },
    }) : null;
    if (queue) speechQueueRef.current = queue;

    try {
      // Historie aus der Ref bauen — der auslösende User-Turn wurde bereits über
      // appendMessages angehängt und ist hier enthalten (kein erneutes Pushen).
      const chatMessages = messagesRef.current
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));

      let raw = "";
      let spokenLen = 0;
      let uiSpeaking = false;
      let streamedOk = false;
      let result;

      try {
        result = await ai.chatStream(chatMessages, null, {
          signal,
          onDelta: (delta) => {
            if (!isMountedRef.current) return;
            raw += delta;
            const visible = stripActionMarker(raw);
            upsertAssistantStreaming(visible);
            if (queue && visible.length > spokenLen) {
              if (!uiSpeaking) { uiSpeaking = true; setStatus("speaking"); startWave(); }
              queue.push(visible.slice(spokenLen));
              spokenLen = visible.length;
            }
          },
        });
        streamedOk = true;
      } catch (streamErr) {
        if (streamErr?.name === "AbortError" || signal?.aborted) { queue?.cancel(); return; }
        // Streaming nicht verfügbar (SSE ungeeignet, Server-Fehler) → gepufferter
        // Standard-Pfad. Ein echter Netzwerkfehler wirft hier erneut und landet
        // im äußeren catch (Offline-/Retry-Logik).
        queue?.cancel();
        const res = await catchgbtChat({
          messages: chatMessages,
          context: "ki_buddy_beta",
        }, { signal });
        result = { reply: res?.reply || res?.message, action: res?.action || null };
      }

      if (!isMountedRef.current) { queue?.cancel(); return; }

      const ans = result?.reply || result?.message || stripActionMarker(raw) || "Keine Antwort erhalten.";
      retryRef.current = 0;
      finalizeAssistant(ans);
      // Aktionen aus der Antwort ausführen ("Karpfen ins Fangbuch", "Spot
      // speichern", Seitenwechsel) — sonst bliebe das Angebot des Buddys leer.
      if (result?.action) {
        executeBuddyAction(result.action, { navigate })
          .then(outcome => { if (outcome?.message) appendMessages({ role: "system", text: outcome.message }); })
          .catch(() => appendMessages({ role: "system", text: "Die Aktion konnte nicht ausgeführt werden." }));
      }
      if (activeEventId) {
        trackAIChat(activeEventId);
      }

      if (streamedOk && queue && spokenLen > 0) {
        // Gestreamte Sätze sind bereits in der Queue → nur den Rest abschließen.
        queue.flush();
      } else {
        // Ton aus, Fallback-Pfad oder nichts gestreamt → jetzt sprechen.
        speakAnswer(ans);
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      // Abgebrochener Request (neuer Turn oder Unmount): keine Fehler-/Offline-
      // Behandlung, der neue Aufruf übernimmt bzw. die Seite ist verlassen.
      if (error?.name === "AbortError") return;

      queue?.cancel();
      // Eine evtl. angefangene Streaming-Bubble verwerfen (bevor Offline-/
      // Fallback-Nachrichten angehängt werden).
      const arr = messagesRef.current;
      if (arr[arr.length - 1]?.streaming) {
        const trimmed = arr.slice(0, -1);
        messagesRef.current = trimmed;
        setMessages(trimmed);
      }

      // Bei Verbindungsfehlern: passende Antwort aus der lokalen FAQ-Datenbank
      const offlineAnswer = resolveLocalAnswer(q, { online: false });

      if (offlineAnswer) {
        answerLocally(offlineAnswer);
        return;
      }

      // Auto-Retry (bis zu 2x) bei Verbindungsfehlern
      if (retryRef.current < 2) {
        retryRef.current += 1;
        setStatus("thinking");
        await new Promise(r => setTimeout(r, 800));
        if (!isMountedRef.current) return;
        return ask(q, true);
      }

      // Keine passende lokale Antwort und Retries erschöpft: Fallback-Nachricht
      answerLocally(null);
    }
  }

  function sendText() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    appendMessages({ role: "user", text: q });
    ask(q);
  }

  const ERROR_LABELS = {
    "no-speech": "Keine Sprache erkannt – bitte erneut versuchen.",
    "audio-capture": "Mikrofon nicht verfügbar. Prüfe die Berechtigung.",
    "not-allowed": "Mikrofon-Zugriff verweigert. Bitte erlauben.",
    network: "Netzwerkfehler bei der Spracherkennung.",
    "service-not-allowed": "Spracherkennungs-Dienst nicht verfügbar.",
  };

  function toggleMic() {
    if (recording) { stopMic(); return; }
    startListening();
  }

  function startListening() {
    if (recRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      appendMessages({ role: "system", text: "Spracherkennung nicht unterstuetzt." });
      return;
    }
    const rec = new SR();
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = e => {
      let interim = "";
      let finalText = "";
      let finalConfidence = null;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
          finalConfidence = result[0].confidence;
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setInterimTranscript(interim);
      if (finalText.trim()) {
        const q = finalText.trim();
        if (typeof finalConfidence === "number" && finalConfidence > 0) {
          setConfidence(Math.round(finalConfidence * 100));
        }
        stopMic();
        appendMessages({ role: "user", text: q });
        ask(q);
      }
    };

    rec.onerror = ev => {
      const label = ERROR_LABELS[ev?.error];
      if (label) appendMessages({ role: "system", text: label });
      stopMic();
    };
    rec.onend = () => { if (recRef.current) stopMic(); };

    rec.start();
    recRef.current = rec;
    setRecording(true);
    setStatus("listening");
    setInterimTranscript("");
    setConfidence(null);

    // Timeout: 8s ohne erkannte Sprache
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (recRef.current) {
        stopMic();
        // Im laufenden Gespräch weiter zuhören statt abzubrechen.
        if (conversationActiveRef.current) {
          startListening();
        } else {
          appendMessages({ role: "system", text: "Keine Sprache erkannt (Timeout). Bitte erneut versuchen." });
        }
      }
    }, 8000);
  }

  function stopMic() {
    clearTimeout(timeoutRef.current);
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    setRecording(false);
    setInterimTranscript("");
    if (status === "listening") setStatus("");
  }

  useEffect(() => {
    // Beim (Re-)Mount wieder als aktiv markieren — sonst bliebe die Ref nach dem
    // StrictMode-Doppelmount auf false stehen.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutRef.current);
      conversationActiveRef.current = false;
      clearInterval(waveRef.current);
      waveRef.current = null;
      try { abortRef.current?.abort(); } catch {}
      try { recRef.current?.stop(); } catch {}
      recRef.current = null;
      try { stopVoice(); } catch {}
    };
  }, [stopVoice]);

  const phase = status === "listening" ? "listening" : status === "thinking" ? "thinking" : isSpeaking ? "speaking" : "idle";
  const quickQuestions = ['Was ist die beste Tiefe jetzt?', 'Zeig mir gute Spots', 'Wetter heute?', 'Welche Köder passen?'];

  return (
    <div className="bb-page bb-voice">
      <header className="bb-voice-head">
        <div className="bb-voice-head-text">
          <h1 className="bb-voice-title"><AudioLines size={28} aria-hidden="true" />Voice <span className="bb-title-accent">Buddy</span></h1>
          <p className="bb-voice-eyebrow">Sprich mit deinem KI-Angelassistenten</p>
        </div>
        <Link className="bb-round-btn" to="/Settings?tab=buddy" aria-label="KI-Buddy einstellen"><Settings2 size={22} aria-hidden="true" /></Link>
      </header>

      <div className={`bb-voice-orb is-${phase}`}>
        <div className="bb-voice-waves" aria-hidden="true">
          {waveBars.map((h, i) => <i key={i} style={{ height: Math.max(6, h * 2) }} />)}
        </div>
        <img src={activeBuddy.portrait} alt={`${activeBuddy.name}, dein KI-Buddy`} />
        <p className="bb-script bb-voice-script" aria-hidden="true">„Mehr als nur Antworten.“</p>
      </div>

      <div className="bb-voice-states" role="status" aria-live="polite">
        <span className={phase === "listening" ? "is-active is-green" : ""}><Mic size={18} aria-hidden="true" />Ich höre …</span>
        <span className={phase === "thinking" ? "is-active" : ""}><BrainCircuit size={18} aria-hidden="true" />Verarbeite …</span>
        <span className={phase === "speaking" ? "is-active" : ""}><Volume2 size={18} aria-hidden="true" />Buddy spricht …</span>
      </div>
      {confidence !== null && <p className="bb-voice-confidence">Spracherkennung: {confidence}%</p>}

      <div ref={chatRef} className="bb-voice-chat">
        {messages.map((m, i) => (
          m.role === "system" ? (
            <p key={i} className="bb-voice-system">{m.text}</p>
          ) : m.role === "user" ? (
            <div key={i} className="bb-voice-row is-user">
              <span className="bb-voice-bubble is-user">{m.text}</span>
              <span className="bb-voice-avatar is-user"><UserIcon size={20} aria-hidden="true" /></span>
            </div>
          ) : (
            <div key={i} className="bb-voice-row">
              <span className="bb-voice-avatar"><BuddyAvatar speaking={false} listening={false} showHints={false} size={40} /></span>
              <span className="bb-voice-bubble">
                {m.text}
                {m.source && (
                  <span className="bb-voice-source">
                    <span>{m.source === "offline" ? "Offline-Antwort aus dem Buddy-Wissen" : "Sofort-Antwort aus dem Buddy-Wissen"}</span>
                    {m.page && <Link to={`/${m.page}`}>{faqPageLabel(m.page)} öffnen</Link>}
                  </span>
                )}
              </span>
            </div>
          )
        ))}
        {interimTranscript && (
          <div className="bb-voice-row is-user">
            <span className="bb-voice-bubble is-user is-interim">{interimTranscript}</span>
          </div>
        )}
        {status === "thinking" && (
          <div className="bb-voice-row">
            <span className="bb-voice-avatar"><BuddyAvatar speaking={false} listening={false} showHints={false} size={40} /></span>
            <span className="bb-voice-bubble bb-voice-typing" aria-label="Buddy denkt nach"><i /><i /><i /></span>
          </div>
        )}
      </div>

      <div className="bb-voice-actions">
        <Link to="/TripPlanner" className="bb-voice-action"><MapPin size={26} aria-hidden="true" /><span><strong>Trip öffnen</strong><small>Planen & starten</small></span><ChevronRight size={18} aria-hidden="true" /></Link>
        <Link to="/Koeder3D" className="bb-voice-action"><Fish size={26} aria-hidden="true" /><span><strong>Köder wechseln</strong><small>Führung & Setups</small></span><ChevronRight size={18} aria-hidden="true" /></Link>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('openCatchDialog'))} className="bb-voice-action"><PlusCircle size={26} aria-hidden="true" /><span><strong>Fang eintragen</strong><small>Schnell & einfach</small></span><ChevronRight size={18} aria-hidden="true" /></button>
      </div>

      <div className="bb-voice-quick">
        {quickQuestions.map(question => (
          <button type="button" key={question} onClick={() => setInput(question)}>{question}</button>
        ))}
      </div>

      <div className="bb-voice-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendText()}
          placeholder="Frage stellen..."
          aria-label="Frage an den Buddy"
        />
        <button type="button" onClick={toggleMic} disabled={conversationActive} className={`bb-voice-icon-btn${recording ? ' is-on' : ''}`} aria-label={recording ? 'Aufnahme beenden' : 'Einzelne Frage einsprechen'}>
          <Mic size={20} aria-hidden="true" />
        </button>
        <button type="button" onClick={sendText} disabled={!input.trim() || status === "thinking"} className="bb-voice-icon-btn is-send" aria-label="Senden">
          <Send size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="bb-voice-controls">
        <button type="button" onClick={() => { setTonAn(t => !t); if (tonAn) stopSpeaking(); }} className="bb-voice-ctrl" aria-pressed={tonAn}>
          <span className="bb-voice-ctrl-circle">{tonAn ? <Volume2 size={24} aria-hidden="true" /> : <VolumeX size={24} aria-hidden="true" />}</span>
          <small>Lautsprecher {tonAn ? 'an' : 'aus'}</small>
        </button>
        <button
          type="button"
          onClick={conversationActive ? endConversation : startConversation}
          className={`bb-voice-mic${conversationActive ? ' is-active' : ''}`}
          aria-label={conversationActive ? 'Freisprechen beenden' : 'Freisprechen starten'}
        >
          <Mic size={40} aria-hidden="true" />
        </button>
        <button type="button" onClick={stopSpeaking} className="bb-voice-ctrl is-stop">
          <span className="bb-voice-ctrl-circle"><Square size={22} aria-hidden="true" /></span>
          <small>Buddy stoppen</small>
        </button>
      </div>
      <p className={`bb-voice-mode${conversationActive ? ' is-active' : ''}`}>
        <i aria-hidden="true" />{conversationActive ? 'Freisprechen aktiv' : 'Tippe aufs Mikrofon für Freisprechen'}
      </p>
    </div>
  );
}