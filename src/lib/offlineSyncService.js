/**
 * Service-Worker Integration für Background Sync
 *
 * Verwaltet:
 * - Sync-Tag-Registrierung
 * - Retry-Logik
 * - Netzwerk-Status-Überwachung
 */

import { offlineSync } from './offlineSync.js';
import { ApiClient } from '@/api/frontendClient.js';

const SYNC_TAG_CATCHES = 'catch-sync';
const SYNC_TAG_SPOTS = 'spot-sync';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [1000, 5000, 15000]; // 1s, 5s, 15s backoff

class OfflineSyncService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncing = false;
  }

  /**
   * Initialisiert Service-Worker und Sync-Tag-Listening
   */
  async init() {
    // Registriere Service-Worker (falls noch nicht geschehen)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        console.log('📡 Service Worker registriert:', registration);
      } catch (err) {
        console.warn('⚠️ Service Worker registration failed:', err);
      }
    }

    // Überwache Online/Offline-Status
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Starte initiale Sync bei Online-Status
    if (navigator.onLine) {
      await this.sync();
    }
  }

  /**
   * Wird aufgerufen, wenn Gerät online kommt
   */
  async handleOnline() {
    console.log('🟢 Gerät ist online — starte Sync');
    this.isOnline = true;
    await this.sync();
  }

  /**
   * Wird aufgerufen, wenn Gerät offline geht
   */
  handleOffline() {
    console.log('🔴 Gerät ist offline — Sync pausiert');
    this.isOnline = false;
  }

  /**
   * Registriert einen Catch für Sync (nur lokal speichern)
   */
  async registerCatchForSync(catch_) {
    try {
      await offlineSync.saveCatch(catch_);

      // Wenn online: versuche sofort zu synchen
      if (this.isOnline) {
        await this.syncCatches();
      }

      return catch_;
    } catch (err) {
      console.error('❌ Fehler beim lokalen Speichern des Fangs:', err);
      throw err;
    }
  }

  /**
   * Registriert einen Spot für Sync
   */
  async registerSpotForSync(spot) {
    try {
      await offlineSync.saveSpot(spot);

      if (this.isOnline) {
        await this.syncSpots();
      }

      return spot;
    } catch (err) {
      console.error('❌ Fehler beim lokalen Speichern des Spots:', err);
      throw err;
    }
  }

  /**
   * Synchronisiert alle Fänge mit Server
   */
  async syncCatches() {
    if (this.syncing || !this.isOnline) return;

    this.syncing = true;
    try {
      const userId = await this.getCurrentUserId();
      if (!userId) return;

      const localCatches = await offlineSync.getCatchesByUser(userId);
      const unsynced = localCatches.filter(c => !c.synced_at);

      for (const catch_ of unsynced) {
        try {
          const result = await ApiClient.post('/api/catches', catch_);

          // Update lokal mit Server-Daten
          await offlineSync.saveCatch({
            ...catch_,
            id: result.id,
            synced_at: new Date().toISOString(),
          });
        } catch (err) {
          if (err.status === 401) {
            console.warn('⚠️ Authentifizierung erforderlich — Sync gestoppt');
            break;
          }

          // Queue für Retry
          await offlineSync.queueForSync('catch', catch_, 0);
        }
      }

      await offlineSync.setLastSyncTime('catches', Date.now());
    } catch (err) {
      console.error('❌ Sync-Fehler (catches):', err);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Synchronisiert alle Spots mit Server
   */
  async syncSpots() {
    if (this.syncing || !this.isOnline) return;

    this.syncing = true;
    try {
      const userId = await this.getCurrentUserId();
      if (!userId) return;

      const localSpots = await offlineSync.getSpotsByUser(userId);
      const unsynced = localSpots.filter(s => !s.synced_at);

      for (const spot of unsynced) {
        try {
          const result = await ApiClient.post('/api/spots', spot);

          await offlineSync.saveSpot({
            ...spot,
            id: result.id,
            synced_at: new Date().toISOString(),
          });
        } catch (err) {
          if (err.status === 401) {
            console.warn('⚠️ Authentifizierung erforderlich — Sync gestoppt');
            break;
          }

          await offlineSync.queueForSync('spot', spot, 0);
        }
      }

      await offlineSync.setLastSyncTime('spots', Date.now());
    } catch (err) {
      console.error('❌ Sync-Fehler (spots):', err);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Hauptmethode: Synchronisiert alles (Catches + Spots + Retry-Queue)
   */
  async sync() {
    if (!this.isOnline) {
      console.log('⚠️ Offline — Sync übersprungen');
      return;
    }

    console.log('🔄 Starte Full-Sync...');

    try {
      await this.syncCatches();
      await this.syncSpots();
      await this.syncRetryQueue();

      console.log('✅ Sync erfolgreich');
    } catch (err) {
      console.error('❌ Full-Sync fehlgeschlagen:', err);
    }
  }

  /**
   * Versucht, Items aus der Retry-Queue zu synchronisieren
   */
  async syncRetryQueue() {
    const pending = await offlineSync.getPendingItems();

    for (const item of pending) {
      if (item.retry_count >= MAX_RETRIES) {
        console.warn(`⚠️ Item ${item.id} hat max Retries erreicht`);
        continue;
      }

      try {
        const endpoint = item.type === 'catch' ? '/api/catches' : '/api/spots';
        await ApiClient.post(endpoint, item.data);

        // Erfolgreich: aus Queue entfernen
        await offlineSync.removePendingItem(item.id);
      } catch (err) {
        if (err.status === 401) {
          console.warn('⚠️ Auth erforderlich — Retry-Queue pausiert');
          break;
        }

        // Retry mit Backoff
        const nextRetry = item.retry_count + 1;
        if (nextRetry < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS[nextRetry] || 30000;
          console.log(`⏳ Retry ${item.id} in ${delay}ms`);

          setTimeout(() => {
            offlineSync.queueForSync(item.type, item.data, nextRetry);
          }, delay);
        }
      }
    }
  }

  /**
   * Holt aktuelle User-ID (aus localStorage oder API)
   */
  async getCurrentUserId() {
    try {
      const response = await ApiClient.get('/api/auth/me');
      return response.id || null;
    } catch (err) {
      console.warn('⚠️ Konnte User-ID nicht abrufen:', err);
      return null;
    }
  }

  /**
   * Gibt Storage-Statistiken zurück
   */
  async getStorageStats() {
    const storage = await offlineSync.getStorageSize();
    const pending = await offlineSync.getPendingItems();

    return {
      usedMB: (storage.usage / 1024 / 1024).toFixed(2),
      quotaMB: (storage.quota / 1024 / 1024).toFixed(2),
      percentUsed: Math.round((storage.usage / storage.quota) * 100),
      pendingItems: pending.length,
    };
  }

  /**
   * Notfall-Reset: Löscht alle lokalen Daten
   */
  async clearLocalData() {
    if (confirm('⚠️ Alle lokalen Daten werden gelöscht. Sicher?')) {
      await offlineSync.clearAll();
      console.log('✅ Alle lokalen Daten gelöscht');
    }
  }
}

// Export singleton
export const offlineSyncService = new OfflineSyncService();
