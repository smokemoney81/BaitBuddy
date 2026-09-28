import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, User as UserIcon } from 'lucide-react';
import { useHaptic } from '@/components/utils/HapticFeedback';
import { useSound } from '@/components/utils/SoundManager';
import EventTimer from '@/components/header/EventTimer';
import BrandLogo from '@/components/layout/BrandLogo';
import AiCreditBadge from '@/components/premium/AiCreditBadge';

function initialsOf(user) {
  const name = user?.nickname || user?.full_name;
  if (!name) return null;
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function AvatarContent({ user }) {
  const src = user?.profile_picture_url || user?.avatar_url;
  const initials = initialsOf(user);
  return (
    <>
      {src ? (
        <img src={src} alt="" />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <UserIcon size={22} aria-hidden="true" />
      )}
      {user && <i className="bb-online-dot" aria-hidden="true" />}
    </>
  );
}

export function AvatarCircle({ user }) {
  return (
    <span className="bb-topbar-avatar bb-avatar-lg" aria-hidden="true">
      <AvatarContent user={user} />
    </span>
  );
}

export function TopBarAvatar({ user, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bb-topbar-avatar"
      aria-label="Command Center öffnen"
    >
      <AvatarContent user={user} />
    </button>
  );
}

// Kopfzeile der Vorlage: kein fester Balken, sondern Teil des Hero-Bereichs.
// Hauptseiten: Logo links, Glocke + Avatar rechts.
// Unterseiten: runde Zurück-Taste links, Logo mittig, Avatar rechts.
// `title` ersetzt auf Unterseiten das Logo durch den Seitentitel, `action`
// ergänzt rechts eine Seitenaktion (siehe pageTopBars.jsx). Die
// Event-Countdown-Zeile erscheint nur mit `showEventTimer` (Dashboard).
export default function AppTopBar({ isRoot, user, isDemo, onOpenCommandCenter, title = null, action = null, className = '', showEventTimer = false }) {
  const navigate = useNavigate();
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();

  const openCommandCenter = () => {
    triggerHaptic('selection');
    playSound('click');
    onOpenCommandCenter();
  };

  const goBack = () => {
    triggerHaptic('light');
    playSound('click');
    if (window.history.length > 1) navigate(-1);
    else navigate('/Dashboard');
  };

  const right = (
    <div className="bb-topbar-right">
      {isDemo && <span className="bb-header-badge" style={{ '--badge-bg': 'rgba(245,158,11,.20)', '--badge-color': '#fbbf24' }}>DEMO</span>}
      {user && <AiCreditBadge user={user} />}
      {isRoot && (
        <Link to="/NotificationCenter" className="bb-topbar-icon" aria-label="Benachrichtigungen">
          <Bell size={24} aria-hidden="true" />
        </Link>
      )}
      {action}
      <TopBarAvatar user={user} onClick={openCommandCenter} />
    </div>
  );

  if (isRoot) {
    return (
      <header className="bb-topbar bb-topbar-root">
        <BrandLogo size="lg" align="left" withMark={false} />
        {right}
        {showEventTimer && <EventTimer />}
      </header>
    );
  }

  return (
    <header className={`bb-topbar${title ? ' bb-topbar-titled' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" onClick={goBack} className="bb-round-btn" aria-label="Zurück">
        <ChevronLeft size={26} aria-hidden="true" />
      </button>
      {title ? <h1 className="bb-topbar-title">{title}</h1> : <BrandLogo size="md" align="center" />}
      {right}
      {showEventTimer && <EventTimer />}
    </header>
  );
}
