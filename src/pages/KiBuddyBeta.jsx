import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, BrainCircuit, Volume2, VolumeX, UserRound, MapPin, Fish, PlusCircle, Navigation, Square, ChevronDown, CheckCheck, AudioLines } from 'lucide-react';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { useState, useRef, useEffect } from "react";
import { catchgbtChat } from "@/functions/catchgbtChat";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { useElevenLabsVoice } from "@/hooks/useElevenLabsVoice";
import { useEventActivityTracking } from "@/hooks/useEventActivityTracking";
import { useFitToViewport } from "@/hooks/useFitToViewport";
import { events, ai } from "@/api/frontendClient";
import { createSpeechQueue } from "@/components/utils/elevenLabsTTS";
import { stripActionMarker } from "@/lib/streamingReply";
import { resolveLocalAnswer, getOfflineFallback, faqPageLabel } from "@/lib/buddyFaq";
import { buildGreeting } from "@/lib/buddyGreetings";
import { executeBuddyAction } from "@/utils/buddyActions";
import { useLocalBuddy } from "@/hooks/useLocalBuddy";
import { isQuotaExceeded } from "@/lib/aiQuota";
import { getBuddyDataSource, setBuddyDataSource } from "@/lib/buddyDataSource";
import BuddyDataSourceSwitch from "@/components/ai/BuddyDataSourceSwitch";

import PremiumGuard from "@/components/premium/PremiumGuard";
import BuddyLiveModeSwitcher from "@/components/ai/BuddyLiveModeSwitcher";
import BuddyLiveHandsFreeView from "@/components/ai/BuddyLiveHandsFreeView";
import BuddyLiveCallView from "@/components/ai/BuddyLiveCallView";

const SOURCE_LABELS = {
  offline: "Offline-Antwort aus dem Buddy-Wissen",
  instant: "Sofort-Antwort aus dem Buddy-Wissen",
  device: "Auf deinem Gerät beantwortet",
  knowledge: "Aus dem Buddy-Wissen",
};

const VALID_MODES = ["text", "live", "handsfree"];

// Schallwellen links und rechts vom Buddy (Vorlage). `levels` kommt aus der
// Sprech-/Zuhör-Animation (startWave); im Ruhezustand bleibt die Grundform.
const ORB_WAVE = [0.22, 0.38, 0.28, 0.58, 0.44, 0.82, 1, 0.68, 0.9, 0.5, 0.64, 0.34, 0.26];
function VoiceWave({ levels, side }) {
  const bars = side === "left" ? [...ORB_WAVE].reverse() : ORB_WAVE;
  return (
    <span className={`bb-voice-wave is-${side}`} aria-hidden="true">
      <span className="bb-voice-wave-dots" />
      <span className="bb-voice-wave-bars">
        {bars.map((h, i) => {
          const level = Math.min(1, Math.max(0, (levels[i % levels.length] - 4) / 18));
          return <i key={i} style={{ height: `${Math.round(h * (60 + level * 40))}%` }} />;
        })}
      </span>
      <span className="bb-voice-wave-dots is-short" />
    </span>
  );
}

