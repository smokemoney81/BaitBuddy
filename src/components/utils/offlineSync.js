/**
 * Offline-Sync-System
 * Speichert Fänge offline wenn kein Empfang, synchronisiert später
 */

import { isOnline as checkIsOnline, onOnlineStatusChange } from '@/utils/networkStatus';
import { entities, api } from '@/api/frontendClient';
import {
  getUnsyncdOfflinePhotos,
  markPhotoAsSynced,
  markPhotoSyncError,
  cleanupSyncedPhotos,
} from '@/utils/offlinePhotoStorage';

// Re-export for convenience
export const isOnline = checkIsOnline;

const QUEUE_KEYS = {
  catches: 'bb_offline_catch_queue',
  notes: 'bb_offline_notes_queue',
  pendingSync: 'bb_pending_sync',
  catchIdMap: 'bb_offline_catch_id_map',
};

// Ein offline erfasster Fang traegt nur eine lokale Pseudo-ID (`offline_…`); die
// echte ID vergibt der Server erst beim Sync. Offline gespeicherte Fotos zeigen
// auf diese Pseudo-ID — ohne Uebersetzungstabelle ginge die Verknuepfung
// Fang↔Foto beim Upload verloren (der Server kennt `offline_…` nicht). Die Map
// liegt in localStorage, weil zwischen Fang-Sync und Foto-Sync ein App-Neustart
// liegen kann.
const MAX_ID_MAP_SIZE = 500;

const OFFLINE_ID_PREFIX = 'offline_';

export function isOfflineCatchId(catchId) {
  return typeof catchId === 'string' && catchId.startsWith(OFFLINE_ID_PREFIX);
}

