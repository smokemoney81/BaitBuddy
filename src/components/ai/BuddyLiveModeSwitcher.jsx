import React from 'react';
import { MessageSquare, Phone, Radio } from 'lucide-react';

const MODES = [
  { id: 'text', label: 'Chat', icon: MessageSquare },
  { id: 'live', label: 'Live', icon: Phone },
  { id: 'handsfree', label: 'Hands-free', icon: Radio },
];

// Umschalter für "Buddy Live": Textchat/Voice, echtes Live-Gespräch (WebRTC)
// und Hands-free (Trip-Begleiter) teilen sich einen Screen und denselben
// Gesprächsverlauf — hier wird nur die Ansicht gewechselt, keine neue Sitzung.
export default function BuddyLiveModeSwitcher({ mode, onChange }) {
  return (
    <div className="bb-buddy-mode-switch" role="tablist" aria-label="Buddy-Modus">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          className={`bb-buddy-mode-tab${mode === id ? ' is-active' : ''}`}
          onClick={() => onChange(id)}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
