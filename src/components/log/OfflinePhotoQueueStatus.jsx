import React, { useState, useEffect } from 'react';
import { AlertCircle, Image, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getUnsyncdOfflinePhotos, getOfflinePhotoStats } from '@/utils/offlinePhotoStorage';
import { syncOfflineData } from '@/components/utils/offlineSync';

export default function OfflinePhotoQueueStatus() {
  const [stats, setStats] = useState({ total: 0, unsynced: 0, withErrors: 0 });
  const [syncing, setSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateStats = async () => {
    try {
      const photoStats = await getOfflinePhotoStats();
      setStats(photoStats);

      if (showDetails) {
        const unsynced = await getUnsyncdOfflinePhotos();
        setPhotos(unsynced);
      }
    } catch (e) {
      console.error('Fehler beim Abrufen der Photo-Statistiken:', e);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      // Fänge mitsynchronisieren: ein Foto zu einem noch nicht hochgeladenen
      // Offline-Fang wird sonst nur zurückgestellt und der Knopf bliebe wirkungslos.
      const { photos: result } = await syncOfflineData();
      await updateStats();

      if (result.synced > 0) {
        toast.success(`${result.synced} Foto(s) synchronisiert`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} Foto(s) fehlgeschlagen`);
      }
      if (!result.synced && !result.failed && result.deferred > 0) {
        toast.info(`${result.deferred} Foto(s) warten auf den zugehörigen Fang`);
      }
    } catch (e) {
      toast.error('Sync-Fehler: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Nur ungesyncte Fotos zählen — `total` enthält auch bereits synchronisierte,
  // der Banner bliebe sonst nach erfolgreichem Sync dauerhaft stehen.
  if (!stats.unsynced) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div
        className={`p-3 rounded-lg border flex items-center justify-between ${
          stats.withErrors
            ? 'bg-red-900/20 border-red-700/50'
            : 'bg-amber-900/20 border-amber-700/50'
        }`}
      >
        <div className="flex items-center gap-3">
          {stats.withErrors ? (
            <AlertCircle className="w-5 h-5 text-red-400" />
          ) : (
            <Image className="w-5 h-5 text-amber-400" />
          )}
          <div className="text-sm">
            <div className={stats.withErrors ? 'text-red-300' : 'text-amber-300'}>
              {stats.unsynced} Foto(s) warten auf Synchronisierung
            </div>
            {stats.withErrors > 0 && (
              <div className="text-xs text-red-400">
                {stats.withErrors} mit Fehler
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-200"
          >
            Details
          </button>
          <button type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 rounded text-white flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700 max-h-48 overflow-y-auto">
          <div className="text-xs text-gray-300 space-y-2">
            {photos.length === 0 ? (
              <div>Keine offline Fotos gefunden</div>
            ) : (
              photos.map((photo) => (
                <div
                  key={photo.id}
                  className={`p-2 rounded border-l-2 ${
                    photo.syncError
                      ? 'border-red-500 bg-red-900/10'
                      : 'border-yellow-500 bg-yellow-900/10'
                  }`}
                >
                  <div className="font-mono text-xs">{photo.fileName}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(photo.createdAt).toLocaleString('de-DE')}
                  </div>
                  {photo.syncError && (
                    <div className="text-xs text-red-400 mt-1">
                      Fehler: {photo.syncError}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
