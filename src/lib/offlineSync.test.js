/**
 * Unit Tests für Offline-Sync Engine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { offlineSync } from './offlineSync';

describe('OfflineSyncEngine', () => {
  beforeEach(async () => {
    // IndexedDB mock oder echter Storage für Tests
    await offlineSync.init();
  });

  afterEach(async () => {
    // Cleanup
    await offlineSync.clearAll();
  });

  describe('Initialization', () => {
    it('should initialize IndexedDB with correct schema', async () => {
      expect(offlineSync.db).toBeDefined();
      expect(offlineSync.db.objectStoreNames.contains('catches')).toBe(true);
      expect(offlineSync.db.objectStoreNames.contains('spots')).toBe(true);
      expect(offlineSync.db.objectStoreNames.contains('pending_sync')).toBe(true);
    });
  });

  describe('Catch Operations', () => {
    it('should save and retrieve a catch', async () => {
      const catch_ = {
        id: '1',
        user_id: 'user1',
        title: 'Test Catch',
        weight_kg: 2.5,
        location: 'Lake',
        updated_at: new Date().toISOString(),
      };

      await offlineSync.saveCatch(catch_);
      const saved = await offlineSync.getCatchesByUser('user1');

      expect(saved).toHaveLength(1);
      expect(saved[0].title).toBe('Test Catch');
    });

    it('should filter catches by user_id', async () => {
      const catch1 = {
        id: '1',
        user_id: 'user1',
        title: 'Catch 1',
        weight_kg: 1.5,
      };
      const catch2 = {
        id: '2',
        user_id: 'user2',
        title: 'Catch 2',
        weight_kg: 2.5,
      };

      await offlineSync.saveCatch(catch1);
      await offlineSync.saveCatch(catch2);

      const user1Catches = await offlineSync.getCatchesByUser('user1');
      const user2Catches = await offlineSync.getCatchesByUser('user2');

      expect(user1Catches).toHaveLength(1);
      expect(user2Catches).toHaveLength(1);
      expect(user1Catches[0].user_id).toBe('user1');
    });

    it('should mark catch as synced', async () => {
      const catch_ = {
        id: '1',
        user_id: 'user1',
        title: 'Test',
        weight_kg: 1.5,
        synced_at: null,
      };

      await offlineSync.saveCatch(catch_);
      const syncedCatch = {
        ...catch_,
        synced_at: new Date().toISOString(),
      };
      await offlineSync.saveCatch(syncedCatch);

      const [retrieved] = await offlineSync.getCatchesByUser('user1');
      expect(retrieved.synced_at).toBeTruthy();
    });
  });

  describe('Spot Operations', () => {
    it('should save and retrieve a spot', async () => {
      const spot = {
        id: '1',
        user_id: 'user1',
        name: 'Test Spot',
        lat: 52.5,
        lng: 13.4,
        updated_at: new Date().toISOString(),
      };

      await offlineSync.saveSpot(spot);
      const saved = await offlineSync.getSpotsByUser('user1');

      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('Test Spot');
    });

    it('should filter spots by user_id', async () => {
      const spot1 = {
        id: '1',
        user_id: 'user1',
        name: 'Spot 1',
        lat: 52.5,
        lng: 13.4,
      };
      const spot2 = {
        id: '2',
        user_id: 'user2',
        name: 'Spot 2',
        lat: 48.1,
        lng: 11.6,
      };

      await offlineSync.saveSpot(spot1);
      await offlineSync.saveSpot(spot2);

      const user1Spots = await offlineSync.getSpotsByUser('user1');
      expect(user1Spots).toHaveLength(1);
      expect(user1Spots[0].user_id).toBe('user1');
    });
  });

  describe('Sync Queue', () => {
    it('should queue item for sync', async () => {
      const item = { title: 'Test', weight_kg: 1.5 };
      const queued = await offlineSync.queueForSync('catch', item);

      expect(queued.id).toBeDefined();
      expect(queued.type).toBe('catch');
      expect(queued.retry_count).toBe(0);
    });

    it('should get all pending items', async () => {
      const item1 = { title: 'Test 1' };
      const item2 = { title: 'Test 2' };

      await offlineSync.queueForSync('catch', item1);
      await offlineSync.queueForSync('spot', item2);

      const pending = await offlineSync.getPendingItems();
      expect(pending).toHaveLength(2);
    });

    it('should remove item from queue after sync', async () => {
      const item = { title: 'Test' };
      const queued = await offlineSync.queueForSync('catch', item);

      await offlineSync.removePendingItem(queued.id);
      const pending = await offlineSync.getPendingItems();

      expect(pending).toHaveLength(0);
    });

    it('should increment retry count on requeue', async () => {
      const item = { title: 'Test' };
      const queued = await offlineSync.queueForSync('catch', item, 1);

      expect(queued.retry_count).toBe(1);
    });
  });

  describe('Sync Metadata', () => {
    it('should set and get last sync time', async () => {
      const timestamp = Date.now();
      await offlineSync.setLastSyncTime('catches', timestamp);

      const retrieved = await offlineSync.getLastSyncTime('catches');
      expect(retrieved).toBe(timestamp);
    });

    it('should return null for unset sync time', async () => {
      const retrieved = await offlineSync.getLastSyncTime('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('Conflict Resolution', () => {
    it('should use last-write-wins for different timestamps', () => {
      const local = {
        id: '1',
        title: 'Local',
        updated_at: '2026-09-17T12:00:00Z',
      };
      const remote = {
        id: '1',
        title: 'Remote',
        updated_at: '2026-09-17T11:00:00Z',
      };

      const resolved = offlineSync.resolveConflict(local, remote);
      expect(resolved.title).toBe('Local');
    });

    it('should prefer local for equal timestamps', () => {
      const timestamp = '2026-09-17T12:00:00Z';
      const local = {
        id: '1',
        title: 'Local',
        updated_at: timestamp,
      };
      const remote = {
        id: '1',
        title: 'Remote',
        updated_at: timestamp,
      };

      const resolved = offlineSync.resolveConflict(local, remote);
      expect(resolved.title).toBe('Local');
    });

    it('should prefer newer version', () => {
      const local = {
        id: '1',
        title: 'Local',
        updated_at: '2026-09-17T11:00:00Z',
      };
      const remote = {
        id: '1',
        title: 'Remote',
        updated_at: '2026-09-17T12:00:00Z',
      };

      const resolved = offlineSync.resolveConflict(local, remote);
      expect(resolved.title).toBe('Remote');
    });
  });

  describe('Event Listeners', () => {
    it('should register and notify listeners', async () => {
      const callback = vi.fn();
      offlineSync.on('catch_saved', callback);

      const catch_ = {
        id: '1',
        user_id: 'user1',
        title: 'Test',
      };

      await offlineSync.saveCatch(catch_);
      expect(callback).toHaveBeenCalled();
    });

    it('should only notify matching event listeners', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      offlineSync.on('catch_saved', callback1);
      offlineSync.on('spot_saved', callback2);

      const catch_ = { id: '1', user_id: 'user1', title: 'Test' };
      await offlineSync.saveCatch(catch_);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('Storage Management', () => {
    it('should calculate storage size', async () => {
      const stats = await offlineSync.getStorageSize();
      expect(stats.usage).toBeGreaterThanOrEqual(0);
      expect(stats.quota).toBeGreaterThan(0);
    });

    it('should clear all data', async () => {
      const catch_ = { id: '1', user_id: 'user1', title: 'Test' };
      await offlineSync.saveCatch(catch_);

      await offlineSync.clearAll();
      const remaining = await offlineSync.getCatchesByUser('user1');

      expect(remaining).toHaveLength(0);
    });
  });
});
