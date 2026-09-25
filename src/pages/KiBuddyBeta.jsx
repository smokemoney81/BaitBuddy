import { Link, useSearchParams } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
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

import PremiumGuard from "@/components/premium/PremiumGuard";
import BuddyAvatar from "@/components/ai/BuddyAvatar";

export default function KiBuddyBeta() {
  return (
    <PremiumGuard requiredPlan="basic" feature="KI-Buddy Chat">
      <KiBuddyBetaInner />
    </PremiumGuard>
  );
}

function KiBuddyBetaInner() {
  const { buddy, activeBuddy } = useBuddyPreferences();
  const [searchParams] = useSearchParams();
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

  const avatarGlow = isSpeaking
    ? "0 0 0 3px rgba(34,211,200,0.45)"
    : status === "listening"
    ? "0 0 0 3px rgba(124,58,237,0.5)"
    : "none";

  const statusLabels = {
    listening: "Ich höre zu...",
    speaking: "KI-Buddy spricht...",
    thinking: "Denke nach...",
    "": "Tippe oder aktiviere das Mikrofon"
  };

  return (
    <div className="bb-app bb-voice-page min-h-screen flex items-start justify-center p-4 pb-32">
      <style>{`@keyframes bbDot { 0%,80%,100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }`}</style>
      <div className="w-full max-w-2xl">
        <div style={{ background: "#060d1a", borderRadius: 16, overflow: "hidden", fontFamily: "'Inter',sans-serif", border: "1px solid #1a2a3a", display: "flex", flexDirection: "column" }}>

          {/* Header */}
          <div className="p-5 flex items-center justify-between"><div><p className="bb-eyebrow">KI-Buddy</p><h1 className="text-2xl font-semibold mt-1">Mit {activeBuddy.name} ans Wasser.</h1><p className="bb-muted">Frag mich alles rund ums Angeln.</p></div><Link className="bb-secondary" to="/Settings?tab=buddy" aria-label="KI-Buddy einstellen"><Settings2 size={20}/></Link></div>
          <img src={activeBuddy.portrait} alt={activeBuddy.name + ', dein KI-Buddy'} className="w-full h-56 sm:h-72 object-cover object-[center_28%]"/>
          <div className="p-4 grid sm:grid-cols-2 gap-2">{['Wo finde ich passende Spots und gutes Wetter?', 'Welche Köder passen zu meinen letzten Fängen?', 'Was brauche ich für meinen nächsten Angelausflug?', 'Wann ist heute die beste Angelzeit?'].map(question => <button type="button" key={question} className="bb-secondary text-left text-sm" onClick={() => setInput(question)}>{question}</button>)}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", borderBottom: "1px solid #111e2e" }}>
            <div>
              <span style={{ fontSize: 16, fontWeight: 600, color: "#22d3c8", letterSpacing: 0.3 }}>KI Voice-Buddy</span>
              <span style={{ marginLeft: 8, fontSize: 11, color: "#4455aa", fontWeight: 500, background: "#0d1a33", border: "1px solid #1e2f55", borderRadius: 8, padding: "2px 7px" }}>BETA</span>
            </div>
            <button type="button"
              onClick={() => { setTonAn(t => !t); if (tonAn) stopSpeaking(); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: tonAn ? "#22d3c8" : "#0d2020", border: "1px solid #22d3c8", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: tonAn ? "#060d1a" : "#22d3c8", fontWeight: 500, cursor: "pointer" }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: tonAn ? "#060d1a" : "#22d3c8", display: "inline-block" }} />
              {tonAn ? "Ton an" : "Ton aus"}
            </button>
          </div>

          {/* Gesprächssteuerung: starten / beenden */}
          <div style={{ padding: "12px 16px 8px", background: "#08111f" }}>
            {!conversationActive ? (
              <button type="button"
                onClick={startConversation}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#0891b2", border: "none", borderRadius: 12, padding: "12px 16px", color: "#ffffff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                Gespräch starten
              </button>
            ) : (
              <button type="button"
                onClick={endConversation}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#3a0d14", border: "1px solid #ef4444", borderRadius: 12, padding: "12px 16px", color: "#fca5a5", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                Gespräch beenden
              </button>
            )}
          </div>

          {/* Voice control row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 10px", background: "#08111f" }}>
            <span style={{ fontSize: 12, color: "#8899aa", maxWidth: 180, lineHeight: 1.4 }}>Einzelne Frage per Mikrofon stellen</span>
            <button type="button"
              onClick={toggleMic}
              disabled={conversationActive}
              style={{ display: "flex", alignItems: "center", gap: 7, background: recording ? "#22d3c8" : "#0d2a28", border: "1px solid #22d3c8", borderRadius: 10, padding: "8px 14px", color: recording ? "#060d1a" : "#22d3c8", fontSize: 13, fontWeight: 500, cursor: conversationActive ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: conversationActive ? 0.45 : 1 }}
            >
              <span>{recording ? "Aktiv" : "Mikrofon"}</span>
            </button>
          </div>

          {/* Status hint */}
          <div style={{ padding: "6px 16px 10px", fontSize: 11, color: "#445566", fontStyle: "italic", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span role="status" aria-live="polite">{statusLabels[status] || statusLabels[""]}</span>
            {confidence !== null && (
              <span style={{ color: "#22d3c8", fontStyle: "normal", fontWeight: 500 }}>Erkennung: {confidence}%</span>
            )}
          </div>

          {/* Avatar row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "#0a1624", borderTop: "1px solid #111e2e", borderBottom: "1px solid #111e2e" }}>
            <BuddyAvatar speaking={isSpeaking} listening={status === "listening"} showHints={false} size={52} style={{ borderRadius: 14, overflow: "hidden", flexShrink: 0, boxShadow: avatarGlow, transition: "box-shadow 0.3s" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e0f0ff" }}>KI-Buddy</div>
              <div style={{ fontSize: 12, color: "#556677", marginTop: 2 }}>Dein Angel-Buddy</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, height: 24, opacity: isSpeaking ? 1 : 0, transition: "opacity 0.3s" }}>
              {waveBars.map((h, i) => (
                <div key={i} style={{ width: 3, height: h, background: "#22d3c8", borderRadius: 2, transition: "height 0.1s" }} />
              ))}
            </div>
          </div>

          {/* Chat */}
          <div ref={chatRef} style={{ flex: 1, padding: "12px 14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, minHeight: 160, background: "#060d1a" }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                fontSize: m.role === "system" ? 11 : 13,
                lineHeight: 1.5,
                padding: "9px 12px",
                borderRadius: 12,
                maxWidth: "88%",
                alignSelf: m.role === "user" ? "flex-end" : m.role === "system" ? "center" : "flex-start",
                background: m.role === "user" ? "#131f33" : m.role === "system" ? "transparent" : "#0d1e14",
                color: m.role === "user" ? "#aabbd0" : m.role === "system" ? "#445566" : "#7adba0",
                border: m.role === "system" ? "none" : m.role === "user" ? "1px solid #1e2f44" : "1px solid #163025",
                borderBottomRightRadius: m.role === "user" ? 4 : 12,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : 12,
                fontStyle: m.role === "system" ? "italic" : "normal",
                textAlign: m.role === "system" ? "center" : "left"
              }}>
                {m.text}
                {m.role === "assistant" && m.source && (
                  <div style={{ marginTop: 6, fontSize: 10, color: "#4f8a6a", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <span>{m.source === "offline" ? "Offline-Antwort aus dem Buddy-Wissen" : "Sofort-Antwort aus dem Buddy-Wissen"}</span>
                    {m.page && (
                      <Link to={`/${m.page}`} style={{ color: "#22d3c8", textDecoration: "underline" }}>
                        {faqPageLabel(m.page)} öffnen
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
            {interimTranscript && (
              <div style={{ alignSelf: "flex-end", background: "#0e1828", border: "1px dashed #1e2f44", borderRadius: 12, borderBottomRightRadius: 4, padding: "9px 12px", color: "#7788aa", fontSize: 13, fontStyle: "italic", maxWidth: "88%" }}>
                {interimTranscript}
              </div>
            )}
            {status === "thinking" && (
              <div style={{ alignSelf: "flex-start", background: "#0d1e14", border: "1px solid #163025", borderRadius: 12, borderBottomLeftRadius: 4, padding: "9px 12px", color: "#7adba0", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", gap: 3 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7adba0", animation: "bbDot 1s infinite", animationDelay: "0s" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7adba0", animation: "bbDot 1s infinite", animationDelay: "0.2s" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7adba0", animation: "bbDot 1s infinite", animationDelay: "0.4s" }} />
                </span>
                <span>KI-Buddy denkt nach – das kann einen Moment dauern…</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: 8, padding: "12px 14px 14px", background: "#08111f", borderTop: "1px solid #111e2e" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendText()}
              placeholder="Frage stellen..."
              style={{ flex: 1, background: "#0d1a2a", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 14px", color: "#ccdde8", fontSize: 13, fontFamily: "inherit", outline: "none" }}
            />
            <button type="button"
              onClick={sendText}
              disabled={!input.trim() || status === "thinking"}
              style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", opacity: !input.trim() || status === "thinking" ? 0.5 : 1 }}
            >
              Senden
            </button>
            <button type="button"
              onClick={stopSpeaking}
              style={{ background: "#0d1a2a", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px", color: "#556677", cursor: "pointer", fontSize: 13 }}
              title="Stopp"
            >
              Stop
            </button>
          </div>

          <div style={{ textAlign: "center", fontSize: 10, color: "#4a5a6a", padding: "0 14px 6px", background: "#08111f", lineHeight: 1.4 }}>
            Hinweis: Nach dem Senden kann es ein paar Sekunden dauern, bis die Antwort kommt.
          </div>

          <div style={{ textAlign: "center", fontSize: 11, color: "#223344", padding: "0 14px 10px", background: "#08111f", letterSpacing: 0.5, textTransform: "uppercase" }}>
            {status || "Bereit"}
          </div>
        </div>
      </div>
    </div>
  );
}