import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Fish, Sparkles } from 'lucide-react';
import { homePromptChips } from '@/lib/buddyPromptSuggestions';
import { trackFeatureClick } from '@/components/utils/tracker';
import WeatherGlyph from '@/components/home/WeatherGlyph';

/** Startet eine Frage direkt im KI-Buddy (dort sofort gestellt, nicht nur vorbefüllt). */
export function buddyAskUrl(question) {
  const params = new URLSearchParams({ mode: 'text', ask: '1', question });
  return `/KiBuddyBeta?${params.toString()}`;
}

function ChipIcon({ kind }) {
  if (kind === 'spots') return <MapPin size={22} strokeWidth={1.8} aria-hidden="true" />;
  if (kind === 'weather') return <WeatherGlyph code={2} size={26} />;
  if (kind === 'fish') return <Fish size={22} strokeWidth={1.8} aria-hidden="true" />;
  return <Sparkles size={22} strokeWidth={1.8} aria-hidden="true" />;
}

// Vier Schnellfragen der Startseite (Vorlage). Der Zielfisch kommt aus den
// Angel-Präferenzen, sonst aus der Saison (Herbst → Hecht).
export default function HomePromptChips({ targetSpecies }) {
  const navigate = useNavigate();
  const chips = useMemo(() => homePromptChips({ targetSpecies }), [targetSpecies]);

  return (
    <ul className="bb-home-chips" aria-label="Schnellfragen an den Buddy">
      {chips.map(chip => (
        <li key={chip.id}>
          <button
            type="button"
            className={`bb-home-chip is-${chip.id}`}
            onClick={() => {
              trackFeatureClick('KiBuddyBeta', { source: `dashboard_chip_${chip.id}` });
              navigate(buddyAskUrl(chip.question));
            }}
          >
            <ChipIcon kind={chip.icon} />
            <span>{chip.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
