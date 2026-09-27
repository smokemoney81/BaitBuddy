// Live-Guthabenanzeige (Punkt 10): einfaches Pub-Sub, das nach jedem
// erfolgreichen kostenpflichtigen KI-Aufruf benachrichtigt, damit eine kleine
// Anzeige im Header/Bottom-Nav ihren Stand aktualisieren kann, ohne dafür ein
// Polling-Intervall zu brauchen. Die eigentliche Buchung bleibt serverseitig
// (aiTokenQuota.js) — dieser Bus liefert nur das "jetzt neu laden"-Signal.
const listeners = new Set();

export function notifyAiUsageChanged() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* ein fehlerhafter Listener darf andere nicht stoppen */ }
  });
}

export function subscribeAiUsageChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
