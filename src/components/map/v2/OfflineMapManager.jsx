import React, { useEffect, useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import { getOfflineTileCache } from './OfflineTileCache';
import { Download, Wifi, WifiOff, BarChart3 } from 'lucide-react';

/**
 * OfflineMapManager
 * Verwaltet Offline-Tile-Caching und Prefetching
 * Integriert mit Leaflet-Map für automatisches Tile-Caching
 */
function OfflineMapManager({ bounds: _bounds, autoCache = true, showStats = false }) {
  const map = useMap();
  const [stats, setStats] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cacheProgress, setCacheProgress] = useState(0);
  const tileCache = getOfflineTileCache();

  // Update online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-prefetch tiles when map moves (if online)
  useEffect(() => {
    if (!map || !autoCache || !isOnline) return;

    const handleMoveEnd = () => {
      const bounds = map.getBounds();
      const zoomLevel = map.getZoom();

      // Prefetch tiles for current and adjacent zoom levels
      const prefetchBounds = {
        lat_min: bounds.getSouth(),
        lat_max: bounds.getNorth(),
        lon_min: bounds.getWest(),
        lon_max: bounds.getEast(),
      };

      tileCache.prefetchTiles(prefetchBounds, [
        zoomLevel - 1,
        zoomLevel,
        zoomLevel + 1,
      ]);

      // Update stats
      updateStats();
    };

    map.on('moveend', handleMoveEnd);
    return () => map.off('moveend', handleMoveEnd);
  }, [map, autoCache, isOnline, tileCache]);

  // Hook Leaflet's tile layer to use cache
  useEffect(() => {
    if (!map) return;

    // Get the base tile layer and hook it
    const _layers = [];
    map.eachLayer((layer) => {
      if (layer._url && typeof layer._url === 'string') {
        // This is a tile layer
        const _originalUrl = layer._url;

        // Override tile URL getter
        const originalGetUrl = layer.getTileUrl
          ? layer.getTileUrl.bind(layer)
          : null;

        if (originalGetUrl) {
          layer.getTileUrl = function (coords) {
            const originalTile = originalGetUrl(coords);

            // Queue for caching
            tileCache.queueTileDownload(originalTile, {
              z: coords.z,
              x: coords.x,
              y: coords.y,
            });

            return originalTile;
          };
        }
      }
    });
  }, [map, tileCache]);

  // Update stats periodically
  const updateStats = useCallback(async () => {
    const newStats = await tileCache.getStats();
    setStats(newStats);
  }, [tileCache]);

  // Manual prefetch trigger
  const handlePrefetch = useCallback(() => {
    if (!map || !isOnline) return;

    const bounds = map.getBounds();
    const prefetchBounds = {
      lat_min: bounds.getSouth(),
      lat_max: bounds.getNorth(),
      lon_min: bounds.getWest(),
      lon_max: bounds.getEast(),
    };

    setCacheProgress(0);
    tileCache.prefetchTiles(prefetchBounds, [6, 7, 8, 9]);

    // Simulate progress
    const interval = setInterval(() => {
      setCacheProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          updateStats();
          return 100;
        }
        return p + Math.random() * 20;
      });
    }, 500);
  }, [map, isOnline, tileCache, updateStats]);

  // Sync initial stats
  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, [updateStats]);

  return (
    <div className="absolute bottom-4 left-4 z-40 space-y-2">
      {/* Status Indicator */}
      <div className="flex items-center gap-2 bg-gray-900/80 px-3 py-2 rounded-lg backdrop-blur-sm border border-gray-700">
        {isOnline ? (
          <Wifi className="w-4 h-4 text-green-400" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-400" />
        )}
        <span className="text-xs text-gray-300">
          {isOnline ? 'Online' : 'Offline Mode'}
        </span>
      </div>

      {/* Prefetch Button (only online) */}
      {isOnline && (
        <button type="button"
          onClick={handlePrefetch}
          disabled={cacheProgress > 0 && cacheProgress < 100}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 px-3 py-2 rounded-lg text-xs text-white font-semibold transition-colors"
        >
          <Download className="w-4 h-4" />
          {cacheProgress > 0 && cacheProgress < 100
            ? `Caching... ${Math.round(cacheProgress)}%`
            : 'Cache Maps'}
        </button>
      )}

      {/* Stats (optional) */}
      {showStats && stats && (
        <div className="bg-gray-900/80 px-3 py-2 rounded-lg backdrop-blur-sm border border-gray-700 text-xs text-gray-400 space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3 h-3" />
            <span>Cached: {stats.cachedTiles} tiles</span>
          </div>
          <div className="text-xs text-gray-500">
            Size: {stats.totalSizeMb} MB
          </div>
          {stats.queuedTiles > 0 && (
            <div className="text-xs text-cyan-400">
              Queue: {stats.queuedTiles}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OfflineMapManager;
