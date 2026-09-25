import { Link } from 'react-router-dom';
import { AudioLines, Settings2 } from 'lucide-react';

// Seiten, deren Kopfzeile statt des BaitBuddy-Logos den Seitentitel trägt —
// spart die eigene Überschriftenzeile, z. B. auf dem nicht scrollbaren
// Voice Buddy. `action` sitzt rechts vor dem Avatar. `hideEventTimer` lässt
// die Event-Countdown-Zeile weg (Voice Buddy: jede Zeile Höhe zählt).
export const PAGE_TOP_BARS = {
  KiBuddyBeta: {
    title: (
      <>
        <AudioLines size={22} aria-hidden="true" />
        Voice <span className="bb-title-accent">Buddy</span>
      </>
    ),
    action: (
      <Link className="bb-topbar-icon" to="/Settings?tab=buddy" aria-label="KI-Buddy einstellen">
        <Settings2 size={22} aria-hidden="true" />
      </Link>
    ),
    hideEventTimer: true,
  },
};
