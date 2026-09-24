/**
 * Offline Data Cache Utility
 * Speichert Faenge und Spots im localStorage fuer Offline-Zugriff.
 * Wird von den jeweiligen Seiten/Komponenten aufgerufen.
 */

import { isOnline as checkIsOnline, onOnlineStatusChange as onStatusChange } from '@/utils/networkStatus';

const KEYS = {
  catches: 'catchgbt_offline_catches',
  spots: 'catchgbt_offline_spots',
  lastSync: 'catchgbt_offline_last_sync',
};

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

// --- Schreiben ---

export function cacheCatches(catches) {
  try {
    localStorage.setItem(KEYS.catches, JSON.stringify(catches));
    localStorage.setItem(KEYS.lastSync, new Date().toISOString());
  } catch {
    // Silently fail - cache is not critical
  }
}

export function cacheSpots(spots) {
  try {
    localStorage.setItem(KEYS.spots, JSON.stringify(spots));
  } catch {
    // Silently fail - cache is not critical
  }
}

// --- Lesen ---

export function getCachedCatches() {
  try {
    const raw = localStorage.getItem(KEYS.catches);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getCachedSpots() {
  try {
    const raw = localStorage.getItem(KEYS.spots);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getLastSyncTime() {
  const ts = localStorage.getItem(KEYS.lastSync);
  return ts ? new Date(ts) : null;
}

export function isCacheStale() {
  const last = getLastSyncTime();
  if (!last) return true;
  return Date.now() - last.getTime() > MAX_AGE_MS;
}

// --- Queue fuer ausstehende Faenge ---

export function getPendingQueueCount() {
  try {
    const raw = localStorage.getItem('fishmaster_catch_queue');
    const queue = raw ? JSON.parse(raw) : [];
    return queue.length;
  } catch {
    return 0;
  }
}

export function getPendingQueue() {
  try {
    const raw = localStorage.getItem('fishmaster_catch_queue');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Laedt Faenge: zuerst vom Server, bei Fehler (offline) aus dem Cache.
 * Aktualisiert den Cache bei erfolgreicher Anfrage automatisch.
 */
export async function fetchCatchesWithFallback(fetchFn) {
  try {
    const data = await fetchFn();
    cacheCatches(data);
    return { data, fromCache: false };
  } catch (e) {
    const cached = getCachedCatches();
    if (cached.length > 0) {
      return { data: cached, fromCache: true };
    }
    throw e;
  }
}

// ── Online-Status Utilities ───────────────────────────────────────────────────

export function isOnline() {
  return checkIsOnline();
}

export function onOnlineStatusChange(callback) {
  if (typeof window === 'undefined') return () => {};
  return onStatusChange(callback);
}

// ── Generische Cache-Funktionen (für Dashboard-Kompatibilität) ────────────────

export function initOfflineDB() { return Promise.resolve(); }

export function cacheEntityData(type, data) {
  try { localStorage.setItem(`bb_offline_${type}`, JSON.stringify(data)); } catch { /* ignore */ }
  return Promise.resolve();
}

export function getOfflineData(type) {
  try {
    const raw = localStorage.getItem(`bb_offline_${type}`);
    return Promise.resolve(raw ? JSON.parse(raw) : []);
  } catch { return Promise.resolve([]); }
}

export function cacheWeatherData(lat, lon, data) {
  try {
    const key = `bb_weather_${Math.round(lat * 10)}_${Math.round(lon * 10)}`;
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }
  return Promise.resolve();
}

export function getCachedWeather(lat, lon) {
  try {
    const key = `bb_weather_${Math.round(lat * 10)}_${Math.round(lon * 10)}`;
    const raw = localStorage.getItem(key);
    if (!raw) return Promise.resolve(null);
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 30 * 60 * 1000) return Promise.resolve(null); // 30 min TTL
    return Promise.resolve(data);
  } catch { return Promise.resolve(null); }
}

/**
 * Laedt Spots: zuerst vom Server, bei Fehler aus dem Cache.
 */
export async function fetchSpotsWithFallback(fetchFn) {
  try {
    const data = await fetchFn();
    cacheSpots(data);
    return { data, fromCache: false };
  } catch (e) {
    const cached = getCachedSpots();
    if (cached.length > 0) {
      return { data: cached, fromCache: true };
    }
    throw e;
  }
}