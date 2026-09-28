import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useNavigationContext } from '@/lib/NavigationContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { navigationItems } from '@/components/navigation/navigationItems';
import { useTool } from '@/hooks/useTool';
import { useBuddyActivity } from '@/hooks/useBuddyActivity';
import { trackFeatureClick } from '@/components/utils/tracker';
import { cancelElevenLabs } from '@/components/utils/elevenLabsTTS';
import { isBuddyHapticEnabled } from '@/lib/buddyActivity';
import { useVoiceSpeaking } from '@/hooks/useVoiceActivity';

const LONG_PRESS_MS = 3000;
const HAPTIC_1_MS = 1000;
const HAPTIC_2_MS = 2000;

const ARIA_LABELS = {
  Dashboard: 'Dashboard',
  Logbook: 'Logbook',
  Weather: 'Weather',
  Community: 'Community',
  Map: 'Map',
  KiBuddyBeta: 'AI Buddy',
  TripPlanner: 'Trip Planner',
  Gear: 'Gear',
  Profile: 'Profile',
  PremiumPlans: 'Premium',
  Settings: 'Settings',
};

const BUDDY_PAGES = new Set(['KiBuddyBeta', 'VoiceChat', 'HandsFreeBuddy']);

function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

export default function BottomTabs() {
  const { navigation } = useBuddyPreferences();
  const { switchTab, getTabStack } = useNavigationContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { getToolByRoute, isToolAccessible } = useTool();
  const activePage = location.pathname.split('/')[1] || 'Dashboard';
  const buddyActivity = useBuddyActivity();
  const voiceSpeaking = useVoiceSpeaking();
  const [toolPulse, setToolPulse] = useState(false);
  const toolPulseTimerRef = useRef(null);

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

  const openBuddyChat = useCallback(() => {
    const tool = getToolByRoute('/KiBuddyBeta');
    if (tool && !isToolAccessible(tool.id)) return;
    if (isBuddyHapticEnabled()) vibrate(30);
    trackFeatureClick('KiBuddyBeta', { source: 'bottom_tabs_buddy' });
    navigate('/KiBuddyBeta');
  }, [getToolByRoute, isToolAccessible, navigate]);

  const pressTimerRef = useRef(null);
  const haptic1Ref = useRef(null);
  const haptic2Ref = useRef(null);
  const progressFrameRef = useRef(null);
  const pressStartRef = useRef(0);
  const longPressTriggeredRef = useRef(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [showHint, setShowHint] = useState(false);

  const clearPressTimers = useCallback(() => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(haptic1Ref.current);
    clearTimeout(haptic2Ref.current);
    if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current);
    pressTimerRef.current = null;
    haptic1Ref.current = null;
    haptic2Ref.current = null;
    progressFrameRef.current = null;
    pressStartRef.current = 0;
    setLongPressProgress(0);
  }, []);

  useEffect(() => () => clearPressTimers(), [clearPressTimers]);

  const animateProgress = useCallback(() => {
    if (!pressStartRef.current) return;
    const elapsed = Date.now() - pressStartRef.current;
    const progress = Math.min(1, elapsed / LONG_PRESS_MS);
    setLongPressProgress(progress);
    if (progress < 1) progressFrameRef.current = requestAnimationFrame(animateProgress);
  }, []);

  const startLongPress = useCallback(() => {
    if (voiceSpeaking) return;
    longPressTriggeredRef.current = false;
    pressStartRef.current = Date.now();
    animateProgress();

    if (isBuddyHapticEnabled()) {
      haptic1Ref.current = setTimeout(() => vibrate(15), HAPTIC_1_MS);
      haptic2Ref.current = setTimeout(() => vibrate(15), HAPTIC_2_MS);
    }

    pressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (isBuddyHapticEnabled()) vibrate(30);
      trackFeatureClick('KiBuddyBeta', { source: 'bottom_tabs_longpress_voice' });
      navigate('/KiBuddyBeta?voice=1');
      clearPressTimers();
    }, LONG_PRESS_MS);
  }, [voiceSpeaking, animateProgress, navigate, clearPressTimers]);

  const endLongPress = useCallback(() => {
    if (voiceSpeaking) {
      clearPressTimers();
      try { cancelElevenLabs(); } catch { /* no-op */ }
      return;
    }

    const triggered = longPressTriggeredRef.current;
    clearPressTimers();
    if (!triggered) openBuddyChat();
    longPressTriggeredRef.current = false;
  }, [voiceSpeaking, clearPressTimers, openBuddyChat]);

  const cancelLongPress = useCallback(() => {
    longPressTriggeredRef.current = false;
    clearPressTimers();
  }, [clearPressTimers]);

  useEffect(() => {
    try {
      if (localStorage.getItem('bb_buddy_longpress_hint')) return;
      setShowHint(true);
      const timer = setTimeout(() => {
        setShowHint(false);
        try { localStorage.setItem('bb_buddy_longpress_hint', '1'); } catch { /* no-op */ }
      }, 6000);
      return () => clearTimeout(timer);
    } catch { /* no-op */ }
  }, []);

  useEffect(() => {
    if (!isBuddyHapticEnabled() || buddyActivity === 'idle') return;
    const intervalByState = { listening: 4000, processing: 1500, speaking: 2500 };
    const interval = intervalByState[buddyActivity];
    if (!interval) return;

    const id = setInterval(() => {
      if (isBuddyHapticEnabled()) vibrate(buddyActivity === 'processing' ? 12 : 8);
    }, interval);
    return () => clearInterval(id);
  }, [buddyActivity]);

  const follow = (event, path) => {
    event.preventDefault();
    trackFeatureClick(path, { source: 'bottom_tabs' });
    switchTab(path);
    const stack = getTabStack(path);
    navigate(stack.length ? stack[stack.length - 1] : `/${path}`);
  };

  const renderLink = path => {
    const tool = getToolByRoute(`/${path}`);
    const accessible = tool ? isToolAccessible(tool.id) : true;
    const Icon = navigationItems[path]?.icon;
    const name = navigationItems[path]?.name || tool?.name || path;
    const ariaLabel = ARIA_LABELS[path] || name;
    const isActive = activePage === path;

    if (!accessible) {
      return (
        <div
          key={path}
          role="tab"
          aria-label={ariaLabel}
          aria-disabled="true"
          className="bb-nav-item bb-nav-locked"
          title={`Freischalten über ${tool.requires || 'Premium'}`}
        >
          <Lock size={24} aria-hidden="true" />
          <span className="bb-nav-label">{name}</span>
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
        title={name}
      >
        {Icon && <Icon size={26} strokeWidth={1.7} aria-hidden="true" />}
        <span className="bb-nav-label">{name}</span>
      </Link>
    );
  };

  const split = Math.ceil(navigation.length / 2);
  const buddyActive = BUDDY_PAGES.has(activePage);
  const activityClass = buddyActivity !== 'idle' ? ` bb-fab-${buddyActivity}` : '';

  return (
    <nav className="bb-navbar" role="tablist" aria-label="Hauptnavigation">
      <div className="bb-navbar-inner">
        {navigation.slice(0, split).map(renderLink)}

        <div className={`bb-fab-container${buddyActive ? ' bb-nav-active' : ''}`}>
          <button
            type="button"
            className={`bb-fab bb-fab-logo${activityClass}${voiceSpeaking ? ' bb-fab-speaking' : ''}${toolPulse ? ' bb-fab-tool-pulse' : ''}`}
            data-activity={buddyActivity}
            data-speaking={voiceSpeaking ? 'true' : undefined}
            data-tool-active={toolPulse ? 'true' : undefined}
            aria-label={voiceSpeaking ? 'Buddy-Sprache stoppen' : 'KI-Buddy öffnen; 3 Sekunden halten für Voice'}
            title={voiceSpeaking ? 'Sprache stoppen' : 'KI-Buddy öffnen · 3 Sek. halten für Voice'}
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
              <svg className="bb-fab-progress" viewBox="0 0 68 68" aria-hidden="true">
                <circle
                  cx="34"
                  cy="34"
                  r="31"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 31}
                  strokeDashoffset={2 * Math.PI * 31 * (1 - longPressProgress)}
                  transform="rotate(-90 34 34)"
                />
              </svg>
            )}
            <img
              src="/assets/buddy/buddy-icon.webp"
              alt=""
              aria-hidden="true"
              draggable="false"
              width="64"
              height="64"
            />
          </button>
          <span className="bb-nav-label" aria-hidden="true">{navigationItems.KiBuddyBeta.name}</span>
          {showHint && <div className="bb-fab-hint" role="tooltip">3 Sek. halten = Voice</div>}
        </div>

        {navigation.slice(split).map(renderLink)}
      </div>
    </nav>
  );
}
