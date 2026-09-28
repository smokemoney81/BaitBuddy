import { Link } from 'react-router-dom';
import { AudioLines, SlidersHorizontal } from 'lucide-react';

// Seiten, deren Kopfzeile statt des BaitBuddy-Logos den Seitentitel trägt —
// spart die eigene Überschriftenzeile, z. B. auf dem nicht scrollbaren
// Voice Buddy. `action` sitzt rechts vor dem Avatar.
export const PAGE_TOP_BARS = {
  KiBuddyBeta: {
    // Vorlage des Voice Buddys: helle Ringe um Zurück, Regler und Avatar.
    className: 'bb-topbar-voice',
    title: (
      <>
        <AudioLines size={22} aria-hidden="true" />
        Voice <span className="bb-title-accent">Buddy</span>
      </>
    ),
    action: (
      <Link className="bb-topbar-icon" to="/Settings?tab=buddy" aria-label="KI-Buddy einstellen">
        <SlidersHorizontal size={22} aria-hidden="true" />
      </Link>
    ),
  },
};
