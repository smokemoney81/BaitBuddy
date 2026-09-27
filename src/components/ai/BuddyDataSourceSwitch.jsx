import React from 'react';
import { Sparkles, Database } from 'lucide-react';

const OPTIONS = [
  { id: 'auto', label: 'Auto', hint: 'Wissen zuerst, KI bei Bedarf' },
  { id: 'database', label: 'Wissen', hint: 'Kein KI-Volumen' },
  { id: 'model', label: 'KI-Modell', hint: 'Verbraucht KI-Volumen' },
];

// Punkt 8: Nutzer entscheidet, ob der Buddy möglichst aus der vorhandenen
// Wissensbasis antwortet (kein/kaum Guthabenverbrauch) oder immer eine echte
// Modellanfrage stellt. Der aktive Modus muss deutlich erkennbar sein.
export default function BuddyDataSourceSwitch({ value, onChange }) {
  const active = OPTIONS.find(o => o.id === value) || OPTIONS[0];
  return (
    <div className="bb-buddy-source-switch" role="radiogroup" aria-label="Datenquelle des Buddys">
      {OPTIONS.map(option => {
        const Icon = option.id === 'model' ? Sparkles : Database;
        const isActive = option.id === active.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`bb-buddy-source-tab${isActive ? ' is-active' : ''}`}
            onClick={() => onChange(option.id)}
            title={option.hint}
          >
            {option.id !== 'auto' && <Icon size={13} aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
