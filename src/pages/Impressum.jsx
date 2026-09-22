import React from 'react';
import { Mail, AlertTriangle } from 'lucide-react';

// Steht auch im Text oben ("Angaben gemaess § 5 TMG") — hier einmal zentral,
// damit Anzeige und mailto-Link nicht auseinanderlaufen koennen.
const OPERATOR_EMAIL = 'S.s.Bedburg@gmail.com';

export default function Impressum() {

  return (
    <div className="bb-page max-w-4xl mx-auto">
      <div className="bb-card">
        <div className="text-xl font-bold mb-6" style={{ color: 'var(--bb-cyan)' }}>
          Impressum
        </div>
        <div className="text-gray-300">
          
          {/* Rechtlicher Hinweis */}
          <div className="mb-6 p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              <strong>Hinweis:</strong> Aus datenschutzrechtlichen Gründen wird unser vollständiges Impressum nur auf Anfrage bereitgestellt.
            </div>
          </div>

            <div className="space-y-6">
              <div className="prose prose-invert max-w-none">
                <h2 style={{ color: 'var(--bb-cyan)' }}>
                  Angaben gemäß § 5 TMG
                </h2>
                <p>
                  <strong>Betreiber:</strong> Sebastian Schorn<br />
                  <strong>E-Mail:</strong> {OPERATOR_EMAIL}
                </p>

                <p className="text-sm mt-4" style={{ color: 'var(--bb-muted)' }}>
                  Das vollständige Impressum mit postalischer Adresse erhalten Sie auf Anfrage per E-Mail.
                </p>
              </div>

              {/* Anfrage per E-Mail.
                  Hier stand zuvor ein Formular, das mit einem 1-Sekunden-Timeout
                  einen Versand simulierte und danach "Impressum wurde an Ihre
                  E-Mail-Adresse gesendet!" meldete — es wurde nie eine E-Mail
                  verschickt und die Anfrage erreichte den Betreiber nicht.
                  Der mailto-Link geht direkt an dieselbe Adresse, die oben
                  steht, und funktioniert ohne Konto und ohne Backend. */}
              <div className="rounded-xl p-6" style={{ background: 'rgba(0,0,0,.25)', border: '1px solid var(--bb-border)' }}>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Mail size={20} style={{ color: 'var(--bb-cyan)' }} />
                  Vollständiges Impressum anfordern
                </h3>

                <div className="space-y-4">
                  <p className="text-sm text-gray-300">
                    Schreiben Sie uns kurz – Sie erhalten das vollständige Impressum
                    mit postalischer Adresse per Antwort-E-Mail.
                  </p>

                  <a
                    href={`mailto:${OPERATOR_EMAIL}?subject=${encodeURIComponent('Anfrage: Vollständiges Impressum')}&body=${encodeURIComponent('Guten Tag,\n\nbitte senden Sie mir das vollständige Impressum mit postalischer Adresse.\n\nVielen Dank')}`}
                    className="bb-action w-full flex items-center justify-center gap-2"
                  >
                    <Mail size={16} />
                    E-Mail an {OPERATOR_EMAIL}
                  </a>

                  <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>
                    Der Link öffnet Ihr E-Mail-Programm mit vorbereitetem Text.
                    Es werden keine Daten an uns übertragen, bevor Sie selbst senden.
                  </p>
                </div>
              </div>

              {/* Weitere rechtliche Infos */}
              <div className="prose prose-invert max-w-none text-sm">
                <h2 style={{ color: 'var(--bb-cyan)' }}>
                  EU-Streitschlichtung
                </h2>
                <p>
                  Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: 
                  <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline"> https://ec.europa.eu/consumers/odr</a>
                </p>

                <h2 style={{ color: 'var(--bb-cyan)' }}>
                  Verbraucher­streit­beilegung
                </h2>
                <p>
                  Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
                </p>

                <h2 style={{ color: 'var(--bb-cyan)' }}>
                  Bildnachweise
                </h2>
                <p>
                  Die animierten Fische im App-Hintergrund sind freigestellte Fotos von
                  Wikimedia Commons. Karpfen: George Chernilevsky,{' '}
                  <a href="https://creativecommons.org/licenses/by-sa/3.0" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">CC BY-SA 3.0</a>;
                  Wels: Bernard Dupont,{' '}
                  <a href="https://creativecommons.org/licenses/by-sa/2.0" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">CC BY-SA 2.0</a>{' '}
                  (freigestellt und zugeschnitten; bearbeitete Bilder stehen unter derselben Lizenz).
                  Barsch, Forelle, Hecht und Zander: gemeinfrei (Public Domain).
                </p>
              </div>
            </div>

        </div>
      </div>
    </div>
  );
}