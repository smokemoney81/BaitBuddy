import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Fish, MapPin, Calendar, Brain, Lock, Camera, Mic, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useNavigationContext } from '@/lib/NavigationContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { navigationItems } from '@/components/navigation/navigationItems';
import { useTool } from '@/hooks/useTool';
import { trackFeatureClick } from '@/components/utils/tracker';
import { BrandMark } from '@/components/layout/BrandLogo';
import { useVoiceSpeaking } from '@/hooks/useVoiceActivity';

// Gedrückt halten auf dem Logo-Button öffnet direkt den KI-Buddy-Chat.
const LONG_PRESS_MS = 500;
// Fingerbewegung (px), ab der das Halten als Scrollen/Wischen gilt.
const LONG_PRESS_MOVE_TOLERANCE = 12;

// Schnellaktionen im Logo-Menue. Bilder liegen als kleine WebP-Ausschnitte
// (je ~10 KB) unter public/assets/quick/. `page` = Route fuer die Plan-Pruefung.
const QUICK_ACTIONS = [
  { Icon: Camera, label: 'Fang erfassen', hint: 'Foto, Daten, Köder', image: '/assets/quick/catch.webp', tone: 'cyan', event: 'openCatchDialog' },
  { Icon: Calendar, label: 'Ausflug planen', hint: 'Spots, Wetter, Zeitfenster', image: '/assets/quick/trip.webp', tone: 'green', page: 'TripPlanner', to: '/TripPlanner?new=1' },
  { Icon: Brain, label: 'KI-Buddy', hint: 'Fragen, Analysen, Tipps', image: '/assets/quick/buddy.webp', tone: 'cyan', page: 'KiBuddyBeta', to: '/KiBuddyBeta' },
  { Icon: MapPin, label: 'Spot speichern', hint: 'Position, Notizen, Bilder', image: '/assets/quick/spot.webp', tone: 'orange', page: 'Map', to: '/Map?addSpot=1' },
  { Icon: Mic, label: 'Voice Buddy', hint: 'Sprechen statt tippen', image: '/assets/quick/voice.webp', tone: 'cyan', page: 'KiBuddyBeta', to: '/KiBuddyBeta?voice=1' },
  { Icon: Fish, label: 'Fangbuch', hint: 'Alle Fänge, Statistiken, Erfolge', image: '/assets/quick/logbook.webp', tone: 'green', page: 'Logbook', to: '/Logbook' },
];

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

