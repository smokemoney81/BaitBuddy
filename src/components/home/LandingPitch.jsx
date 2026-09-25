import React from 'react';
import { Map as MapIcon, Compass, Fish, Share } from 'lucide-react';

// Icon-Leiste mit Slogan unter dem Hero-Bild des Startbildschirms
// (Karte, Spots, Fangbuch, Teilen — "Planen. Entdecken. Fangen. Teilen.").
const FEATURES = [
  { icon: MapIcon, label: 'Planen' },
  { icon: Compass, label: 'Entdecken' },
  { icon: Fish, label: 'Fangen' },
  { icon: Share, label: 'Teilen' },
];

export default function LandingPitch() {
  return (
    <div className="bb-landing-pitch">
      <ul className="bb-landing-features" aria-hidden="true">
        {FEATURES.map(({ icon: Icon, label }) => (
          <li key={label}><Icon size={34} strokeWidth={1.7} /></li>
        ))}
      </ul>
      <p className="bb-landing-tagline">{FEATURES.map((f) => `${f.label}.`).join(' ')}</p>
    </div>
  );
}
