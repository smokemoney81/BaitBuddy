// Clerk als zusätzlicher Anmeldeweg auf der Login-Seite.
//
// Angeboten wird er nur, wenn beide Seiten eingerichtet sind: der Publishable
// Key im Build (VITE_CLERK_PUBLISHABLE_KEY) UND der Secret Key am Backend
// (GET /api/auth/clerk/config). Fehlt der Server-Teil, würde der Nutzer sich
// sonst erst bei Clerk anmelden und danach mit einem Fehler zurückkommen.
import { auth } from '@/api/auth';

export function clerkPublishableKey() {
  return String(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
}

let availability = null;

export function isClerkLoginAvailable() {
  if (!clerkPublishableKey()) return Promise.resolve(false);
  if (!availability) {
    availability = auth.clerkConfig()
      .then((res) => res?.enabled === true)
      .catch(() => {
        // Nicht zwischenspeichern: offline/Fehler soll beim nächsten Öffnen neu prüfen.
        availability = null;
        return false;
      });
  }
  return availability;
}

// Die eingebettete Clerk-Anmeldung routet per URL-Hash (#/factor-one,
// #/sso-callback …). Kommt die Seite mit so einem Hash zurück (z. B. nach
// Google über Clerk), muss die Login-Seite direkt die Clerk-Ansicht öffnen.
export function isClerkHashRoute(hash) {
  return typeof hash === 'string' && hash.startsWith('#/');
}

// Nur für Tests.
export function _resetClerkAvailability() {
  availability = null;
}
