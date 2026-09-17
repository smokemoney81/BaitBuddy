/**
 * Offline-Sync Engine für BaitBuddy
 *
 * Persistiert Fänge, Spots und andere Daten lokal via IndexedDB
 * und synchronisiert mit dem Server bei Netzwerk-Verfügbarkeit.
 *
 * Architektur:
 * 1. IndexedDB stores für locales Caching
 * 2. Service-Worker-Integration für Background Sync
 * 3. Conflict-Resolver (Last-Write-Wins)
 * 4. UI Sync-Status-Indicator
 */

const DB_NAME = 'BaitBuddyOffline';
const DB_VERSION = 1;
const STORE_NAMES = {
  CATCHES: 'catches',
  SPOTS: 'spots',
  PENDING_SYNC: 'pending_sync',
  SYNC_METADATA: 'sync_metadata',
};

class OfflineSyncEngine {
  constructor() {
    this.db = null;
    this.syncInProgress = false;
    this.listeners = [];
  }

  /**
   * Initialisiert IndexedDB-Schema
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error('IndexedDB open failed'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Catches Store
        if (!db.objectStoreNames.contains(STORE_NAMES.CATCHES)) {
          const catchStore = db.createObjectStore(STORE_NAMES.CATCHES, {
            keyPath: 'id',
            autoIncrement: false
          });
          catchStore.createIndex('user_id', 'user_id', { unique: false });
          catchStore.createIndex('synced_at', 'synced_at', { unique: false });
        }

        // Spots Store
        if (!db.objectStoreNames.contains(STORE_NAMES.SPOTS)) {
          const spotStore = db.createObjectStore(STORE_NAMES.SPOTS, {
            keyPath: 'id',
            autoIncrement: false
          });
          spotStore.createIndex('user_id', 'user_id', { unique: false });
          spotStore.createIndex('synced_at', 'synced_at', { unique: false });
        }

        // Pending Sync Queue
        if (!db.objectStoreNames.contains(STORE_NAMES.PENDING_SYNC)) {
          const pendingStore = db.createObjectStore(STORE_NAMES.PENDING_SYNC, {
            keyPath: 'id',
            autoIncrement: true
          });
          pendingStore.createIndex('type', 'type', { unique: false });
          pendingStore.createIndex('retry_count', 'retry_count', { unique: false });
          pendingStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Sync Metadata (last sync timestamp, conflict markers)
        if (!db.objectStoreNames.contains(STORE_NAMES.SYNC_METADATA)) {
          db.createObjectStore(STORE_NAMES.SYNC_METADATA, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Speichert einen Fang lokal
   */
  async saveCatch(catch_) {
    const transaction = this.db.transaction([STORE_NAMES.CATCHES], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.CATCHES);

    const record = {
      ...catch_,
      local_timestamp: Date.now(),
      synced_at: catch_.synced_at || null,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.notifyListeners('catch_saved', record);
        resolve(record);
      };
    });
  }

  /**
   * Speichert einen Spot lokal
   */
  async saveSpot(spot) {
    const transaction = this.db.transaction([STORE_NAMES.SPOTS], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.SPOTS);

    const record = {
      ...spot,
      local_timestamp: Date.now(),
      synced_at: spot.synced_at || null,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.notifyListeners('spot_saved', record);
        resolve(record);
      };
    });
  }

  /**
   * Holt alle lokalen Fänge eines Nutzers
   */
  async getCatchesByUser(userId) {
    const transaction = this.db.transaction([STORE_NAMES.CATCHES], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.CATCHES);
    const index = store.index('user_id');

    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Holt alle lokalen Spots eines Nutzers
   */
  async getSpotsByUser(userId) {
    const transaction = this.db.transaction([STORE_NAMES.SPOTS], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.SPOTS);
    const index = store.index('user_id');

    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Queued ein Item für Synchronisierung (bei Fehler)
   */
  async queueForSync(type, data, retryCount = 0) {
    const transaction = this.db.transaction([STORE_NAMES.PENDING_SYNC], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.PENDING_SYNC);

    const item = {
      type,
      data,
      retry_count: retryCount,
      created_at: Date.now(),
      last_error: null,
    };

    return new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.notifyListeners('item_queued', item);
        resolve({ id: request.result, ...item });
      };
    });
  }

  /**
   * Holt alle Items aus der Sync-Queue
   */
  async getPendingItems() {
    const transaction = this.db.transaction([STORE_NAMES.PENDING_SYNC], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.PENDING_SYNC);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Entfernt Item aus Sync-Queue nach erfolgreichem Upload
   */
  async removePendingItem(id) {
    const transaction = this.db.transaction([STORE_NAMES.PENDING_SYNC], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.PENDING_SYNC);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  /**
   * Setzt letzten Sync-Zeitstempel
   */
  async setLastSyncTime(type, timestamp) {
    const transaction = this.db.transaction([STORE_NAMES.SYNC_METADATA], 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.SYNC_METADATA);

    return new Promise((resolve, reject) => {
      const request = store.put({
        key: `last_sync_${type}`,
        value: timestamp
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(timestamp);
    });
  }

  /**
   * Holt letzten Sync-Zeitstempel
   */
  async getLastSyncTime(type) {
    const transaction = this.db.transaction([STORE_NAMES.SYNC_METADATA], 'readonly');
    const store = transaction.objectStore(STORE_NAMES.SYNC_METADATA);

    return new Promise((resolve, reject) => {
      const request = store.get(`last_sync_${type}`);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result?.value || null);
      };
    });
  }

  /**
   * Conflict-Resolver: Last-Write-Wins
   */
  resolveConflict(local, remote) {
    // Wenn beide den gleichen updated_at haben, bevorzuge local (User-Änderung)
    if (local.updated_at === remote.updated_at) {
      return local;
    }

    // Ansonsten: neuere Version gewinnt
    return new Date(local.updated_at) > new Date(remote.updated_at)
      ? local
      : remote;
  }

  /**
   * Registriert Listener für Sync-Events
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  /**
   * Benachrichtigt alle Listener
   */
  notifyListeners(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data));
  }

  /**
   * Gibt DB-Speichersize zurück (Bytes)
   */
  async getStorageSize() {
    if (!navigator.storage?.estimate) {
      return { usage: 0, quota: 0 };
    }
    return navigator.storage.estimate();
  }

  /**
   * Löscht ALLE lokalen Daten (Notfall-Reset)
   */
  async clearAll() {
    const transaction = this.db.transaction(
      [STORE_NAMES.CATCHES, STORE_NAMES.SPOTS, STORE_NAMES.PENDING_SYNC, STORE_NAMES.SYNC_METADATA],
      'readwrite'
    );

    const stores = [
      STORE_NAMES.CATCHES,
      STORE_NAMES.SPOTS,
      STORE_NAMES.PENDING_SYNC,
      STORE_NAMES.SYNC_METADATA,
    ];

    return Promise.all(
      stores.map(storeName => {
        return new Promise((resolve, reject) => {
          const request = transaction.objectStore(storeName).clear();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(true);
        });
      })
    );
  }
}

// Export singleton
export const offlineSync = new OfflineSyncEngine();
