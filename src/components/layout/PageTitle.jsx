import React from 'react';

// Seitentitel der Vorlage: großer weißer Titel, letztes Wort in Cyan
// ("Gastdaten übernehmen", "Command Center"), darunter ein Untertitel.
// Zurück-Taste und Logo liefert die Kopfzeile im Layout.
export default function PageTitle({ title, subtitle, icon: Icon, iconColor, script, rightAction, className = '' }) {
  const words = String(title || '').trim().split(' ');
  const accent = words.length > 1 ? words.pop() : null;
  const lead = words.join(' ');

  return (
    <header className={`bb-page-title ${className}`}>
      <div className="bb-page-title-row">
        <div className="min-w-0 flex-1">
          <h1 className="bb-page-title-text">
            {Icon && <Icon size={30} aria-hidden="true" style={iconColor ? { color: iconColor } : undefined} className="bb-page-title-icon" />}
            <span>
              {lead}
              {accent && <> <span className="bb-title-accent">{accent}</span></>}
            </span>
          </h1>
          {subtitle && <p className="bb-page-title-sub">{subtitle}</p>}
        </div>
        {rightAction}
      </div>
      {script && <p className="bb-script bb-page-title-script" aria-hidden="true">{script}</p>}
    </header>
  );
}
