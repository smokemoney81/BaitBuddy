// Selbstheilung für veraltete Chunk-Referenzen nach einem Deploy.
//
// Vite teilt die App in gehashte Chunks (React.lazy / dynamic import). Nach
// einem Deploy existieren die alten Dateinamen auf Vercel nicht mehr. Eine noch
// offene Sitzung (im Capacitor-WebView überlebt sie das Wiederöffnen/Resume)
// bekommt beim Nachladen dann einen 404 — lazy geladene Komponenten wie das
// KI-Buddy-Widget verschwinden bis zum manuellen Neuladen. Vite meldet jeden
// fehlgeschlagenen Chunk-Load als 'vite:preloadError'-Event: Darauf laden wir
// die Seite automatisch neu, damit die Sitzung die frischen Chunk-Namen zieht.
// Der Zeit-Guard verhindert Reload-Schleifen (z. B. Deploy kaputt) — nach einem
// fehlgeschlagenen Selbstheilungs-Versuch greift wieder die normale
// Fehlerbehandlung (ErrorBoundary zeigt den Ladefehler mit Reload-Button).
//
// Offline ist ein Reload das Falsche: Ohne Netz laesst sich kein frischer Chunk
// holen, und ein Neuladen riskiert eine leere App am Wasser. Dort greift
// stattdessen sofort die normale Fehlerbehandlung (ErrorBoundary).

const RELOAD_GUARD_KEY = 'bb_chunk_reload_at';
const RELOAD_MIN_INTERVAL_MS = 60000;

export function installChunkReloadHandler({
  reload = () => window.location.reload(),
  isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
} = {}) {
  const onPreloadError = (event) => {
    // Ohne Netz nicht neu laden — und den Fehler bewusst NICHT unterdruecken:
    // Vite loest das Import-Promise sonst mit `undefined` auf (der Helfer faengt
    // den Fehler und gibt nichts zurueck), woraus React.lazy einen
    // nichtssagenden Folgefehler macht. Durchgelassen erreicht die klare
    // Ladefehler-Meldung den ErrorBoundary.
    if (!isOnline()) return;

    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0;
    } catch { /* sessionStorage optional (Private Mode) */ }

    if (Date.now() - last < RELOAD_MIN_INTERVAL_MS) return;

    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch { /* sessionStorage optional (Private Mode) */ }

    // preventDefault unterdrückt das Werfen des Fehlers — die Seite wird ohnehin
    // sofort neu geladen, ein zusätzlicher Error-Screen würde nur flackern.
    event.preventDefault();
    reload();
  };

  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}