export function getOfflineCatchIdMap() {
  try {
    const raw = localStorage.getItem(QUEUE_KEYS.catchIdMap);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveOfflineCatchIdMap(map) {
  try {
    const keys = Object.keys(map);
    if (keys.length === 0) {
      localStorage.removeItem(QUEUE_KEYS.catchIdMap);
      return;
    }
    // Aelteste Zuordnungen zuerst verwerfen (Objekt-Schluessel behalten ihre
    // Einfuegereihenfolge), damit die Map nicht unbegrenzt waechst.
    const kept = keys.length > MAX_ID_MAP_SIZE ? keys.slice(keys.length - MAX_ID_MAP_SIZE) : keys;
    localStorage.setItem(
      QUEUE_KEYS.catchIdMap,
      JSON.stringify(Object.fromEntries(kept.map((k) => [k, map[k]]))),
    );
  } catch (e) {
    console.error('Fehler beim Speichern der Offline-ID-Zuordnung:', e);
  }
}

export function clearOfflineCatchIdMap() {
  try {
    localStorage.removeItem(QUEUE_KEYS.catchIdMap);
  } catch (e) {
    console.error('Fehler beim Löschen der Offline-ID-Zuordnung:', e);
  }
}

// Deckelt die Offline-Queue, damit sie bei dauerhaft fehlschlagendem Sync
// (z.B. abgelaufenes Token) nicht unbegrenzt in localStorage waechst.
const MAX_QUEUE_SIZE = 200;

// ─── Catch Queue Management ───────────────────────────────────────────────────

export function addToOfflineCatchQueue(catchData) {
  try {
    const queue = getOfflineCatchQueue();
    if (queue.length >= MAX_QUEUE_SIZE) {
      throw new Error(`Offline-Queue ist voll (max. ${MAX_QUEUE_SIZE} Fänge) — bitte zuerst synchronisieren`);
    }
    const withMeta = {
      ...catchData,
      __id: `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      __created: new Date().toISOString(),
      __synced: false,
    };
    queue.push(withMeta);
    localStorage.setItem(QUEUE_KEYS.catches, JSON.stringify(queue));
    return withMeta;
  } catch (e) {
    console.error('Fehler beim Hinzufügen zur Offline-Queue:', e);
    throw e;
  }
}

export function getOfflineCatchQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEYS.catches);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearOfflineCatchQueue() {
  try {
    localStorage.removeItem(QUEUE_KEYS.catches);
  } catch (e) {
    console.error('Fehler beim Löschen der Queue:', e);
  }
}

export function removeFromOfflineCatchQueue(offlineId) {
  try {
    const queue = getOfflineCatchQueue();
    const filtered = queue.filter(c => c.__id !== offlineId);
    localStorage.setItem(QUEUE_KEYS.catches, JSON.stringify(filtered));
  } catch (e) {
    console.error('Fehler beim Entfernen aus Queue:', e);
  }
}

export async function syncOfflineCatches() {
  if (!checkIsOnline()) {
    console.log('Offline — Sync verpasst');
    return { synced: 0, failed: 0, errors: [] };
  }
  if (!api.getToken()) {
    // Kein Token (noch nicht eingeloggt / abgelaufen) — ein Sync-Versuch wuerde
    // nur mit 401s fehlschlagen. initAutoSync() lief bisher direkt beim
    // App-Start, unabhaengig davon, ob der Auth-Check schon abgeschlossen war.
    console.log('Kein Auth-Token — Sync verschoben');
    return { synced: 0, failed: 0, errors: [] };
  }

  const queue = getOfflineCatchQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, errors: [] };

  console.log(`Synchronisiere ${queue.length} offline erfasste Fänge...`);

  let synced = 0;
  let failed = 0;
  const errors = [];
  const syncedIds = new Set();
  const idMap = getOfflineCatchIdMap();

  for (const catchData of queue) {
    try {
      const { __id, __created, __synced, ...realData } = catchData;
      const result = await entities.Catch.create(realData);
      console.log(`Fang ${__id} synchronisiert:`, result.id);
      syncedIds.add(__id);
      // Server-ID merken, damit der nachgelagerte Foto-Sync die Verknuepfung
      // Fang↔Foto auf die echte ID umschreiben kann.
      if (result?.id) idMap[__id] = result.id;
      synced++;
    } catch (e) {
      console.error(`Fehler beim Sync von ${catchData.__id}:`, e);
      errors.push({ id: catchData.__id, error: e.message });
      failed++;
    }
  }

  // Queue nur EINMAL am Ende neu schreiben, statt pro Item die gesamte Queue neu
  // zu lesen und zu serialisieren (das war O(n²)). Frisch re-lesen, damit während
  // des Syncs offline hinzugekommene Fänge nicht verloren gehen.
  if (syncedIds.size > 0) {
    try {
      const remaining = getOfflineCatchQueue().filter(c => !syncedIds.has(c.__id));
      if (remaining.length > 0) {
        localStorage.setItem(QUEUE_KEYS.catches, JSON.stringify(remaining));
      } else {
        localStorage.removeItem(QUEUE_KEYS.catches);
      }
    } catch (e) {
      console.error('Fehler beim Aktualisieren der Offline-Queue nach Sync:', e);
    }
  }

  if (syncedIds.size > 0) saveOfflineCatchIdMap(idMap);

  if (synced > 0) {
    console.log(`Erfolgreich synchronisiert: ${synced} Fänge`);
  }
  if (failed > 0) {
    console.warn(`Sync fehlgeschlagen: ${failed} Fänge`);
  }

  return { synced, failed, errors, idMap };
}

// ─── Smart Create: Online POST, Offline Queue ──────────────────────────────

export async function createCatchWithOfflineSupport(catchData) {
  if (checkIsOnline()) {
    return entities.Catch.create(catchData);
  } else {
    console.log('Offline — Fang wird lokal gespeichert und später synchronisiert');
    return addToOfflineCatchQueue(catchData);
  }
}

// ─── Offline Notes (Audio Recordings) ──────────────────────────────────────────

export function addToOfflineNotesQueue(noteData) {
  try {
    const queue = getOfflineNotesQueue();
    const withMeta = {
      ...noteData,
      __id: `note_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      __created: new Date().toISOString(),
    };
    queue.push(withMeta);
    localStorage.setItem(QUEUE_KEYS.notes, JSON.stringify(queue));
    return withMeta;
  } catch (e) {
    console.error('Fehler beim Hinzufügen von Notiz:', e);
    throw e;
  }
}

export function getOfflineNotesQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEYS.notes);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function removeFromOfflineNotesQueue(noteId) {
  try {
    const queue = getOfflineNotesQueue();
    const filtered = queue.filter(n => n.__id !== noteId);
    localStorage.setItem(QUEUE_KEYS.notes, JSON.stringify(filtered));
  } catch (e) {
    console.error('Fehler beim Entfernen der Notiz:', e);
  }
}

// ─── Auto-Sync bei Online-Status-Änderung ─────────────────────────────────────

let syncUnsubscribe = null;
let planUpdatedListener = null;

// Fänge zuerst, Fotos danach — und bewusst NICHT parallel: der Foto-Sync
// uebersetzt die lokale Pseudo-ID des Fangs in dessen Server-ID und kann das
// erst, wenn der Fang-Sync diese Zuordnung geschrieben hat. Liefen beide
// gleichzeitig, landete das Foto ohne Verknuepfung auf dem Server.
export async function syncOfflineData() {
  const catches = await syncOfflineCatches();
  const photos = await syncOfflinePhotos();
  return { catches, photos };
}

export function initAutoSync() {
  if (syncUnsubscribe) return;

  syncUnsubscribe = onOnlineStatusChange(async (online) => {
    if (online) {
      console.log('Online — Starte Synchronisierung...');
      await new Promise(r => setTimeout(r, 1000));
      await syncOfflineData();
    }
  });

  // initAutoSync() läuft beim App-Start, bevor der Auth-Check abgeschlossen
  // ist — zu diesem Zeitpunkt ist meist noch kein Token vorhanden (siehe
  // Token-Guard in syncOfflineCatches). Nach einem Login/Register feuert
  // frontendClient.js ein 'plan-updated'-Event — das ist der zuverlässige
  // Zeitpunkt, um die Queue nachzuholen.
  if (typeof window !== 'undefined') {
    planUpdatedListener = async () => {
      await syncOfflineData();
    };
    window.addEventListener('plan-updated', planUpdatedListener);
  }

  if (checkIsOnline()) {
    syncOfflineData();
  }
}

export function stopAutoSync() {
  if (syncUnsubscribe) {
    syncUnsubscribe();
    syncUnsubscribe = null;
  }
  if (planUpdatedListener && typeof window !== 'undefined') {
    window.removeEventListener('plan-updated', planUpdatedListener);
    planUpdatedListener = null;
  }
}

// ─── Offline Queue Status ──────────────────────────────────────────────────────

export function getOfflineQueueStatus() {
  const catches = getOfflineCatchQueue();
  const notes = getOfflineNotesQueue();
  return {
    pendingCatches: catches.length,
    pendingNotes: notes.length,
    total: catches.length + notes.length,
    isOnline: isOnline(),
  };
}

// ─── Offline Photos (IndexedDB) ────────────────────────────────────────────────

// ArrayBuffer → Base64, in Blöcken, damit große Fotos nicht am Argument-Limit
// von String.fromCharCode (Callstack) scheitern.
function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Uebersetzt die am Foto hinterlegte Fang-ID in die ID, unter der der Fang auf
// dem Server liegt. Drei Faelle:
//   - echte Server-ID (online erfasster Fang)  → direkt verwenden
//   - Pseudo-ID mit bekannter Zuordnung        → auf die Server-ID umschreiben
//   - Pseudo-ID ohne Zuordnung                 → der Fang wartet selbst noch in
//     der Queue: zurueckstellen. Steht er nicht mehr in der Queue, kommt er auch
//     nicht mehr — dann das Foto lieber unverknuepft hochladen als verlieren.
function resolveSyncedCatchId(catchId, idMap, pendingOfflineIds) {
  if (!catchId) return { catchId: null, defer: false };
  if (!isOfflineCatchId(catchId)) return { catchId, defer: false };

  const serverId = idMap[catchId];
  if (serverId) return { catchId: serverId, defer: false };
  if (pendingOfflineIds.has(catchId)) return { catchId: null, defer: true };
  return { catchId: null, defer: false };
}

export async function syncOfflinePhotos() {
  if (!checkIsOnline()) {
    console.log('Offline — Foto-Sync verpasst');
    return { synced: 0, failed: 0, deferred: 0, errors: [] };
  }

  if (!api.getToken()) {
    console.log('Kein Auth-Token — Foto-Sync verschoben');
    return { synced: 0, failed: 0, deferred: 0, errors: [] };
  }

  try {
    const photos = await getUnsyncdOfflinePhotos();
    if (photos.length === 0) {
      return { synced: 0, failed: 0, deferred: 0, errors: [] };
    }

    console.log(`Synchronisiere ${photos.length} offline Fotos...`);

    let synced = 0;
    let failed = 0;
    let deferred = 0;
    const errors = [];
    const idMap = getOfflineCatchIdMap();
    const pendingOfflineIds = new Set(getOfflineCatchQueue().map((c) => c.__id));

    for (const photo of photos) {
      const resolved = resolveSyncedCatchId(photo.catchId, idMap, pendingOfflineIds);
      if (resolved.defer) {
        // Der zugehoerige Fang ist noch nicht auf dem Server. Das Foto bleibt
        // ungesynct in IndexedDB und wird beim naechsten Lauf erneut versucht —
        // kein Fehler, damit die Warteschlangen-Anzeige nicht faelschlich
        // Probleme meldet.
        console.log(`Foto ${photo.id} zurückgestellt — Fang ${photo.catchId} noch nicht synchronisiert`);
        deferred++;
        continue;
      }

      try {
        // Upload als Base64-JSON an den existierenden Backend-Endpunkt
        // /api/files/upload. Der frühere Code schickte ein File-Objekt per
        // JSON.stringify (wird zu {}) an das nicht existente /api/storage/upload —
        // der Foto-Sync konnte dadurch nie erfolgreich sein.
        const file_base64 = arrayBufferToBase64(photo.fileData);
        // Backend lehnt Dateinamen mit Pfadanteilen ab (Path-Traversal-Schutz).
        const file_name = String(photo.fileName || `offline_${photo.id}.jpg`).split(/[\\/]/).pop();

        const uploadResult = await api.post('/api/files/upload', {
          file_base64,
          file_name,
          file_type: photo.mimeType || 'image/jpeg',
        });

        if (uploadResult?.file_url) {
          await markPhotoAsSynced(photo.id);

          // Wenn das Foto mit einem Fang verlinkt ist, aktualisiere den Fang mit der photo_url
          if (resolved.catchId) {
            try {
              await entities.Catch.update(resolved.catchId, { photo_url: uploadResult.file_url });
              console.log(`Catch ${resolved.catchId} mit Foto-URL aktualisiert: ${uploadResult.file_url}`);
            } catch (updateError) {
              console.warn(`Fehler beim Aktualisieren von Catch ${resolved.catchId} mit Foto-URL:`, updateError);
              // Nicht kritisch — Foto ist hochgeladen, nur die Verlinkung fehlgeschlagen
            }
          }

          console.log(`Foto ${photo.id} synchronisiert: ${uploadResult.file_url}`);
          synced++;
        } else {
          throw new Error('Keine Upload-URL erhalten');
        }
      } catch (e) {
        console.error(`Fehler beim Sync von Foto ${photo.id}:`, e);
        await markPhotoSyncError(photo.id, e.message);
        errors.push({ id: photo.id, error: e.message });
        failed++;
      }
    }

    if (synced > 0) {
      console.log(`Erfolgreich synchronisiert: ${synced} Fotos`);
      // Erfolgreich hochgeladene Fotos aus IndexedDB entfernen, damit der
      // lokale Speicher nicht wächst und die Warteschlangen-Anzeige stimmt.
      try { await cleanupSyncedPhotos(); } catch { /* Cleanup ist unkritisch */ }
    }
    if (failed > 0) {
      console.warn(`Sync fehlgeschlagen: ${failed} Fotos`);
    }

    return { synced, failed, deferred, errors };
  } catch (e) {
    console.error('Fehler beim Foto-Sync:', e);
    return { synced: 0, failed: 0, deferred: 0, errors: [{ error: e.message }] };
  }
}

export async function getOfflinePhotoStats() {
  try {
    const photos = await getUnsyncdOfflinePhotos();
    return {
      pendingPhotos: photos.length,
      hasErrors: photos.some(p => p.syncError),
    };
  } catch {
    return {
      pendingPhotos: 0,
      hasErrors: false,
    };
  }
}
