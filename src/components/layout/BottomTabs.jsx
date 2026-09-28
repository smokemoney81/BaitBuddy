import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Map, BookOpen, Calendar, User } from 'lucide-react';
import { useNavigationContext } from '@/lib/NavigationContext';
import { useTool } from '@/hooks/useTool';
import { trackFeatureClick } from '@/components/utils/tracker';
import { useBuddyActivity } from '@/hooks/useBuddyActivity';
import { isVoiceSpeaking } from '@/lib/voiceActivity';
import { useVoiceSpeaking } from '@/hooks/useVoiceActivity';
import { isBuddyHapticEnabled } from '@/lib/buddyActivity';
import { cancelElevenLabs } from '@/components/utils/elevenLabsTTS';

const LONG_PRESS_MS = 3000;
const HAPTIC_1 = 1000;
const HAPTIC_2 = 2000;

const NAV_TABS = [
  { path: 'Map', icon: Map, label: 'Karte' },
  { path: 'Logbook', icon: BookOpen, label: 'Fangbuch' },
  null,
  { path: 'TripPlanner', icon: Calendar, label: 'Planer' },
  { path: 'Profile', icon: User, label: 'Profil' },
];

const ARIA_LABELS = {
  Map: 'Karte',
  Logbook: 'Fangbuch',
  TripPlanner: 'Trip-Planer',
  Profile: 'Profil',
};

function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