export default function BottomTabs() {
  const { navigation } = useBuddyPreferences();
  const { switchTab, getTabStack } = useNavigationContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { getToolByRoute, isToolAccessible } = useTool();
  const activePage = location.pathname.split('/')[1] || 'Dashboard';
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const longPressFired = useRef(false);

  const cancelPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  };

  useEffect(() => cancelPress, []);

  const openBuddyChat = () => {
    const tool = getToolByRoute('/KiBuddyBeta');
    if (tool && !isToolAccessible(tool.id)) return false;
    try { navigator.vibrate?.(30); } catch { /* nicht unterstützt */ }
    trackFeatureClick('KiBuddyBeta', { source: 'bottom_tabs_long_press' });
    setOpen(false);
    navigate('/KiBuddyBeta');
    return true;
  };

  const handlePressStart = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    longPressFired.current = false;
    pressStart.current = { x: event.clientX, y: event.clientY };
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      longPressFired.current = openBuddyChat();
    }, LONG_PRESS_MS);
  };

  const handlePressMove = event => {
    if (!pressStart.current) return;
    const dx = event.clientX - pressStart.current.x;
    const dy = event.clientY - pressStart.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) cancelPress();
  };

  const handleFabClick = () => {
    // Der Klick nach einem ausgelösten Halten darf das Menü nicht öffnen.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    setOpen(true);
  };

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
    // toolRegistry liefert das Icon nur als Namen (String) — Komponente und
    // Label kommen deshalb aus navigationItems.
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
          <Lock size={26} aria-hidden="true" />
          <span>{name}</span>
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
        {Icon && <Icon size={26} strokeWidth={1.8} aria-hidden="true" />}
        <span>{name}</span>
      </Link>
    );
  };

  const split = Math.ceil(navigation.length / 2);
  const voiceSpeaking = useVoiceSpeaking();

  return (
    <>
      <nav className="bb-navbar" role="tablist" aria-label="Hauptnavigation">
        <div className="bb-navbar-inner">
          {navigation.slice(0, split).map(renderLink)}

          <div className="bb-fab-container">
            <button
              type="button"
              className={`bb-fab bb-fab-logo${voiceSpeaking ? ' bb-fab-speaking' : ''}`}
              data-speaking={voiceSpeaking ? 'true' : undefined}
              aria-label="Schnellaktionen öffnen"
              title="Tippen: Schnellaktionen · Halten: KI-Buddy-Chat"
              onClick={handleFabClick}
              onPointerDown={handlePressStart}
              onPointerMove={handlePressMove}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={e => e.preventDefault()}
            >
              <img
                src="/assets/buddy/fab-logo.webp"
                alt=""
                aria-hidden="true"
                draggable="false"
                width="64"
                height="64"
              />
            </button>
          </div>

          {navigation.slice(split).map(renderLink)}
        </div>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="bb-quick-sheet">
          <div className="bb-quick-sheet-handle" aria-hidden="true" />
          <div className="bb-quick-sheet-brand" aria-hidden="true">
            <BrandMark size={40} />
            <span className="bb-brand-text">
              <span className="bb-brand-word">
                Bait<span className="bb-title-accent">Buddy</span>
              </span>
              <span className="bb-brand-tagline">Mehr als Angeln</span>
            </span>
          </div>
          <SheetHeader className="text-center sm:text-center space-y-1">
            <SheetTitle className="bb-quick-sheet-title">
              Was möchtest du <span className="bb-title-accent">machen?</span>
            </SheetTitle>
            <SheetDescription className="bb-quick-sheet-subtitle">
              Dein nächster Schritt am Wasser.
            </SheetDescription>
          </SheetHeader>
          <div className="bb-quick-sheet-divider" aria-hidden="true" />
          <div className="bb-quick-sheet-grid">
            {QUICK_ACTIONS.map(action => {
              const { Icon, label, hint, image, tone } = action;
              const tool = action.page ? getToolByRoute(`/${action.page}`) : null;
              const accessible = tool ? isToolAccessible(tool.id) : true;
              const body = (
                <>
                  <span className="bb-quick-tile-media" aria-hidden="true">
                    <img src={image} alt="" loading="lazy" decoding="async" draggable="false" />
                  </span>
                  <span className={`bb-quick-tile-icon bb-tone-${accessible ? tone : 'muted'}`} aria-hidden="true">
                    {accessible ? <Icon size={22} /> : <Lock size={22} />}
                  </span>
                  <span className="bb-quick-tile-text">
                    <span className="bb-quick-tile-label">{label}</span>
                    <span className="bb-quick-tile-hint">
                      {accessible ? hint : `Freischalten über ${tool?.requires || 'Premium'}`}
                    </span>
                  </span>
                  {accessible && (
                    <span className="bb-quick-tile-go" aria-hidden="true">
                      <ChevronRight size={18} />
                    </span>
                  )}
                </>
              );

              if (!accessible) {
                return (
                  <div key={label} className="bb-quick-tile is-locked" aria-disabled="true">
                    {body}
                  </div>
                );
              }
              if (action.event) {
                return (
                  <button
                    key={label}
                    type="button"
                    className="bb-quick-tile"
                    onClick={() => {
                      setOpen(false);
                      window.dispatchEvent(new CustomEvent(action.event));
                    }}
                  >
                    {body}
                  </button>
                );
              }
              return (
                <Link key={label} className="bb-quick-tile" to={action.to} onClick={() => setOpen(false)}>
                  {body}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
