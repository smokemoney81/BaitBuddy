import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Database, Upload } from 'lucide-react';

export default function OfflineCacheIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showDetail, setShowDetail] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);

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

  useEffect(() => {
    const updateCacheInfo = async () => {
      try {
        const { getOfflineData } = await import('@/components/utils/offlineDataCache');
        const { getOfflineQueueStatus } = await import('@/components/utils/offlineSync');
        const [spots, weather] = await Promise.all([
          getOfflineData('spots'),
          getOfflineData('weather')
        ]);
        const queueStatus = getOfflineQueueStatus();

        setCacheInfo({
          spotsCount: spots?.length || 0,
          weatherCount: weather?.length || 0,
          pendingCatches: queueStatus.pendingCatches,
          pendingNotes: queueStatus.pendingNotes
        });
      } catch (error) {
        console.error('Cache info error:', error);
      }
    };

    // Details braucht nur die Offline-Anzeige. Online lief hier früher alle
    // 2 Sekunden ein Abgleich von Cache und Warteschlange — ohne Nutzen.
    if (isOnline) return undefined;
    updateCacheInfo();
    const interval = setInterval(updateCacheInfo, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

  if (isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs" role="status">
        <Wifi className="w-3 h-3" />
        <span>Online</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button type="button"
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs hover:bg-amber-500/20 transition-colors"
      >
        <WifiOff className="w-3 h-3" />
        <span>Offline</span>
      </button>

      {showDetail && cacheInfo && (
        <div className="absolute top-full right-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 w-56 shadow-lg z-50">
          <div className="space-y-3 text-xs">
            {(cacheInfo.pendingCatches > 0 || cacheInfo.pendingNotes > 0) && (
              <div>
                <div className="flex items-center gap-2 text-cyan-300 mb-2">
                  <Upload className="w-3 h-3" />
                  <span>Zu synchronisieren:</span>
                </div>
                <div className="ml-5 space-y-1 text-gray-400">
                  {cacheInfo.pendingCatches > 0 && (
                    <div className="text-cyan-400">
                      Fänge: {cacheInfo.pendingCatches}
                    </div>
                  )}
                  {cacheInfo.pendingNotes > 0 && (
                    <div className="text-cyan-400">
                      Audio-Notizen: {cacheInfo.pendingNotes}
                    </div>
                  )}
                </div>
              </div>
            )}
            {(cacheInfo.spotsCount > 0 || cacheInfo.weatherCount > 0) && (
              <div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Database className="w-3 h-3 text-amber-400" />
                  <span>Gecachte Daten:</span>
                </div>
                <div className="ml-5 space-y-1 text-gray-400">
                  {cacheInfo.spotsCount > 0 && (
                    <div>Angelplaetze: {cacheInfo.spotsCount}</div>
                  )}
                  {cacheInfo.weatherCount > 0 && (
                    <div>Wetterdaten: {cacheInfo.weatherCount}</div>
                  )}
                </div>
              </div>
            )}
            {cacheInfo.spotsCount === 0 && cacheInfo.weatherCount === 0 && cacheInfo.pendingCatches === 0 && cacheInfo.pendingNotes === 0 && (
              <div className="text-gray-500">Keine Offline-Daten</div>
            )}
            <div className="pt-2 border-t border-gray-700 text-gray-500 text-xs">
              Verbindung wird automatisch synchronisiert
            </div>
          </div>
        </div>
      )}
    </div>
  );
}