// Kleine Wellen neben dem Mikrofon in der Eingabeleiste; bewegen sich, solange
// das Mikrofon offen ist.
const INPUT_WAVE = [0.35, 0.6, 0.85, 1, 0.75, 0.55, 0.3];
function InputWave({ live }) {
  return (
    <span className={`bb-voice-input-wave${live ? " is-live" : ""}`} aria-hidden="true">
      {INPUT_WAVE.map((h, i) => <i key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
    </span>
  );
}

export default function KiBuddyBeta() {
  return (
    // Gratis-Tarif darf chatten (serverseitig auf 5 Nachrichten/Tag begrenzt,
    // siehe checkChatRateLimit) — wie in der Tool-Registry (ki-buddy: free).
    <PremiumGuard requiredPlan="free" feature="KI-Buddy Chat">
      <KiBuddyBetaInner />
    </PremiumGuard>
  );
}

// Exportiert, damit HandsFreeBuddy.jsx/VoiceChat.jsx (alte Routen) denselben
// Screen mit vorausgewähltem Modus rendern, statt eine eigene Sitzung mit
// eigenem Verlauf zu führen ("Buddy Live" — Punkt 5: ein gemeinsamer Screen).
export function KiBuddyBetaInner({ initialMode } = {}) {
  const { buddy, activeBuddy } = useBuddyPreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  useFeatureTracking("ai_buddy");
  const { trackAIChat } = useEventActivityTracking();
  // KI auf dem Gerät (Android-App mit heruntergeladenem Qwen-Modell).
  const localBuddy = useLocalBuddy();
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
  const [openMenu, setOpenMenu] = useState(null);
  const [audioOpen, setAudioOpen] = useState(false);
  const chatRef = useRef();
  // Seite passt ohne Scrollen in den Bildschirm; nur der Chatverlauf scrollt.
  const pageRef = useRef(null);
  useFitToViewport(pageRef);
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

  // "Buddy Live": Textchat/Voice (Standard), echtes Live-Gespräch (WebRTC) und
  // Hands-free teilen sich diesen einen Screen und denselben Gesprächsverlauf
  // (messages/appendMessages/ask) — hier wird nur die Ansicht umgeschaltet.
  const modeParam = searchParams.get("mode");
  const [mode, setModeState] = useState(() => (
    VALID_MODES.includes(initialMode) ? initialMode : (VALID_MODES.includes(modeParam) ? modeParam : "text")
  ));
  // Wessen "Sprechen zu Ende"-Callback die Sprech-Queue gerade auslösen soll —
  // im Chat-Modus die eigene Freisprechen-Schleife (maybeContinueConversation),
  // im Hands-free-Modus dessen Wake-Word-Schleife. Vermeidet zwei Modi, die
  // gleichzeitig ums Mikrofon konkurrieren.
  const activeOnDrainRef = useRef(null);
  const registerSpeakingDoneHandler = (fn) => { activeOnDrainRef.current = fn; };

  // Datenquelle (Punkt 8): Wissensbasis vs. echtes KI-Modell — der Nutzer
  // entscheidet, ob eine Frage möglichst ohne Guthabenverbrauch (Datenbank)
  // oder immer per Modellanfrage beantwortet wird.
  const [dataSource, setDataSourceState] = useState(() => getBuddyDataSource());
  function setDataSource(next) {
    setBuddyDataSource(next);
    setDataSourceState(next);
  }

  function setMode(next) {
    if (next === mode) return;
    // Sauberer Übergang: laufende Sprachausgabe/-erkennung dieses Screens
    // stoppen, bevor der neue Modus sein eigenes Mikrofon/seine eigene
    // Verbindung öffnet — sonst könnten zwei Stimmen/Mikrofone gleichzeitig
    // aktiv sein.
    abortRef.current?.abort();
    retryRef.current = 0;
    stopSpeaking();
    stopMic();
    if (conversationActiveRef.current) endConversation();
    setModeState(next);
    setSearchParams((prev) => {
      const next2 = new URLSearchParams(prev);
      next2.set("mode", next);
      return next2;
    }, { replace: true });
  }

  // Einzige Schreibstelle für Nachrichten: hält Ref und State synchron und
  // unterbindet Updates nach dem Unmount.
  function appendMessages(...items) {
    if (!isMountedRef.current || items.length === 0) return;
    const at = Date.now();
    messagesRef.current = [...messagesRef.current, ...items.map(m => ({ at, ...m }))];
    setMessages(messagesRef.current);
  }

  // Live-Streaming der Assistant-Antwort: aktualisiert die letzte Bubble
  // in-place (streaming) bzw. legt sie beim ersten Delta an.
  function upsertAssistantStreaming(text) {
    if (!isMountedRef.current) return;
    const arr = messagesRef.current;
    const last = arr[arr.length - 1];
    const next = last && last.role === "assistant" && last.streaming
      ? [...arr.slice(0, -1), { ...last, text }]
      : [...arr, { role: "assistant", text, streaming: true, at: Date.now() }];
    messagesRef.current = next;
    setMessages(next);
  }

  // Ersetzt die streamende Bubble durch die finale Antwort (bzw. legt sie an,
  // falls kein Streaming lief — Fallback-Pfad).
  function finalizeAssistant(text, extra = {}) {
    if (!isMountedRef.current) return;
    const arr = messagesRef.current;
    const last = arr[arr.length - 1];
    const next = last && last.role === "assistant" && last.streaming
      ? [...arr.slice(0, -1), { role: "assistant", text, at: last.at, ...extra }]
      : [...arr, { role: "assistant", text, at: Date.now(), ...extra }];
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
    // Neueste Nachricht steht oben (Vorlage) — nach jeder Änderung dorthin.
    if (chatRef.current) chatRef.current.scrollTop = 0;
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
      continueAfterSpeaking();
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
        continueAfterSpeaking();
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

  // Nach jeder Sprachausgabe entscheidet der aktive Modus, was als Nächstes
  // passiert: im Hands-free-Modus dessen Wake-Word-Schleife (registriert über
  // registerSpeakingDoneHandler), sonst die Freisprechen-Schleife des
  // Chat-Modus (maybeContinueConversation).
  function continueAfterSpeaking() {
    if (activeOnDrainRef.current) activeOnDrainRef.current();
    else maybeContinueConversation();
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
  // nichts Passendes gefunden → ehrliche, Buddy-artige Fallback-Nachricht
  // statt einer rohen technischen Meldung. `retryQuestion` (falls die Ursache
  // ein Verbindungsfehler war, nicht simple Offline-Abwesenheit) lässt die
  // Chat-Bubble einen "Nochmal versuchen"-Button zeigen — die Frage selbst
  // bleibt dabei immer im Verlauf erhalten, geht also nie verloren.
  function answerLocally(local, { retryQuestion } = {}) {
    retryRef.current = 0;
    if (!local) {
      setStatus("");
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      appendMessages(
        {
          role: "system",
          text: offline
            ? "Du bist gerade offline. Ich helfe dir trotzdem mit dem, was ich weiß."
            : "Ich erreiche meinen Dienst gerade nicht. Deine Frage bleibt hier stehen — gleich klappt's bestimmt.",
          retryQuestion: !offline ? retryQuestion : undefined,
        },
        { role: "assistant", text: getOfflineFallback(), source: "offline" }
      );
      continueAfterSpeaking();
      return;
    }
    appendMessages({ role: "assistant", text: local.answer, source: local.mode, page: local.page });
    if (activeEventId && local.mode === "instant" && local.entry.category !== "smalltalk") {
      trackAIChat(activeEventId);
    }
    speakAnswer(local.answer);
  }

  // Verwirft eine angefangene Streaming-Bubble (vor Fehler-/Fallback-Nachrichten).
  function dropStreamingBubble() {
    const arr = messagesRef.current;
    if (arr[arr.length - 1]?.streaming) {
      const trimmed = arr.slice(0, -1);
      messagesRef.current = trimmed;
      setMessages(trimmed);
    }
  }

  const LOCAL_ERROR_LABELS = {
    model_missing: "Das Modell auf dem Gerät fehlt. Lade es unter Einstellungen > KI-Buddy neu herunter.",
    insufficient_ram: "Für das Modell auf dem Gerät reicht der Arbeitsspeicher nicht.",
    model_load_failed: "Das Modell auf dem Gerät ließ sich nicht laden.",
  };

  // Antwort vom Qwen-Modell auf dem Gerät (llama.cpp in der Android-App),
  // inklusive Werkzeugen für Wetter, Fangbuch, Spots, Schonzeiten und Aktionen.
  async function askOnDevice(q, { fallback = false } = {}) {
    setStatus("thinking");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    speechQueueRef.current?.cancel();
    speechQueueRef.current = null;
    if (fallback) {
      appendMessages({ role: "system", text: "Cloud-KI nicht erreichbar, dein Buddy antwortet jetzt direkt auf dem Gerät." });
    }
    const queue = tonAn ? createSpeechQueue({
      rate: 1.0,
      onDrain: () => {
        if (!isMountedRef.current) return;
        setStatus("");
        stopWave();
        continueAfterSpeaking();
      },
    }) : null;
    if (queue) speechQueueRef.current = queue;

    // Verlauf ohne die aktuelle Frage (die hängt schon als letzte User-Nachricht an).
    const turns = messagesRef.current
      .filter(m => (m.role === "user" || m.role === "assistant") && !m.streaming)
      .map(m => ({ role: m.role, content: m.text }));
    let lastUser = turns.length - 1;
    while (lastUser >= 0 && turns[lastUser].role !== "user") lastUser -= 1;
    const history = lastUser >= 0 ? turns.slice(0, lastUser) : turns;

    let shown = "";
    let spoken = false;
    try {
      const result = await localBuddy.askLocal({
        history,
        question: q,
        signal,
        context: { navigate },
        onDelta: (delta) => {
          if (!isMountedRef.current || signal.aborted) return;
          shown += delta;
          upsertAssistantStreaming(shown.trimStart());
          if (queue) {
            if (!spoken) { spoken = true; setStatus("speaking"); startWave(); }
            queue.push(delta);
          }
        },
      });
      if (!isMountedRef.current || signal.aborted) { queue?.cancel(); return; }
      retryRef.current = 0;
      const ans = result.reply || shown.trim() || "Keine Antwort erhalten.";
      finalizeAssistant(ans, { source: "device" });
      for (const notice of result.notices) appendMessages({ role: "system", text: notice });
      if (result.action) {
        executeBuddyAction(result.action, { navigate })
          .then(outcome => { if (outcome?.message) appendMessages({ role: "system", text: outcome.message }); })
          .catch(() => appendMessages({ role: "system", text: "Die Aktion konnte nicht ausgeführt werden." }));
      }
      if (activeEventId) trackAIChat(activeEventId);
      if (queue && spoken) queue.flush();
      else { queue?.cancel(); speakAnswer(ans); }
    } catch (error) {
      if (!isMountedRef.current || signal.aborted || error?.name === "AbortError") return;
      queue?.cancel();
      dropStreamingBubble();
      appendMessages({ role: "system", text: LOCAL_ERROR_LABELS[error?.code] || "Die KI auf dem Gerät hat gerade nicht geantwortet." });
      answerLocally(resolveLocalAnswer(q, { online: false }));
    }
  }

  async function ask(q, isRetry = false) {
    if (!isRetry) {
      // Häufige Standardfragen beantwortet die lokale FAQ-Datenbank sofort —
      // ohne API-Aufruf und Wartezeit. Ohne Netz geht es direkt in den
      // Offline-Pfad, statt erst Timeouts und Retries abzuwarten.
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      const inConversation = messagesRef.current.some(m => m.role === "assistant");

      // Datenquelle "Datenbank" (Punkt 8: Umschalter Wissen/Modell): nie eine
      // Modellanfrage — weder Gerät noch Cloud —, sondern ausschließlich die
      // vorhandene Wissensbasis. Geringstmöglicher Guthabenverbrauch.
      if (dataSource === "database") {
        abortRef.current?.abort();
        speechQueueRef.current?.cancel();
        speechQueueRef.current = null;
        const knowledge = resolveLocalAnswer(q, { online: false, inConversation });
        answerLocally(knowledge || {
          answer: "Dazu habe ich in meinem gespeicherten Wissen noch keine passende Antwort. Wähle Auto oder KI-Modell für eine ausführlichere Antwort.",
          mode: "knowledge",
        });
        return;
      }

      if (dataSource !== "model") {
        const engine = localBuddy.engineFor(online);
        if (engine === "local" || engine === "none") {
          // Eindeutige Standardfragen bleiben Sofort-Antworten — schneller als jedes Modell.
          const instant = resolveLocalAnswer(q, { online: true, inConversation });
          abortRef.current?.abort();
          speechQueueRef.current?.cancel();
          speechQueueRef.current = null;
          if (instant) { answerLocally(instant); return; }
          if (engine === "local") { askOnDevice(q); return; }
          // Modus "Nur auf dem Gerät", aber kein Modell bereit: keine Cloud.
          appendMessages({ role: "system", text: "Die KI auf dem Gerät ist noch nicht eingerichtet. Lade ein Modell unter Einstellungen > KI-Buddy herunter." });
          answerLocally(resolveLocalAnswer(q, { online: false, inConversation }));
          return;
        }
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
      } else {
        // Datenquelle "KI-Modell": die kostenlose Sofort-/Offline-Abkürzung
        // überspringen, aber die in den Einstellungen gewählte Engine
        // (Gerät/Cloud) weiterhin respektieren — Gerät bleibt Gerät, nur ohne
        // FAQ-Shortcut. Cloud fällt unten in den bestehenden Modell-Aufruf.
        const engine = localBuddy.engineFor(online);
        if (engine === "local") { askOnDevice(q); return; }
        if (engine === "none") {
          appendMessages({ role: "system", text: "Die KI auf dem Gerät ist noch nicht eingerichtet. Lade ein Modell unter Einstellungen > KI-Buddy herunter." });
          answerLocally(resolveLocalAnswer(q, { online: false, inConversation }));
          return;
        }
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
        continueAfterSpeaking();
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
            if (!isMountedRef.current || signal?.aborted) return;
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
        // Volumen aufgebraucht: der gepufferte Pfad würde ebenso abgelehnt.
        if (isQuotaExceeded(streamErr)) throw streamErr;
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

      if (!isMountedRef.current || signal?.aborted) { queue?.cancel(); return; }

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
      if (!isMountedRef.current || signal?.aborted) return;

      // Abgebrochener Request (neuer Turn oder Unmount): keine Fehler-/Offline-
      // Behandlung, der neue Aufruf übernimmt bzw. die Seite ist verlassen.
      if (error?.name === "AbortError") return;

      queue?.cancel();
      // Eine evtl. angefangene Streaming-Bubble verwerfen (bevor Offline-/
      // Fallback-Nachrichten angehängt werden).
      dropStreamingBubble();

      // Automatik-Modus: Die KI auf dem Gerät springt ein, bevor es auf die
      // deutlich knapperen FAQ-Antworten zurückgeht — auch beim Tageslimit
      // der Cloud, denn lokal kostet eine Antwort nichts.
      if (localBuddy.canFallBack) {
        askOnDevice(q, { fallback: true });
        return;
      }

      // KI-Volumen des Monats aufgebraucht: ehrlich sagen und ohne Wiederholung
      // aus der lokalen Wissensbasis antworten, soweit sie passt.
      if (isQuotaExceeded(error)) {
        appendMessages({ role: "system", text: error.data.error || "Dein KI-Volumen für diesen Monat ist aufgebraucht." });
        const faqAnswer = resolveLocalAnswer(q, { online: false });
        if (faqAnswer) answerLocally(faqAnswer);
        else setStatus("");
        return;
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
        if (!isMountedRef.current || signal?.aborted) return;
        return ask(q, true);
      }

      // Keine passende lokale Antwort und Retries erschöpft: technischen Fehler
      // fürs Debugging loggen (nie dem Nutzer zeigen), Buddy-Fallback + Retry.
      console.error("[KiBuddyBeta] Chat-Anfrage fehlgeschlagen:", error);
      answerLocally(null, { retryQuestion: q });
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

  // Der globale Wake-Word-Listener übergibt eine Frage oder fordert direktes
  // Zuhören an. Query-Parameter nur einmal verarbeiten, damit ein erneutes
  // Rendern keine zweite Anfrage oder zweite Mikrofon-Sitzung startet.
  useEffect(() => {
    if (searchParams.get("wake") !== "1") return;
    const question = searchParams.get("question")?.trim();
    const shouldListen = searchParams.get("listen") === "1";
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete("wake");
      next.delete("question");
      next.delete("listen");
      return next;
    }, { replace: true });
    if (question) {
      setInput("");
      appendMessages({ role: "user", text: question });
      ask(question);
    } else if (shouldListen) {
      startConversation();
    }
    // Parameter werden einmalig konsumiert; die aktiven Helfer gehören zum
    // selben Mount und dürfen durch deren Zustand nicht erneut auslösen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("wake")]);

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
  const lastAnswerText = [...messages].reverse().find(m => m.role === "assistant" && !m.streaming)?.text || null;

  const formatTime = at => (at ? new Date(at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null);
  const buddyIcon = <img src="/assets/buddy/buddy-icon.webp" alt="" aria-hidden="true" />;
  const micLive = recording || conversationActive;

  return (
    <div ref={pageRef} className="bb-page bb-voice">
      <div className="bb-voice-menus">
        <div className={`bb-voice-menu${openMenu === "info" ? " is-open" : ""}`}>
          <button type="button" className="bb-voice-menu-toggle" aria-expanded={openMenu === "info"} onClick={() => setOpenMenu(m => (m === "info" ? null : "info"))}>
            Modus &amp; Infos <ChevronDown size={20} aria-hidden="true" />
          </button>
          <div className="bb-voice-menu-panel">
            <BuddyLiveModeSwitcher mode={mode} onChange={m => { setMode(m); setOpenMenu(null); }} />
            {mode !== "live" && <BuddyDataSourceSwitch value={dataSource} onChange={setDataSource} />}
            <div className="bb-voice-states" role="status" aria-live="polite">
              <span className={phase === "listening" ? "is-active is-green" : ""}><Mic size={16} aria-hidden="true" />Ich höre …</span>
              <span className={phase === "thinking" ? "is-active" : ""}><BrainCircuit size={16} aria-hidden="true" />Verarbeite …</span>
              <span className={phase === "speaking" ? "is-active" : ""}><Volume2 size={16} aria-hidden="true" />Buddy spricht …</span>
            </div>
            {confidence !== null && <p className="bb-voice-confidence">Spracherkennung: {confidence}%</p>}
            <p className={`bb-voice-mode${conversationActive ? " is-active" : ""}`}>
              <i aria-hidden="true" />{conversationActive ? "Freisprechen aktiv" : "Tippe aufs Mikrofon für Freisprechen"}
            </p>
          </div>
        </div>
        <span className="bb-voice-menus-divider" aria-hidden="true" />
        <div className={`bb-voice-menu${openMenu === "actions" ? " is-open" : ""}`}>
          <button type="button" className="bb-voice-menu-toggle" aria-expanded={openMenu === "actions"} onClick={() => setOpenMenu(m => (m === "actions" ? null : "actions"))}>
            Aktionen <ChevronDown size={20} aria-hidden="true" />
          </button>
          <div className="bb-voice-menu-panel">
            <div className="bb-voice-actions">
              <Link to="/TripPlanner" className="bb-voice-action"><MapPin size={20} aria-hidden="true" /><span><strong>Trip öffnen</strong><small>Planen & starten</small></span></Link>
              <Link to="/Koeder3D" className="bb-voice-action"><Fish size={20} aria-hidden="true" /><span><strong>Köder wechseln</strong><small>Führung & Setups</small></span></Link>
              <button type="button" onClick={() => { setOpenMenu(null); window.dispatchEvent(new CustomEvent('openCatchDialog')); }} className="bb-voice-action"><PlusCircle size={20} aria-hidden="true" /><span><strong>Fang eintragen</strong><small>Schnell & einfach</small></span></button>
            </div>
            <div className="bb-voice-quick">
              {quickQuestions.map(question => (
                <button type="button" key={question} onClick={() => { setInput(question); setOpenMenu(null); }}>{question}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {mode === "live" && (
        <BuddyLiveCallView
          appendMessages={appendMessages}
          onFallback={(reason) => {
            setMode("text");
            appendMessages({ role: "system", text: reason });
            startConversation();
          }}
        />
      )}

      {mode === "handsfree" && (
        <BuddyLiveHandsFreeView
          onAsk={(q) => { appendMessages({ role: "user", text: q }); ask(q); }}
          registerSpeakingDoneHandler={registerSpeakingDoneHandler}
          speakingStatus={status}
          lastAnswerText={lastAnswerText}
        />
      )}

      {mode === "text" && (
      <>
      <div className={`bb-voice-orb is-${phase}`}>
        <VoiceWave levels={waveBars} side="left" />
        <div className="bb-voice-orb-core">
          <span className="bb-voice-orb-ring" aria-hidden="true" />
          <span className="bb-voice-sparkles" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <img className="bb-voice-emblem" src="/assets/buddy/buddy-emblem.webp" alt={`${activeBuddy.name}, dein KI-Buddy`} />
          <span className="bb-voice-splash is-left" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="bb-voice-splash is-right" aria-hidden="true"><i /><i /><i /><i /></span>
        </div>
        <VoiceWave levels={waveBars} side="right" />
        <span className="bb-voice-ripples" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      </div>

      <div ref={chatRef} className="bb-voice-chat">
        {status === "thinking" && (
          <div className="bb-voice-row">
            <span className="bb-voice-avatar">{buddyIcon}</span>
            <div className="bb-voice-msg">
              <span className="bb-voice-typing" aria-label="Buddy denkt nach"><i /><i /><i /></span>
            </div>
          </div>
        )}
        {interimTranscript && (
          <div className="bb-voice-row is-user">
            <div className="bb-voice-msg">
              <p className="bb-voice-bubble is-user is-interim">{interimTranscript}</p>
            </div>
            <span className="bb-voice-avatar is-user"><UserRound size={24} aria-hidden="true" /></span>
          </div>
        )}
        {messages.map((m, i) => ({ m, i })).reverse().map(({ m, i }) => (
          m.role === "user" ? (
            <div key={i} className="bb-voice-row is-user">
              <div className="bb-voice-msg">
                <p className="bb-voice-bubble is-user">{m.text}</p>
                {m.at && <span className="bb-voice-meta">{formatTime(m.at)}<CheckCheck size={18} aria-hidden="true" /></span>}
              </div>
              <span className="bb-voice-avatar is-user"><UserRound size={24} aria-hidden="true" /></span>
            </div>
          ) : (
            <div key={i} className={`bb-voice-row${m.role === "system" ? " is-system" : ""}`}>
              <span className="bb-voice-avatar">{buddyIcon}</span>
              <div className="bb-voice-msg">
                <p className={m.role === "system" ? "bb-voice-system" : "bb-voice-bubble"}>{m.text}</p>
                {m.source && (
                  <span className="bb-voice-source">
                    <span>{SOURCE_LABELS[m.source] || SOURCE_LABELS.instant}</span>
                    {m.page && <Link to={`/${m.page}`}>{faqPageLabel(m.page)} öffnen</Link>}
                  </span>
                )}
                {m.retryQuestion && (
                  <button type="button" className="bb-voice-retry" onClick={() => ask(m.retryQuestion)}>
                    Nochmal versuchen
                  </button>
                )}
                {m.at && !m.streaming && <span className="bb-voice-meta">{formatTime(m.at)}</span>}
              </div>
            </div>
          )
        ))}
      </div>

      <div className={`bb-voice-input${audioOpen ? " is-audio-open" : ""}`}>
        <div className="bb-voice-audio-tray" role="group" aria-label="Sprachsteuerung" aria-hidden={!audioOpen}>
          <button type="button" tabIndex={audioOpen ? 0 : -1} onClick={() => { setTonAn(t => !t); if (tonAn) stopSpeaking(); }} className="bb-voice-icon-btn is-speaker" aria-pressed={tonAn} aria-label={`Lautsprecher ${tonAn ? "aus" : "an"}schalten`}>
            {tonAn ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
          </button>
          <InputWave live={micLive} />
          <button
            type="button"
            tabIndex={audioOpen ? 0 : -1}
            onClick={conversationActive ? endConversation : (recording ? toggleMic : startConversation)}
            className={`bb-voice-icon-btn is-mic${micLive ? " is-on" : ""}`}
            aria-label={conversationActive ? "Freisprechen beenden" : "Freisprechen starten"}
          >
            <Mic size={20} aria-hidden="true" />
          </button>
          <InputWave live={micLive} />
          <button type="button" tabIndex={audioOpen ? 0 : -1} onClick={stopSpeaking} className="bb-voice-icon-btn is-stop" aria-label="Buddy stoppen">
            <Square size={13} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        <div className="bb-voice-input-inner">
          <button
            type="button"
            onClick={() => setAudioOpen(o => !o)}
            className={`bb-voice-icon-btn is-audio-toggle${audioOpen ? " is-open" : ""}${micLive || isSpeaking ? " is-active" : ""}`}
            aria-expanded={audioOpen}
            aria-label={audioOpen ? "Sprachsteuerung schließen" : "Sprachsteuerung öffnen"}
          >
            <AudioLines size={20} aria-hidden="true" />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendText()}
            placeholder="Frage stellen..."
            aria-label="Frage an den Buddy"
          />
          <span className="bb-voice-input-divider" aria-hidden="true" />
          <button type="button" onClick={sendText} disabled={!input.trim() || status === "thinking"} className="bb-voice-icon-btn is-send" aria-label="Senden">
            <Navigation size={20} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
