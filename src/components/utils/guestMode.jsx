// Gastmodus-Hilfsfunktionen
//
// Die lokal erfassten Gast-Datensätze (Fänge, Spots) liegen in
// `src/lib/guestStore.js` und werden beim Anmelden ins Konto übernommen.

import { clearGuestData } from '@/lib/guestStore';

// Seiten, die für Gäste GESPERRT sind (nur Admin-Seiten).
// Alle anderen Seiten sind für Gäste zugänglich — PremiumGuard
// übernimmt die Plan-basierte Zugriffskontrolle.
const GUEST_BLOCKED_PAGES = [
  'AdminUsers',
  'AdminTracking',
];

export function isGuestAllowedPage(pageName) {
  return !GUEST_BLOCKED_PAGES.includes(pageName);
}

// Gast-Session-Key
const GUEST_SESSION_KEY = 'catchgbt_guest_session';

export function getGuestSession() {
  try {
    const raw = sessionStorage.getItem(GUEST_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setGuestSession(data) {
  try {
    sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({
      ...data,
      startedAt: data.startedAt || new Date().toISOString()
    }));
  } catch {
    // ignore
  }
}

export function clearGuestSession() {
  try {
    sessionStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    // ignore
  }
  clearGuestData();
}
