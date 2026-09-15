import React, { lazy, useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { isOnline, onOnlineStatusChange } from '@/utils/networkStatus';

/**
 * Seiten werden per React.lazy als eigene Chunks geladen. Liegt ein Chunk
 * offline nicht im Cache, scheitert der dynamische import(): React.lazy reicht
 * die Rejection an den ErrorBoundary weiter, dessen allgemeiner Fehlerschirm
 * "Seite neu laden" anbietet — ohne Netz genau das, was nicht helfen kann.
 * Zusaetzlich meldet React den Fehler in der Entwicklung erneut als Uncaught
 * Exception, obwohl der ErrorBoundary ihn bereits behandelt hat.
 *
 * Statt zu scheitern loest der Loader hier mit einer echten Komponente auf, die
 * den Zustand benennt und einen Wiederholversuch anbietet, sobald das Netz
 * zurueck ist. Die uebrige App (Navigation, gecachte Seiten, Offline-Queue)
 * bleibt dabei bedienbar.
 */
function PageUnavailable() {
  const [online, setOnline] = useState(() => isOnline());

  useEffect(() => onOnlineStatusChange(setOnline), []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
      <WifiOff className="h-10 w-10 text-gray-500" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-base font-medium text-gray-200">Seite ist offline nicht verfügbar</p>
        <p className="max-w-sm text-sm text-gray-400">
          {online
            ? 'Die Seite konnte nicht geladen werden. Bitte versuche es erneut.'
            : 'Diese Seite wurde noch nicht heruntergeladen. Sobald du wieder Empfang hast, lässt sie sich öffnen.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        disabled={!online}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Erneut versuchen
      </button>
    </div>
  );
}

/**
 * Wie `React.lazy`, aber ohne unbehandelte Rejection bei fehlgeschlagenem
 * Chunk-Load. Ein einzelner Aussetzer wird einmal wiederholt.
 * @param {() => Promise<{default: React.ComponentType}>} load
 */
export function lazyPage(load) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      try {
        // Ein kurzer Aussetzer (Funkloch, abgebrochene Verbindung) — einmal
        // nachfassen, bevor die Ersatzanzeige greift.
        return await load();
      } catch {
        console.warn('Seiten-Chunk konnte nicht geladen werden:', error?.message || error);
        return { default: PageUnavailable };
      }
    }
  });
}

export { PageUnavailable };
