// Geräteweite Datenschutz-Schalter. Liegen bewusst lokal (localStorage) statt
// im Konto: Mikrofon, Kamera und Standort sind ebenfalls Geräte-Berechtigungen,
// und die Schalter gelten auch im Gastmodus.

const KEY = 'bb_privacy_prefs';

export const DEFAULT_PRIVACY_PREFS = {
  // Hands-free Buddy darf gestartet werden.
  handsFree: true,
  // Aktivierungswort "Hey Buddy" statt Antippen im Hands-free-Modus.
  wakeWord: true,
};

export function readPrivacyPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      handsFree: typeof raw.handsFree === 'boolean' ? raw.handsFree : DEFAULT_PRIVACY_PREFS.handsFree,
      wakeWord: typeof raw.wakeWord === 'boolean' ? raw.wakeWord : DEFAULT_PRIVACY_PREFS.wakeWord,
    };
  } catch {
    return { ...DEFAULT_PRIVACY_PREFS };
  }
}

export function writePrivacyPrefs(next) {
  const merged = { ...readPrivacyPrefs(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Speicher gesperrt (Private Mode): Schalter gilt nur für diese Sitzung.
  }
  return merged;
}

// Lokale Zwischenspeicher, die sich jederzeit neu laden lassen. Nicht dabei:
// Anmeldung, Einstellungen und alles, was noch nicht mit dem Server
// synchronisiert ist (Gast-Fänge, Offline-Fotos, Live-Trips, Audionotizen in
// der Warteschlange) — das zu löschen wäre Datenverlust.
const CACHE_DATABASES = ['BaitBuddy_AdvancedCache', 'baitbuddy_tiles', 'CatchGBT_MapTiles'];
const CACHE_STORAGE_KEYS = ['bb_offline_pack_meta', 'bb_offline_pack_data', 'bb_recent_pages'];

function deleteDatabase(name) {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      // Eine offene Verbindung in einem anderen Tab blockiert das Löschen; es
      // läuft dann weiter, sobald sie geschlossen wird.
      request.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function clearLocalCaches() {
  let removed = 0;
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      const results = await Promise.all(names.map(name => caches.delete(name)));
      removed += results.filter(Boolean).length;
    } catch {
      // CacheStorage nicht verfügbar.
    }
  }
  if (typeof indexedDB !== 'undefined') {
    const results = await Promise.all(CACHE_DATABASES.map(deleteDatabase));
    removed += results.filter(Boolean).length;
  }
  for (const key of CACHE_STORAGE_KEYS) {
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed += 1;
      }
    } catch {
      // ignore
    }
  }
  return removed;
}
