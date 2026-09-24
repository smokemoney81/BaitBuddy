import React, { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { Zap, Trash2, BarChart3 } from 'lucide-react';
import AdvancedCacheOptimizer from './AdvancedCacheOptimizer';

/**
 * AdvancedCacheManager - UI für erweiterte Caching-Optimierungen
 * - Cache Statistiken (Hit Rate, Compression Ratio)
 * - LRU-Eviction Management
 * - Bandwidth-optimierte Tile-Downloads
 */
function AdvancedCacheManager({ visible = true }) {
  const _map = useMap();
  const [optimizer, setOptimizer] = useState(null);
  const [stats, setStats] = useState(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Initialize optimizer
  useEffect(() => {
    const initOptimizer = async () => {
      const opt = new AdvancedCacheOptimizer();
      await opt.init();
      setOptimizer(opt);
      updateStats(opt);
    };

    initOptimizer();
  }, []);

  // Update stats periodically
  useEffect(() => {
    if (!optimizer) return;

    const interval = setInterval(() => {
      updateStats(optimizer);
    }, 5000);

    return () => clearInterval(interval);
  }, [optimizer]);

  const updateStats = async (opt) => {
    const newStats = await opt.getStats();
    setStats(newStats);
  };

  const handleClear = async () => {
    if (!optimizer || isClearing) return;

    setIsClearing(true);
    try {
      await optimizer.clear();
      await updateStats(optimizer);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
    setIsClearing(false);
  };

  if (!visible || !stats) return null;

  const hitRatePercent = (stats.cacheHitRate * 100).toFixed(1);
  const compressionPercent = (stats.compressionRatio * 100).toFixed(1);
  const cacheSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);

  return (
    <div className="absolute bottom-4 left-4 z-30 bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700 p-3 text-xs max-w-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-yellow-400 font-semibold">
          <Zap className="w-4 h-4" />
          <span>Cache Optimierung</span>
        </div>
        <button type="button"
          onClick={() => setShowStats(!showStats)}
          className="text-gray-400 hover:text-gray-200"
        >
          <BarChart3 className="w-4 h-4" />
        </button>
      </div>

      {showStats && (
        <div className="space-y-2 mb-3 pb-3 border-b border-gray-700">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-gray-400">Hit Rate:</span>
              <span className="text-green-400 ml-1 font-semibold">{hitRatePercent}%</span>
            </div>
            <div>
              <span className="text-gray-400">Cache Size:</span>
              <span className="text-cyan-400 ml-1 font-semibold">{cacheSizeMB} MB</span>
            </div>
            <div>
              <span className="text-gray-400">Tiles:</span>
              <span className="text-blue-400 ml-1 font-semibold">{stats.tileCount}</span>
            </div>
            <div>
              <span className="text-gray-400">Compression:</span>
              <span className="text-purple-400 ml-1 font-semibold">{compressionPercent}%</span>
            </div>
          </div>

          <div className="text-gray-500 text-xs space-y-1">
            <div>Hits: {stats.hits} | Misses: {stats.misses}</div>
            <div className="w-full bg-gray-800 rounded h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-blue-500 h-full"
                style={{ width: `${Math.min(hitRatePercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button"
          onClick={handleClear}
          disabled={isClearing}
          className="flex-1 flex items-center justify-center gap-1 bg-red-900/40 hover:bg-red-900/60 text-red-400 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50 transition"
        >
          <Trash2 className="w-3 h-3" />
          {isClearing ? 'Wird gelöscht...' : 'Cache löschen'}
        </button>
      </div>

      <div className="text-gray-500 text-xs mt-2">
        Offline-Tiles werden automatisch optimiert und komprimiert
      </div>
    </div>
  );
}

export default AdvancedCacheManager;
