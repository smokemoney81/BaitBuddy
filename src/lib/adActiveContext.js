// Minimales Pub-Sub-Register für aktive Ad-Blocking-Kontexte (siehe
// AD_BLACKLIST_CONTEXTS in adEntitlements.js). Screens mit einer laufenden,
// nicht unterbrechbaren Session (Bisserkennung/Drill, Kamera-Analyse,
// Sprachausgabe, Checkout …) melden sich hier an/ab; AdGate liest daraus, ob
// gerade Werbung angezeigt werden darf — unabhängig von der aktuellen Route.
const activeContexts = new Set();
const listeners = new Set();

function notify() {
  const snapshot = Array.from(activeContexts);
  listeners.forEach((listener) => listener(snapshot));
}

export function setAdContextActive(context, active) {
  if (!context) return;
  const hadIt = activeContexts.has(context);
  if (active) {
    if (hadIt) return;
    activeContexts.add(context);
  } else {
    if (!hadIt) return;
    activeContexts.delete(context);
  }
  notify();
}

export function getActiveAdContexts() {
  return Array.from(activeContexts);
}

export function subscribeAdContexts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
