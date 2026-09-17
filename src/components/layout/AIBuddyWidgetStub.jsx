import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BUDDY_AVATAR_SIZE, BUDDY_TIMEOUTS, BUDDY_STORAGE_KEYS } from '@/lib/buddyStorageKeys';
import { getQuestionForPage, getPageNameFromPathname } from '@/lib/buddyTips';
import { buildGreeting, getVariedPageBubble, shouldGreet, markGreeted } from '@/lib/buddyGreetings';
import { speakWithFallback } from '@/components/utils/elevenLabsTTS';
import { runWhenAudioReady } from '@/lib/audioUnlock';
import { useAuth } from '@/lib/AuthContext';
import { events } from '@/api/frontendClient';
import BuddyAvatar from '@/components/ai/BuddyAvatar';

const AVATAR_SIZE = BUDDY_AVATAR_SIZE;

// Das vollständige Widget (framer-motion-Chat, TTS, ai-Client, Offline-Wissen)
// wird erst bei der ersten Interaktion als eigener Chunk nachgeladen. So bleibt
// der initiale Layout-Chunk klein (App-Start-Budget < 3 Sek.).
const AIBuddyWidget = lazy(() => import('@/components/layout/AIBuddyWidget'));

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

export default function AIBuddyWidgetStub() {
  const location = useLocation();
  const { user } = useAuth();
  const [widgetLoaded, setWidgetLoaded] = useState(false);

  // Zeitstempel des letzten Taps auf den Stub-Avatar. Wird an das nachgeladene
  // Widget durchgereicht, damit dessen Geister-Mausevent-Guard den Tap kennt,
  // der den Chunk geladen hat — sonst würde der vom Browser synthetisierte
  // Kompatibilitäts-Mausklick den frisch geöffneten Chat sofort wieder schließen.
  const lastTouchRef = useRef(0);

  // Seitenspezifische Frage-Blase: Meldet sich bei jedem Öffnen einer Seite,
  // solange nur der Stub gemountet ist. Ohne diese Logik hier erschiene die
  // Frage nie, denn das volle Widget (das sie ebenfalls kann) wird erst nach
  // dem ersten Klick geladen.
  const [bubbleText, setBubbleText] = useState('');
  const [showBubble, setShowBubble] = useState(false);
  const bubbleTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  // Merkt sich, für welche Seite die Frage zuletzt gezeigt wurde: verhindert,
  // dass Effekt-Neuläufe ohne Seitenwechsel dieselbe Blase erneut aufpoppen.
  const lastQuestionPageRef = useRef(null);

  const currentPage = getPageNameFromPathname(location.pathname);

  // Klick auf Avatar oder Frage-Blase: Widget-Chunk laden UND den Chat direkt
  // öffnen (initialOpen). Vorher lud der erste Klick nur den Chunk nach, der
  // Chat blieb zu — für den Nutzer sah das aus, als würde nichts passieren.
  const loadWidgetOpen = useCallback(() => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowBubble(false);
    setWidgetLoaded(true);
  }, []);

  // Voice-Setting-Check (localStorage). Fehlertolerant: Default ist „an".
  const voiceEnabled = useCallback(() => {
    try {
      return localStorage.getItem(BUDDY_STORAGE_KEYS.VOICE_ENABLED) !== 'false';
    } catch {
      return true;
    }
  }, []);

  // Spricht einen Text — aber erst, wenn Audio erlaubt ist. Beim App-Start hat
  // der Nutzer die Seite noch nicht berührt; die Autoplay-Policy blockiert dann
  // jede Wiedergabe. runWhenAudioReady stellt die Ausgabe zurück, bis der Nutzer
  // das erste Mal tippt, und spielt sie dann nach. Gesprochen wird ausschließlich
  // die natürliche ElevenLabs-Stimme; bei Fehlern bleibt die Blase stumm.
  const speakBubble = useCallback((text) => {
    if (!text || !voiceEnabled()) return;
    runWhenAudioReady(() => {
      speakWithFallback(text, { voiceEnabled: true, rate: 1.0 });
    });
  }, [voiceEnabled]);

  // Zeigt die Blase (Begrüßung oder Seiten-Frage) und spricht sie. Zentrale
  // Stelle für Seitenwechsel UND Foreground-Resume. `cancelledRef` bricht ab,
  // wenn zwischenzeitlich das Widget geladen oder neu präsentiert wurde.
  const presentBubble = useCallback(async (cancelledRef) => {
    try {
      if (localStorage.getItem(BUDDY_STORAGE_KEYS.WIDGET_HIDDEN) === 'true') return;
    } catch {
      return;
    }

    const greeting = shouldGreet();
    let text;

    if (greeting) {
      markGreeted();
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
      if (cancelledRef?.cancelled) return;
      text = buildGreeting({ event: activeEvent, rank });
    } else {
      // Nach der Begrüßung variiert die Seiten-Blase (Seitenfrage / Buddy-Frage
      // / Funktions-Tipp), damit sie sich nicht eintönig anfühlt.
      text = getVariedPageBubble(getQuestionForPage(currentPage));
    }

    setBubbleText(text);
    setShowBubble(true);
    speakBubble(text);

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowBubble(false);
    }, BUDDY_TIMEOUTS.SMALL_BUBBLE);
  }, [currentPage, user, speakBubble]);

  // Seitenwechsel: nach kurzer Verzögerung (Übergang abgeschlossen) Blase zeigen.
  useEffect(() => {
    if (widgetLoaded) return undefined;
    if (lastQuestionPageRef.current === currentPage) return undefined;

    const cancelledRef = { cancelled: false };
    bubbleTimerRef.current = setTimeout(() => {
      lastQuestionPageRef.current = currentPage;
      presentBubble(cancelledRef);
    }, 800);

    return () => {
      cancelledRef.cancelled = true;
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [currentPage, widgetLoaded, presentBubble]);

  // Foreground-Resume: Kommt die App aus dem Hintergrund zurück (im
  // Capacitor-WebView ein visibilitychange, KEIN Neuladen), begrüßt der Buddy
  // erneut — sofern der Cooldown abgelaufen ist. So klappt „jedes Mal begrüßen"
  // auch dort, wo die Sitzung das Wiederöffnen überlebt.
  useEffect(() => {
    if (widgetLoaded) return undefined;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!shouldGreet()) return;
      const cancelledRef = { cancelled: false };
      presentBubble(cancelledRef);
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [widgetLoaded, presentBubble]);

  // Cleanup der Hide-Timer beim Unmount.
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  if (!widgetLoaded) {
    return (
      <SimpleAvatar
        onClickAvatar={loadWidgetOpen}
        lastTouchRef={lastTouchRef}
        bubbleText={bubbleText}
        showBubble={showBubble}
        onBubbleClick={loadWidgetOpen}
      />
    );
  }

  // Solange der Widget-Chunk lädt, bleibt der Avatar sichtbar (kein Flackern).
  return (
    <Suspense
      fallback={
        <SimpleAvatar
          onClickAvatar={loadWidgetOpen}
          lastTouchRef={lastTouchRef}
          bubbleText={bubbleText}
          showBubble={false}
          onBubbleClick={loadWidgetOpen}
        />
      }
    >
      <AIBuddyWidget initialOpen initialLastTouch={lastTouchRef.current} />
    </Suspense>
  );
}

function SimpleAvatar({ onClickAvatar, lastTouchRef, bubbleText, showBubble, onBubbleClick }) {
  const prefersReducedMotion = useReducedMotion();
  const [pos, setPos] = useState(() => {
    try {
      const stored = localStorage.getItem(BUDDY_STORAGE_KEYS.WIDGET_POSITION);
      if (stored) {
        // Gespeicherte Position stammt evtl. von einem groesseren Screen
        // (Rotation, anderes Geraet) — ohne Clamping laege der Avatar
        // ausserhalb des Viewports und waere unerreichbar.
        const parsed = JSON.parse(stored);
        return clampPos(parsed?.x || 0, parsed?.y || 0);
      }
      return getDefaultPos();
    } catch {
      return getDefaultPos();
    }
  });

  React.useEffect(() => {
    const handleResize = () => {
      setPos((prev) => clampPos(prev?.x || 0, prev?.y || 0));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const dragStateRef = React.useRef({
    active: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    moved: false,
  });

  const handleMouseDown = React.useCallback(
    (e) => {
      // Siehe AIBuddyWidget: verhindert, dass die vom Browser nach einem Tap
      // synthetisierten Geister-Mausevents den Klick ein zweites Mal auslösen.
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
        if (dx > BUDDY_TIMEOUTS.DRAG_THRESHOLD || dy > BUDDY_TIMEOUTS.DRAG_THRESHOLD) {
          ds.moved = true;
        }

        if (ds.moved) {
          const newPos = clampPos(ev.clientX - ds.offsetX, ev.clientY - ds.offsetY);
          setPos(newPos);
          try {
            localStorage.setItem(BUDDY_STORAGE_KEYS.WIDGET_POSITION, JSON.stringify(newPos));
          } catch {}
        }
      };

      const onUp = () => {
        const wasDrag = dragStateRef.current.moved;
        dragStateRef.current.active = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!wasDrag) {
          onClickAvatar();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [pos, onClickAvatar, lastTouchRef]
  );

  const handleTouchStart = React.useCallback(
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
    [pos, lastTouchRef]
  );

  const handleTouchMove = React.useCallback((e) => {
    const touch = e.touches[0];
    const ds = dragStateRef.current;
    if (!ds.active) return;

    const dx = Math.abs(touch.clientX - ds.startX);
    const dy = Math.abs(touch.clientY - ds.startY);
    if (dx > BUDDY_TIMEOUTS.DRAG_THRESHOLD || dy > BUDDY_TIMEOUTS.DRAG_THRESHOLD) {
      ds.moved = true;
    }

    if (ds.moved) {
      const newPos = clampPos(touch.clientX - ds.offsetX, touch.clientY - ds.offsetY);
      setPos(newPos);
      try {
        localStorage.setItem(BUDDY_STORAGE_KEYS.WIDGET_POSITION, JSON.stringify(newPos));
      } catch {}
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = React.useCallback(() => {
    lastTouchRef.current = Date.now();
    const wasDrag = dragStateRef.current.moved;
    dragStateRef.current = { active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false };
    if (!wasDrag) {
      onClickAvatar();
    }
  }, [onClickAvatar, lastTouchRef]);

  const currentPos = pos || getDefaultPos();
  const isOnRight = currentPos.x + AVATAR_SIZE / 2 > (typeof window !== 'undefined' ? window.innerWidth / 2 : 200);
  const isOnBottom = currentPos.y + AVATAR_SIZE / 2 > (typeof window !== 'undefined' ? window.innerHeight / 2 : 400);

  const bubbleStyle = {
    position: 'absolute',
    ...(isOnBottom ? { bottom: AVATAR_SIZE + 12 } : { top: AVATAR_SIZE + 12 }),
    ...(isOnRight ? { right: 0 } : { left: 0 }),
  };

  return (
    <div
      className="fixed z-50"
      style={{
        left: currentPos.x,
        top: currentPos.y,
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
      }}
    >
      <AnimatePresence>
        {showBubble && bubbleText && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            className="bg-[rgba(12,30,45,0.96)] border-2 border-[rgba(0,229,255,0.35)] rounded-2xl px-4 py-3 shadow-lg max-w-xs whitespace-normal cursor-pointer hover:border-cyan-400 transition-colors backdrop-blur-md"
            style={bubbleStyle}
            role="button"
            tabIndex={0}
            aria-label="Chat mit dem KI-Buddy öffnen"
            onClick={onBubbleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onBubbleClick();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-200 leading-relaxed">{bubbleText}</p>
            <p className="text-xs text-cyan-400 mt-1">Tippen zum Chatten</p>
            <div className={`absolute ${isOnRight ? 'right-8' : 'left-8'} -bottom-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[rgba(0,229,255,0.35)]`} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="relative cursor-grab active:cursor-grabbing select-none touch-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.08 }}
        animate={prefersReducedMotion ? { y: 0 } : { y: [0, -4, 0] }}
        transition={prefersReducedMotion ? { duration: 0 } : {
          y: {
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      >
        <div className="relative w-14 h-14 drop-shadow-lg">
          <BuddyAvatar size={56} />
        </div>
      </motion.div>
    </div>
  );
}
