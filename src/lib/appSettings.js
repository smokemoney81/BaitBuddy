// Globale Schalter aus dem Admin-Bereich (GET /api/app/settings, öffentlich):
//   ads_enabled     — Werbung an/aus
//   all_tools_free  — alle Tools für alle freigeschaltet
// Einmal pro App-Start geladen. Schaltet der Superuser um, meldet Admin.jsx den
// neuen Stand per Event, damit sein eigenes Gerät nicht neu laden muss.
// Fehler → Standardwerte (Werbung an, nichts gratis), nie umgekehrt.
import { api } from '@/api/frontendClient';

export const DEFAULT_APP_SETTINGS = Object.freeze({ ads_enabled: true, all_tools_free: false });
export const APP_SETTINGS_EVENT = 'app-settings-updated';

function normalize(value) {
  return {
    ads_enabled: value?.ads_enabled !== false,
    all_tools_free: value?.all_tools_free === true,
  };
}

let pending = null;

export function loadAppSettings() {
  if (!pending) {
    pending = api.get('/api/app/settings')
      .then(normalize)
      .catch(() => {
        pending = null; // beim nächsten Aufruf erneut versuchen
        return { ...DEFAULT_APP_SETTINGS };
      });
  }
  return pending;
}

export function publishAppSettings(value) {
  const next = normalize(value);
  pending = Promise.resolve(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APP_SETTINGS_EVENT, { detail: next }));
  }
  return next;
}

// Nur für Tests.
export function _resetAppSettings() {
  pending = null;
}