export default function BottomTabs() {
  const { switchTab, getTabStack } = useNavigationContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { getToolByRoute, isToolAccessible } = useTool();
  const activePage = location.pathname.split('/')[1] || 'Dashboard';
  const buddyActivity = useBuddyActivity();
  const voiceSpeaking = useVoiceSpeaking();
  const [toolPulse, setToolPulse] = useState(false);
  const toolPulseTimerRef = useRef(null);

  // Jede vom Buddy ausgeführte Tool-Aktion sendet zentral dieses Event.
  // Das mittlere Logo reagiert mit einem kurzen Bewegungs-/Glow-Impuls, ohne
  // dass jedes einzelne Tool eigene UI-Logik kennen muss.
  useEffect(() => {
    const pulse = () => {
      clearTimeout(toolPulseTimerRef.current);
      setToolPulse(false);
      requestAnimationFrame(() => {
        setToolPulse(true);
        toolPulseTimerRef.current = setTimeout(() => setToolPulse(false), 420);
      });
    };
    window.addEventListener('baitbuddy-tool-activity', pulse);
    return () => {
      window.removeEventListener('baitbuddy-tool-activity', pulse);
      clearTimeout(toolPulseTimerRef.current);
    };
  }, []);

  const pressTimerRef = useRef(null);
  const haptic1Ref = useRef(null);
  const haptic2Ref = useRef(null);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const progressFrameRef = useRef(null);
  const pressStartRef = useRef(0);
  const cancelledRef = useRef(false);
  const [showHint, setShowHint] = useState(false);

  const clearTimers = useCallback(() => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(haptic1Ref.current);
    clearTimeout(haptic2Ref.current);
    if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current);
    pressTimerRef.current = null;
    haptic1Ref.current = null;
    haptic2Ref.current = null;
    progressFrameRef.current = null;
    setLongPressProgress(0);
    pressStartRef.current = 0;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const animateProgress = useCallback(() => {
    if (!pressStartRef.current) return;
    const elapsed = Date.now() - pressStartRef.current;
    const p = Math.min(1, elapsed / LONG_PRESS_MS);
    setLongPressProgress(p);
    if (p < 1) {
      progressFrameRef.current = requestAnimationFrame(animateProgress);
    }
  }, []);

  const startLongPress = useCallback((e) => {
    if (voiceSpeaking) return;
    cancelledRef.current = false;
    pressStartRef.current = Date.now();
    animateProgress();

    if (isBuddyHapticEnabled()) {
      haptic1Ref.current = setTimeout(() => { if (!cancelledRef.current) vibrate(15); }, HAPTIC_1);
      haptic2Ref.current = setTimeout(() => { if (!cancelledRef.current) vibrate(15); }, HAPTIC_2);
    }

    pressTimerRef.current = setTimeout(() => {
      if (cancelledRef.current) return;
      if (isBuddyHapticEnabled()) vibrate(30);
      trackFeatureClick('KiBuddyBeta', { source: 'bottom_tabs_longpress_voice' });
      navigate('/KiBuddyBeta?voice=1');
      clearTimers();
    }, LONG_PRESS_MS);
  }, [voiceSpeaking, navigate, clearTimers, animateProgress]);

  const endLongPress = useCallback(() => {
    cancelledRef.current = true;
    const wasActive = !!pressStartRef.current;
    const elapsed = wasActive ? Date.now() - pressStartRef.current : 0;
    clearTimers();
    if (wasActive && elapsed < 300) {
      if (voiceSpeaking) {
        try { cancelElevenLabs(); } catch { /* ok */ }
        return;
      }
      trackFeatureClick('Dashboard', { source: 'bottom_tabs_buddy_tap' });
      navigate('/Dashboard');
    }
  }, [voiceSpeaking, navigate, clearTimers]);

  const cancelLongPress = useCallback(() => {
    cancelledRef.current = true;
    clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    try {
      if (localStorage.getItem('bb_buddy_longpress_hint')) return;
      setShowHint(true);
      const t = setTimeout(() => {
        setShowHint(false);
        try { localStorage.setItem('bb_buddy_longpress_hint', '1'); } catch { /* ok */ }
      }, 6000);
      return () => clearTimeout(t);
    } catch { /* ok */ }
  }, []);

  useEffect(() => {
    if (!isBuddyHapticEnabled() || buddyActivity === 'idle') return;
    const intervals = { listening: 4000, processing: 1500, speaking: 2500 };
    const ms = intervals[buddyActivity];
    if (!ms) return;
    const id = setInterval(() => {
      if (isBuddyHapticEnabled()) vibrate(buddyActivity === 'processing' ? 12 : 8);
    }, ms);
    return () => clearInterval(id);
  }, [buddyActivity]);

  const follow = (event, path) => {
    event.preventDefault();
    trackFeatureClick(path, { source: 'bottom_tabs' });
    switchTab(path);
    const stack = getTabStack(path);
    navigate(stack.length ? stack[stack.length - 1] : `/${path}`);
  };

  const renderLink = (item) => {
    if (!item) return null;
    const { path, icon: Icon, label } = item;
    const tool = getToolByRoute(`/${path}`);
    const accessible = tool ? isToolAccessible(tool.id) : true;
    const ariaLabel = ARIA_LABELS[path] || label;
    const isActive = activePage === path;

    if (!accessible) {
      return (
        <div
          key={path}
          role="tab"
          aria-label={ariaLabel}
          aria-disabled="true"
          className="bb-nav-item bb-nav-locked"
          title={`Freischalten: ${tool.requires || 'Premium'}`}
        >
          <Lock size={20} aria-hidden="true" />
          <span className="bb-nav-label">{label}</span>
        </div>
      );
    }

    return (
      <Link
        key={path}
        to={`/${path}`}
        onClick={e => follow(e, path)}
        role="tab"
        aria-label={ariaLabel}
        aria-selected={isActive}
        className={`bb-nav-item ${isActive ? 'bb-nav-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        <span className="bb-nav-label">{label}</span>
      </Link>
    );
  };

  const activityClass = buddyActivity !== 'idle' ? ` bb-fab-${buddyActivity}` : '';
  const speakingClass = voiceSpeaking ? ' bb-fab-speaking' : '';

  return (
    <nav className="bb-navbar bb-navbar-compact" role="tablist" aria-label="Hauptnavigation">
      <div className="bb-navbar-inner">
        {NAV_TABS.slice(0, 2).map(renderLink)}

        <div className="bb-fab-container bb-fab-compact">
          <button
            type="button"
            className={`bb-fab bb-fab-logo${activityClass}${speakingClass}${toolPulse ? ' bb-fab-tool-pulse' : ''}`}
            data-activity={buddyActivity}
            data-speaking={voiceSpeaking ? 'true' : undefined}
            data-tool-active={toolPulse ? 'true' : undefined}
            aria-label={voiceSpeaking ? 'Buddy-Sprache stoppen' : 'Home / Buddy Voice (3s halten)'}
            onPointerDown={startLongPress}
            onPointerUp={endLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onContextMenu={e => e.preventDefault()}
            style={toolPulse ? {
              transform: 'scale(1.1) rotate(3deg)',
              transition: 'transform 180ms cubic-bezier(.2,.8,.2,1)',
            } : undefined}
          >
            {longPressProgress > 0 && (
              <svg className="bb-fab-progress" viewBox="0 0 52 52" aria-hidden="true">
                <circle
                  cx="26" cy="26" r="24"
                  fill="none"
                  stroke="var(--bb-cyan)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - longPressProgress)}
                  transform="rotate(-90 26 26)"
                />
              </svg>
            )}
            <img
              src="/assets/buddy/fab-logo.webp"
              alt=""
              aria-hidden="true"
              draggable="false"
              width="48"
              height="48"
            />
          </button>
          {showHint && (
            <div className="bb-fab-hint" role="tooltip">
              3 Sek. halten = Voice
            </div>
          )}
        </div>

        {NAV_TABS.slice(3).map(renderLink)}
      </div>
    </nav>
  );
}
