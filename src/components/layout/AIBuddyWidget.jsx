import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BuddyAvatar from '@/components/ai/BuddyAvatar';
import { getTipForPage, getQuestionForPage, getPageNameFromPathname } from '@/lib/buddyTips';
import { getRandomFarewellMessage } from '@/lib/buddyJokes';
import { buildGreeting, shouldGreet, markGreeted } from '@/lib/buddyGreetings';
import { runWhenAudioReady } from '@/lib/audioUnlock';
import { useAuth } from '@/lib/AuthContext';
import { ai, events } from '@/api/frontendClient';
import { speakWithFallback, cancelElevenLabs, createSpeechQueue } from '@/components/utils/elevenLabsTTS';
import { stripActionMarker } from '@/lib/streamingReply';
import { findOfflineBuddyAnswer, getOfflineBuddyFallback } from '@/lib/offlineBuddyQuestions';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Send, X } from 'lucide-react';

import { useChatMessages } from '@/hooks/useChatMessages';
import { useBuddyStorage } from '@/hooks/useBuddyStorage';
import { executeBuddyAction } from '@/utils/buddyActions';
import {
  BUDDY_TIMEOUTS,
  BUDDY_AVATAR_SIZE,
} from '@/lib/buddyStorageKeys';

const AVATAR_SIZE = BUDDY_AVATAR_SIZE;
const DRAG_THRESHOLD = BUDDY_TIMEOUTS.DRAG_THRESHOLD;
const DRAG_THRESHOLD_TOUCH = BUDDY_TIMEOUTS.DRAG_THRESHOLD_TOUCH;

function clampPos(x, y) {
  if (typeof window === 'undefined') return { x, y };
  return {
    x: Math.max(0, Math.min(x, window.innerWidth - AVATAR_SIZE)),
    y: Math.max(0, Math.min(y, window.innerHeight - AVATAR_SIZE)),
  };
}

function getDefaultPos() {
  if (typeof window === 'undefined') return { x: 300, y: 500 };
  return {
    x: window.innerWidth - AVATAR_SIZE - 24,
    y: window.innerHeight - AVATAR_SIZE - 100,
  };
}

// Eigener State + React.memo: Tastenanschläge im Eingabefeld rendern so nur
// diese Subkomponente neu, nicht die gesamte Nachrichtenliste/Avatar-Animation.
const ChatInput = React.memo(function ChatInput({ isLoading, onSend }) {
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  };

  return (
    <div className="border-t border-[rgba(0,229,255,0.15)] bg-[#0c1e2d] p-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="Schreib eine Frage..."
          className="flex-1 px-3 py-2 border border-[rgba(0,229,255,0.2)] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 text-sm bg-[#0a1929] text-slate-200 placeholder-[#7a96ae]"
          disabled={isLoading}
          aria-label="Chat-Eingabefeld"
        />
        <button type="button"
          onClick={submit}
          disabled={isLoading || !value.trim()}
          className="p-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 text-[#04111a] rounded-lg transition-colors flex-shrink-0"
          aria-label="Nachricht senden"
          title="Nachricht senden (Enter)"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
});

