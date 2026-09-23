/**
 * IndexedDB Wrapper with Versioning
 * Robust replacement for localStorage with schema management
 * Handles IndexedDB operations with proper versioning and migration
 */

const DB_NAME = 'CatchGBT_OfflineDB';
const DB_VERSION = 1;

const STORES = {
  catches: { keyPath: 'id', indexes: ['user_id', 'created_at'] },
  spots: { keyPath: 'id', indexes: ['user_id', 'created_at'] },
  pending_syncs: { keyPath: 'id', indexes: ['entity_type', 'created_at'] },
  metadata: { keyPath: 'key' },
};

export class IndexedDBManager {
  constructor() {
    this.db = null;
    this.ready = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => {
        reject(req.error);
      };

      req.onupgradeneeded = () => {
        const db = req.result;

        for (const [storeName, config] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: config.keyPath });
            config.indexes?.forEach(indexName => {
              store.createIndex(indexName, indexName);
            });
          }
        }
      };

      req.onsuccess = () => {
        this.db = req.result;
        resolve(true);
      };
    });
  }

  async get(storeName, key) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async getAll(storeName) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async put(storeName, value) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async delete(storeName, key) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(true);
    });
  }

  async clear(storeName) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(true);
    });
  }

  async query(storeName, indexName, value) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  async deleteByQuery(storeName, indexName, value) {
    const records = await this.query(storeName, indexName, value);
    const deletePromises = records.map(r => this.delete(storeName, r.id));
    return Promise.all(deletePromises);
  }

  async setMetadata(key, value) {
    return this.put('metadata', { key, value, updated_at: new Date().toISOString() });
  }

  async getMetadata(key) {
    const result = await this.get('metadata', key);
    return result?.value;
  }
}

// Singleton instance
export const idb = new IndexedDBManager();

// High-level API (replace old localStorage functions)
export const OfflineDataStore = {
  async cacheCatches(catches) {
    try {
      const data = {
        id: 'catches_main',
        records: catches,
        updated_at: new Date().toISOString(),
      };
      await idb.put('catches', data);
      await idb.setMetadata('lastSync_catches', new Date().toISOString());
    } catch {
    }
  },

  async getCachedCatches() {
    try {
      const data = await idb.get('catches', 'catches_main');
      return data?.records || [];
    } catch {
      return [];
    }
  },

  async cacheSpots(spots) {
    try {
      const data = {
        id: 'spots_main',
        records: spots,
        updated_at: new Date().toISOString(),
      };
      await idb.put('spots', data);
    } catch {
    }
  },

  async getCachedSpots() {
    try {
      const data = await idb.get('spots', 'spots_main');
      return data?.records || [];
    } catch {
      return [];
    }
  },

  async getLastSyncTime() {
    try {
      const ts = await idb.getMetadata('lastSync_catches');
      return ts ? new Date(ts) : null;
    } catch {
      return null;
    }
  },

  async isCacheStale(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const last = await this.getLastSyncTime();
    if (!last) return true;
    return Date.now() - last.getTime() > maxAgeMs;
  },

  async addPendingSync(entityType, data) {
    try {
      const record = {
        id: `${entityType}_${Date.now()}_${Math.random()}`,
        entity_type: entityType,
        data,
        created_at: new Date().toISOString(),
      };
      await idb.put('pending_syncs', record);
      return record.id;
    } catch {
      return null;
    }
  },

  async getPendingSyncs(entityType) {
    try {
      return await idb.query('pending_syncs', 'entity_type', entityType);
    } catch {
      return [];
    }
  },

  async removePendingSync(id) {
    try {
      await idb.delete('pending_syncs', id);
    } catch {
    }
  },

  async clearAll() {
    try {
      await idb.clear('catches');
      await idb.clear('spots');
      await idb.clear('pending_syncs');
      await idb.clear('metadata');
    } catch {
    }
  },

  async fetchCatchesWithFallback(fetchFn) {
    try {
      const data = await fetchFn();
      await this.cacheCatches(data);
      return { data, fromCache: false };
    } catch (e) {
      const cached = await this.getCachedCatches();
      if (cached.length > 0) {
        return { data: cached, fromCache: true };
      }
      throw e;
    }
  },

  async fetchSpotsWithFallback(fetchFn) {
    try {
      const data = await fetchFn();
      await this.cacheSpots(data);
      return { data, fromCache: false };
    } catch (e) {
      const cached = await this.getCachedSpots();
      if (cached.length > 0) {
        return { data: cached, fromCache: true };
      }
      throw e;
    }
  },
};