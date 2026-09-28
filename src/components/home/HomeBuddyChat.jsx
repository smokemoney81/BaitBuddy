import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck } from 'lucide-react';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { currentHomeGreeting, formatHomeGreeting, greetingName } from '@/lib/buddyGreetings';
import { readRecentBuddyChat } from '@/lib/buddyRecentChat';

const formatTime = at => (at ? new Date(at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null);

function BuddyBubble({ text, at, avatar, name }) {
  const time = formatTime(at);
  return (
    <li className="bb-home-msg is-buddy">
      <img className="bb-home-msg-avatar" src={avatar} alt="" aria-hidden="true" width="40" height="40" />
      <Link to="/KiBuddyBeta" className="bb-home-bubble" aria-label={`${name}: ${text}. Gespräch fortsetzen`}>
        <span className="bb-home-bubble-text">{text.replace(/([.!?])\s+/g, '$1\n')}</span>
        {time && <span className="bb-home-bubble-meta"><time>{time}</time></span>}
      </Link>
    </li>
  );
}

function UserBubble({ text, at }) {
  const time = formatTime(at);
  return (
    <li className="bb-home-msg is-user">
      <Link to="/KiBuddyBeta" className="bb-home-bubble" aria-label={`Du: ${text}. Gespräch fortsetzen`}>
        <span className="bb-home-bubble-text">{text}</span>
        {time && (
          <span className="bb-home-bubble-meta">
            <time>{time}</time>
            <CheckCheck size={15} aria-hidden="true" />
          </span>
        )}
      </Link>
    </li>
  );
}

// Gesprächsverlauf der Startseite (Vorlage): Begrüßung des Buddys mit Namen,
// darunter die letzte eigene Frage und die Antwort des Buddys — echte Daten
// aus dem letzten Gespräch im KI-Buddy (buddyRecentChat), sonst nur die
// Begrüßung. Tippen führt ins Gespräch.
export default function HomeBuddyChat({ user }) {
  const { activeBuddy, userId } = useBuddyPreferences();
  const [greeting] = useState(() => currentHomeGreeting());
  // Chronologisch wie in der Vorlage: Begrüßung, Frage, Antwort. Liegt das
  // letzte Gespräch vor der Begrüßung (später zurückgekommen), steht es davor.
  const items = useMemo(() => {
    const greetingItem = { role: 'greeting', text: null, at: greeting.at };
    return [greetingItem, ...readRecentBuddyChat(userId)]
      .map((item, index) => ({ ...item, index }))
      .sort((a, b) => ((a.at ?? 0) - (b.at ?? 0)) || (a.index - b.index));
  }, [userId, greeting.at]);
  const avatar = activeBuddy?.avatar || '/assets/buddy/buddy-icon.webp';
  const buddyName = activeBuddy?.name || 'Buddy';

  return (
    <ol className="bb-home-chat" aria-label={`Unterhaltung mit ${buddyName}`}>
      {items.map(item => {
        if (item.role === 'greeting') {
          return <BuddyBubble key="greeting" text={formatHomeGreeting(greetingName(user), greeting.line)} at={greeting.at} avatar={avatar} name={buddyName} />;
        }
        return item.role === 'user'
          ? <UserBubble key={`u-${item.index}`} text={item.text} at={item.at} />
          : <BuddyBubble key={`a-${item.index}`} text={item.text} at={item.at} avatar={avatar} name={buddyName} />;
      })}
    </ol>
  );
}