// initialOpen: true, wenn das Widget als Reaktion auf einen Nutzer-Klick (Stub)
// gemountet wird — der Chat soll dann sofort offen sein, nicht erst nach einem
// zweiten Klick. initialLastTouch übernimmt den Zeitstempel des Stub-Taps,
// damit der Geister-Mausevent-Guard über den Stub→Widget-Wechsel hinweg greift.
export default function AIBuddyWidget({ initialOpen = false, initialLastTouch = 0 } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  // Use new hooks for centralized state
  const {
    messages,
    setMessages,
    messagesRef,
    messagesEndRef,
  } = useChatMessages();

  const {
    widgetPos: pos,
    setWidgetPos: setPos,
    isWidgetHidden,
    hideWidget,
    showWidget,
    isVoiceEnabled: buddyVoiceEnabled,
    toggleVoice: toggleBuddyVoice,
    getLocation: getStoredLocation,
  } = useBuddyStorage();

  // Local UI states
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isTalking, setIsTalking] = useState(false);

  // Persisted state to localStorage
  const isHidden = isWidgetHidden;
  const [isNodding, setIsNodding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [smallBubbleText, setSmallBubbleText] = useState('');
  const [showSmallBubble, setShowSmallBubble] = useState(false);

  // Refs
  const widgetRef = useRef(null);
  const handleSendMessageRef = useRef(null);
  const handleAvatarClickRef = useRef(null);
  const smallBubbleTimerRef = useRef(null);
  const userActivityTimerRef = useRef(null);
  const isLoadingRef = useRef(false);
  // Guard gegen State-Updates nach dem Unmount (z. B. Antwort trifft ein, nachdem
  // der Nutzer weg-navigiert hat) und Anker für den TTS-Abbruch im Cleanup.
  const isMountedRef = useRef(true);

  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    moved: false,
  });

  // Zeitpunkt der letzten Touch-Interaktion. Ein Tap löst zusätzlich zu den
  // Touch-Events noch die vom Browser synthetisierten Kompatibilitäts-Mausevents
  // (mousedown/mouseup ~300 ms später) aus. Ohne diesen Guard toggelt der Tap
  // den Chat auf (touchend) und sofort wieder zu (mouseup) — für den Nutzer
  // „passiert nix". Der Zeitstempel lässt den Maus-Handler diese Geister-Events
  // ignorieren. Startwert kommt vom Stub (initialLastTouch), damit der Guard
  // auch für den Tap greift, der das Widget überhaupt erst nachgeladen hat.
  const lastTouchRef = useRef(initialLastTouch);

  // Merkt sich, für welche Seite die Frage-Blase zuletzt gezeigt wurde. Wird
  // vom Stub-Übergang nicht zurückgesetzt — nach dem Nachladen zeigt der
  // Seitenwechsel-Effekt die Frage für neue Seiten weiterhin an.
  const lastQuestionPageRef = useRef(null);

  // Kleine Blase mit Auto-Ausblenden & optionaler Abschieds-Nachricht.
  // Definition vor dem Page-Tracking-Effekt, der sie als Dependency nutzt.
  const showSmallBubbleWithText = useCallback((text, { farewell = true } = {}) => {
    setSmallBubbleText(text);
    setShowSmallBubble(true);

    if (smallBubbleTimerRef.current) clearTimeout(smallBubbleTimerRef.current);
    if (userActivityTimerRef.current) clearTimeout(userActivityTimerRef.current);

    // Frage-Blasen (farewell: false) blenden nach Ablauf einfach aus, ohne die
    // Abschieds-Nachricht – sie sollen zum Antippen einladen, nicht abwiegeln.
    if (!farewell) {
      smallBubbleTimerRef.current = setTimeout(() => {
        setShowSmallBubble(false);
      }, BUDDY_TIMEOUTS.SMALL_BUBBLE);
      return;
    }

    userActivityTimerRef.current = setTimeout(() => {
      const farewellMsg = getRandomFarewellMessage();
      setSmallBubbleText(farewellMsg);

      smallBubbleTimerRef.current = setTimeout(() => {
        setShowSmallBubble(false);
      }, 2000);
    }, BUDDY_TIMEOUTS.SMALL_BUBBLE);
  }, []);

  // Wurde das Widget per Klick auf den Stub-Avatar geöffnet, muss ein zuvor
  // gesetztes Hidden-Flag zurückgenommen werden, sonst bleibt der Chat trotz
  // isOpen unsichtbar (Bubbles sind an !isHidden gekoppelt).
  useEffect(() => {
    if (initialOpen) {
      showWidget();
    }
  }, [initialOpen, showWidget]);

  const currentPage = getPageNameFromPathname(location.pathname);
  const tip = getTipForPage(currentPage);

  // Start-Begrüßung: Einmal pro App-Sitzung meldet sich der KI-Buddy mit einer
  // immer anderen Begrüßung (Tageszeit, Stimmung, Event-Status) per Sprechblase
  // und — falls Voice aktiv — per Audio. Sie ersetzt auf der Startseite die
  // seitenspezifische Frage-Blase; dieser Effekt MUSS deshalb vor dem
  // Page-Tracking-Effekt deklariert bleiben (setzt lastQuestionPageRef synchron).
  const greetingStartedRef = useRef(false);
  useEffect(() => {
    if (isHidden || isOpen || greetingStartedRef.current) return undefined;
    // shouldGreet() prüft den Zeitstempel-Cooldown (localStorage). Meist hat der
    // Stub direkt beim App-Start schon begrüßt und markGreeted() gesetzt — dann
    // begrüßt das volle Widget nicht doppelt. Nur wenn das Widget ohne Stub-
    // Begrüßung mountet (oder der Cooldown abgelaufen ist), greift es.
    if (!shouldGreet()) return undefined;
    greetingStartedRef.current = true;
    markGreeted();
    lastQuestionPageRef.current = currentPage;

    let cancelled = false;
    (async () => {
      // Event-Status best effort: aktives Event und eigene Platzierung fließen
      // in die Begrüßung ein; Fehler (offline, Gast) lassen sie einfach weg.
      let activeEvent = null;
      let rank = null;
      try {
        const res = await events.getActiveEvent();
        activeEvent = res?.active_event || null;
        if (activeEvent?.id && user?.email) {
          const board = await events.leaderboard(activeEvent.id);
          if (Array.isArray(board)) {
            const idx = board.findIndex((p) => p.user_id === user.email);
            if (idx >= 0) rank = idx + 1;
          }
        }
      } catch { /* Event-Status ist optional für die Begrüßung */ }

      if (cancelled || !isMountedRef.current) return;
      const greeting = buildGreeting({ event: activeEvent, rank });
      showSmallBubbleWithText(greeting, { farewell: false });
      if (buddyVoiceEnabled) {
        // Audio erst abspielen, wenn es erlaubt ist (Autoplay-Policy) — beim
        // ersten Antippen wird es nachgeholt. speakWithFallback bleibt bei
        // Fehlern still (kein Roboterstimmen-Fallback mehr).
        runWhenAudioReady(() => {
          speakWithFallback(greeting, { voiceEnabled: buddyVoiceEnabled, rate: 1.0 });
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isHidden, isOpen, currentPage, buddyVoiceEnabled, showSmallBubbleWithText, user]);

  // Auto-Scroll bei neuen Nachrichten wird zentral in useChatMessages erledigt.

  // Page tracking: Bei jedem Öffnen einer Seite meldet sich der KI-Buddy mit einer
  // seitenspezifischen Frage zur Funktion in der kleinen Sprechblase. Der volle
  // Chat öffnet sich erst per Klick (auf Blase oder Avatar) – nicht
  // automatisch. lastQuestionPageRef verhindert nur, dass Effekt-Neuläufe ohne
  // Seitenwechsel (z. B. Chat schließen, Voice-Toggle) dieselbe Blase erneut
  // aufpoppen lassen.
  useEffect(() => {
    if (isHidden || isOpen) return undefined;
    if (lastQuestionPageRef.current === currentPage) return undefined;

    // Kleine Verzögerung, damit der Seitenwechsel visuell abgeschlossen ist,
    // bevor die Frage-Blase erscheint. Die Seite wird erst im Timer als
    // "gezeigt" markiert, damit der doppelte Effekt-Lauf in React.StrictMode
    // die Blase nicht verschluckt.
    const questionTimer = setTimeout(() => {
      lastQuestionPageRef.current = currentPage;
      const question = getQuestionForPage(currentPage);
      showSmallBubbleWithText(question, { farewell: false });

      if (buddyVoiceEnabled) {
        speakWithFallback(question, { voiceEnabled: buddyVoiceEnabled, rate: 1.0 });
      }
    }, 800);

    return () => {
      clearTimeout(questionTimer);
    };
  }, [currentPage, isOpen, isHidden, buddyVoiceEnabled, showSmallBubbleWithText]);

  // Positions-Persistenz erfolgt gedrosselt zentral in useBuddyStorage.

  // Window resize clamping
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => clampPos(prev?.x || 0, prev?.y || 0));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setPos]);

  // Drag handlers
  const handleAvatarClickRef_current = useCallback(() => {
    if (isHidden) {
      showWidget();
      setIsOpen(true);
    } else {
      setIsOpen((prev) => !prev);
    }
  }, [isHidden, showWidget]);

  useEffect(() => {
    handleAvatarClickRef.current = handleAvatarClickRef_current;
  }, [handleAvatarClickRef_current]);

  const handleAvatarMouseDown = useCallback(
    (e) => {
      // Geister-Mausevent kurz nach einem Tap ignorieren (siehe lastTouchRef).
      if (Date.now() - lastTouchRef.current < 700) return;
      e.preventDefault();
      if (dragStateRef.current.active) return;

      const currentPos = pos || getDefaultPos();
      dragStateRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - currentPos.x,
        offsetY: e.clientY - currentPos.y,
        moved: false,
      };

      const onMove = (ev) => {
        const ds = dragStateRef.current;
        if (!ds.active) return;

        const dx = Math.abs(ev.clientX - ds.startX);
        const dy = Math.abs(ev.clientY - ds.startY);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          ds.moved = true;
        }

        if (ds.moved) {
          const newPos = clampPos(ev.clientX - ds.offsetX, ev.clientY - ds.offsetY);
          setPos(newPos);
        }
      };

      const onUp = () => {
        const wasDrag = dragStateRef.current.moved;
        dragStateRef.current.active = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!wasDrag && handleAvatarClickRef.current) {
          handleAvatarClickRef.current();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [pos, setPos]
  );

  const handleAvatarTouchStart = useCallback(
    (e) => {
      lastTouchRef.current = Date.now();
      if (dragStateRef.current.active) return;
      const touch = e.touches[0];
      const currentPos = pos || getDefaultPos();
      dragStateRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        offsetX: touch.clientX - currentPos.x,
        offsetY: touch.clientY - currentPos.y,
        moved: false,
      };
    },
    [pos]
  );

  const handleAvatarTouchMove = useCallback((e) => {
    const touch = e.touches[0];
    const ds = dragStateRef.current;
    if (!ds.active) return;

    const dx = Math.abs(touch.clientX - ds.startX);
    const dy = Math.abs(touch.clientY - ds.startY);
    if (dx > DRAG_THRESHOLD_TOUCH || dy > DRAG_THRESHOLD_TOUCH) {
      ds.moved = true;
    }

    if (ds.moved) {
      const newPos = clampPos(touch.clientX - ds.offsetX, touch.clientY - ds.offsetY);
      setPos(newPos);
      e.preventDefault();
    }
  }, [setPos]);

  const handleAvatarTouchEnd = useCallback(() => {
    lastTouchRef.current = Date.now();
    const wasDrag = dragStateRef.current.moved;
    dragStateRef.current = { active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false };
    if (!wasDrag && handleAvatarClickRef.current) {
      handleAvatarClickRef.current();
    }
  }, []);

  // Chat message handler
  const handleSendMessage = useCallback(
    async (userMessage) => {
      const text = userMessage?.trim();
      if (!text || isLoadingRef.current) return;

      isLoadingRef.current = true;
      setIsLoading(true);
      const history = [...messagesRef.current, { role: 'user', content: text }];
      setMessages(history);
      setChatError(null);
      setIsNodding(true);

      // Satz-Queue: spricht die Antwort satzweise, sobald der erste Satz da ist
      // (spürbar "live"), statt erst nach der kompletten Antwort. Nur anlegen,
      // wenn die Stimme aktiv ist. `cancel()` im Fehlerfall bricht sie ab.
      let speechQueue = null;

      // Aktualisiert die (einzige) streamende Assistant-Bubble in-place bzw.
      // legt sie beim ersten Delta an.
      const upsertStreamingBubble = (visible) => {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            copy[copy.length - 1] = { ...last, content: visible };
          } else {
            copy.push({ role: 'assistant', content: visible, streaming: true });
          }
          return copy;
        });
      };

      // Ersetzt die streamende Bubble durch die finale, bereinigte Antwort
      // (bzw. legt sie an, falls kein Streaming lief – Fallback-Pfad).
      const finalizeAssistantBubble = (content) => {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            copy[copy.length - 1] = { role: 'assistant', content };
          } else if (content) {
            copy.push({ role: 'assistant', content });
          }
          return copy;
        });
      };

      try {
        let botMessage = '';
        let action = null;
        let streamed = false;

        if (buddyVoiceEnabled) speechQueue = createSpeechQueue({ rate: 1.0 });

        try {
          let raw = '';
          let spokenLen = 0;
          const result = await ai.chatStream(history, getStoredLocation(), {
            onDelta: (delta) => {
              if (!isMountedRef.current) return;
              raw += delta;
              const visible = stripActionMarker(raw);
              upsertStreamingBubble(visible);
              setIsTalking(true);
              // Nur den neu hinzugekommenen (bereinigten) Text nachschieben.
              if (speechQueue && visible.length > spokenLen) {
                speechQueue.push(visible.slice(spokenLen));
                spokenLen = visible.length;
              }
            },
          });
          streamed = true;
          botMessage = result.reply || result.message || stripActionMarker(raw);
          action = result.action || null;
        } catch (streamErr) {
          // Streaming nicht verfügbar (SSE ungeeignet, Netzfehler, 401) →
          // gepufferter Standard-Pfad. Die Satz-Queue bleibt aktiv und spricht
          // die Antwort trotzdem satzweise (schneller als ein einzelner Blob).
          if (!isMountedRef.current) { speechQueue?.cancel(); return; }
          console.warn('[Widget] Streaming nicht verfügbar, Fallback auf ai.chat:', streamErr?.message);
          const response = await ai.chat(history, getStoredLocation());
          botMessage = response.reply || response.message || '';
          action = response.action || null;
        }

        if (!isMountedRef.current) { speechQueue?.cancel(); return; }

        finalizeAssistantBubble(botMessage);
        if (botMessage) setIsTalking(true);

        const actionResult = await executeBuddyAction(action, {
          navigate,
          userLocation: getStoredLocation(),
        });

        if (!isMountedRef.current) { speechQueue?.cancel(); return; }

        const actionNote = actionResult?.message;
        if (actionNote) {
          setMessages((prev) => [...prev, { role: 'assistant', content: actionNote }]);
        }

        if (speechQueue) {
          // Beim Fallback-Pfad wurde noch nichts eingespeist → ganze Antwort jetzt.
          if (!streamed && botMessage) speechQueue.push(botMessage);
          if (actionNote) speechQueue.push(actionNote);
          speechQueue.flush();
        }
      } catch (err) {
        speechQueue?.cancel();
        console.error('Chat error:', err);

        if (!isMountedRef.current) return;

        const status = err?.status;
        // Der Server sendet manchmal aussagekräftige Fehlermeldungen als `error`, `reply` oder `message` in der Response
        const serverErrorMsg = err?.data?.error || err?.data?.reply || err?.data?.message;

        // Priorität: Server-Nachricht > Status-spezifische Nachricht > Offline-Fallback
        let botMessage = serverErrorMsg;
        let isOfflineError = false;

        if (!botMessage) {
          if (status === 429) {
            botMessage = 'Moment, ich brauche kurz eine Pause. Versuch es gleich nochmal.';
          } else if (status != null) {
            botMessage = 'Da ist gerade etwas schiefgelaufen. Versuch es gleich nochmal.';
          } else {
            // Reiner Netzwerkfehler (status == null)
            botMessage = findOfflineBuddyAnswer(text) || getOfflineBuddyFallback();
            isOfflineError = true;
          }
        }

        // Stelle sicher, dass botMessage ein String ist
        if (typeof botMessage !== 'string') {
          botMessage = String(botMessage || 'Ein unbekannter Fehler ist aufgetreten.');
        }

        // Nur echte HTTP-Fehler (mit Status) in den roten Alert, nicht Offline-Fallbacks
        if (status != null && !isOfflineError) {
          setChatError(botMessage);
        }

        setMessages((prev) => {
          const copy = [...prev];
          // Eine evtl. angefangene Streaming-Bubble verwerfen und durch die
          // Fehlermeldung ersetzen.
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant' && last.streaming) copy.pop();
          copy.push({ role: 'assistant', content: botMessage });
          return copy;
        });

        if (botMessage && status == null && buddyVoiceEnabled) {
          await speakWithFallback(botMessage, { voiceEnabled: buddyVoiceEnabled, rate: 1.0 });
        }
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
        setIsTalking(false);
        setIsNodding(false);
      }
    },
    [navigate, getStoredLocation, messagesRef, setMessages, buddyVoiceEnabled]
  );

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Bubble controls
  const handleCloseBubble = useCallback(() => {
    setIsOpen(false);
    hideWidget();
  }, [hideWidget]);

  const handleShowBubble = useCallback(() => {
    showWidget();
    setIsOpen(true);
  }, [showWidget]);

  // Klick/Tap auf die kleine Frage-Blase öffnet den vollen Chat.
  const handleSmallBubbleClick = useCallback(() => {
    if (smallBubbleTimerRef.current) clearTimeout(smallBubbleTimerRef.current);
    if (userActivityTimerRef.current) clearTimeout(userActivityTimerRef.current);
    setShowSmallBubble(false);
    showWidget();
    setIsOpen(true);
  }, [showWidget]);

  // Cleanup timers + laufende Sprachausgabe beim Unmount stoppen, damit der KI-Buddy
  // nach dem Weg-Navigieren nicht weiterredet.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (smallBubbleTimerRef.current) clearTimeout(smallBubbleTimerRef.current);
      if (userActivityTimerRef.current) clearTimeout(userActivityTimerRef.current);
      try { cancelElevenLabs(); } catch { /* ignore */ }
    };
  }, []);

  // Dynamic positioning
  const currentPos = pos || getDefaultPos();
  const isOnRight = currentPos.x + AVATAR_SIZE / 2 > (typeof window !== 'undefined' ? window.innerWidth / 2 : 200);
  const isOnBottom = currentPos.y + AVATAR_SIZE / 2 > (typeof window !== 'undefined' ? window.innerHeight / 2 : 400);

  const bubbleStyle = useMemo(() => ({
    position: 'absolute',
    ...(isOnBottom ? { bottom: AVATAR_SIZE + 12 } : { top: AVATAR_SIZE + 12 }),
    ...(isOnRight ? { right: 0 } : { left: 0 }),
  }), [isOnBottom, isOnRight]);

  const smallBubbleStyle = bubbleStyle;

  const bubbleVariants = useMemo(() => ({
    hidden: {
      opacity: 0,
      scale: 0.85,
      y: isOnBottom ? 20 : -20,
    },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: {
      opacity: 0,
      scale: 0.85,
      y: isOnBottom ? 20 : -20,
    },
  }), [isOnBottom]);

  const tailPosition = useMemo(() => (isOnBottom
    ? {
        className: `absolute -bottom-2 ${isOnRight ? 'right-6' : 'left-6'} w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-200`,
      }
    : {
        className: `absolute -top-2 ${isOnRight ? 'right-6' : 'left-6'} w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-blue-200`,
      }), [isOnBottom, isOnRight]);

  // Avatar-Animation: Endlos-Loops (repeat: Infinity) verursachen konstante
  // Repaints/Akku-Last. Bei prefers-reduced-motion komplett statisch halten.
  const avatarAnimate = useMemo(() => {
    if (prefersReducedMotion) return { scale: 1, y: 0 };
    return {
      scale: 1,
      y: [0, -4, 0],
    };
  }, [prefersReducedMotion]);

  const avatarTransition = useMemo(() => {
    if (prefersReducedMotion) return { duration: 0 };
    return {
      scale: { type: 'spring', stiffness: 300, damping: 12 },
      y: {
        duration: 3,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    };
  }, [prefersReducedMotion]);

  return (
    <>
      <div
        ref={widgetRef}
        className="fixed z-50"
        role="region"
        aria-label="KI-Buddy Chat Widget"
        style={{
          left: currentPos.x,
          top: currentPos.y,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
        }}
      >
        {/* Small Buddy Bubble */}
        <AnimatePresence>
          {!isHidden && showSmallBubble && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              className="bg-[rgba(12,30,45,0.96)] border-2 border-[rgba(0,229,255,0.35)] rounded-2xl px-4 py-3 shadow-lg max-w-xs whitespace-normal cursor-pointer hover:border-cyan-400 transition-colors backdrop-blur-md"
              style={smallBubbleStyle}
              role="button"
              tabIndex={0}
              aria-label="Chat mit dem KI-Buddy öffnen"
              onClick={handleSmallBubbleClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSmallBubbleClick();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-slate-200 leading-relaxed">{smallBubbleText}</p>
              <p className="text-xs text-cyan-400 mt-1">Tippen zum Chatten</p>
              <div className={`absolute ${isOnRight ? 'right-8' : 'left-8'} -bottom-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[rgba(0,229,255,0.35)]`} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Bubble */}
        <AnimatePresence>
          {!isHidden && isOpen && (
            <motion.div
              variants={bubbleVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-80 max-h-[420px] rounded-3xl shadow-2xl overflow-hidden flex flex-col bg-[#0c1e2d] border-2 border-[rgba(0,229,255,0.25)]"
              style={bubbleStyle}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[rgba(0,229,255,0.15)] bg-[rgba(0,229,255,0.05)]">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-cyan-400/40 bg-[#0a1929]">
                    <BuddyAvatar size={36} showHints={false} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">KI-Buddy</h2>
                    <p className="text-xs text-[#7a96ae]">Dein Angel-Buddy</p>
                  </div>
                </div>
                <button type="button"
                  onClick={handleCloseBubble}
                  className="p-1 hover:bg-[rgba(0,229,255,0.1)] rounded-full transition-colors flex-shrink-0"
                  aria-label="Chat schließen"
                  title="Chat schließen"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#080F16]" role="log" aria-live="polite" aria-label="Chat-Nachrichten">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-start justify-start h-full gap-3">
                    <div className="text-sm">
                      <p className="font-semibold text-slate-100 mb-1">{tip?.title || 'Hallo!'}</p>
                      <p className="text-xs text-[#7a96ae] leading-relaxed">{tip?.message || 'Wie kann ich dir helfen?'}</p>
                    </div>

                    {tip?.suggestions && tip.suggestions.length > 0 && (
                      <div className="w-full space-y-2">
                        <p className="text-xs font-semibold text-[#7a96ae] px-2">Fragen:</p>
                        {tip.suggestions.map((suggestion) => (
                          <button type="button"
                            key={suggestion}
                            onClick={() => handleSendMessage(suggestion)}
                            disabled={isLoading}
                            className="w-full text-left px-3 py-2 bg-[rgba(0,229,255,0.08)] hover:bg-[rgba(0,229,255,0.15)] disabled:bg-[rgba(255,255,255,0.03)] text-cyan-300 text-xs rounded-lg transition-colors truncate border border-[rgba(0,229,255,0.15)]"
                            aria-label={`Frage senden: ${suggestion}`}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg text-sm break-words ${
                          msg.role === 'user'
                            ? 'bg-cyan-600 text-white rounded-br-none'
                            : 'bg-[rgba(15,30,45,0.9)] text-slate-200 rounded-bl-none border border-[rgba(0,229,255,0.1)]'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[rgba(15,30,45,0.9)] px-4 py-3 rounded-lg border border-[rgba(0,229,255,0.1)]">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-100" />
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}

                {chatError && (
                  <div className="bg-[rgba(255,69,96,0.1)] border border-[rgba(255,69,96,0.4)] text-red-300 px-4 py-2 rounded-lg text-xs">
                    {chatError}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Section */}
              <ChatInput
                isLoading={isLoading}
                onSend={handleSendMessage}
              />

              {/* Bubble Tail */}
              <div {...tailPosition} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Draggable Avatar */}
        <motion.div
          className="relative cursor-grab active:cursor-grabbing select-none touch-none"
          onMouseDown={handleAvatarMouseDown}
          onTouchStart={handleAvatarTouchStart}
          onTouchMove={handleAvatarTouchMove}
          onTouchEnd={handleAvatarTouchEnd}
          whileHover={prefersReducedMotion ? undefined : { scale: 1.08 }}
          animate={avatarAnimate}
          transition={avatarTransition}
        >
          <div
            className="relative w-14 h-14 transition-all drop-shadow-lg"
          >
            <BuddyAvatar speaking={isTalking} size={56} />
          </div>
        </motion.div>
      </div>
    </>
  );
}
