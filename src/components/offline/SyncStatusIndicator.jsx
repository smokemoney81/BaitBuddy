/**
 * Sync-Status-Anzeige für Offline-Mode
 *
 * Zeigt an:
 * - Grün: Alle Daten synchronisiert
 * - Orange: Sync läuft / Ausstehend
 * - Rot: Fehler / Retry erforderlich
 * - Grau: Offline
 */

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, WifiOff, RefreshCw } from 'lucide-react';
import { offlineSyncService } from '@/lib/offlineSyncService';

export default function SyncStatusIndicator() {
  const [status, setStatus] = useState('synced'); // 'synced' | 'syncing' | 'error' | 'offline' | 'pending'
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Überwache Online/Offline-Status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Update Status alle 5 Sekunden
    const interval = setInterval(updateStatus, 5000);

    // Initial update
    updateStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const updateStatus = async () => {
    if (!isOnline) {
      setStatus('offline');
      return;
    }

    try {
      const pending = await offlineSync?.getPendingItems?.() || [];
      setPendingCount(pending.length);

      if (pending.length > 0) {
        setStatus('pending');
      } else {
        setStatus('synced');
      }
    } catch (err) {
      console.warn('Status update error:', err);
      setStatus('error');
    }
  };

  const handleRetry = async () => {
    setStatus('syncing');
    try {
      await offlineSyncService.sync();
      setStatus('synced');
    } catch (err) {
      setStatus('error');
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'synced':
        return 'text-green-500';
      case 'syncing':
        return 'text-blue-500';
      case 'pending':
        return 'text-amber-500';
      case 'error':
        return 'text-red-500';
      case 'offline':
        return 'text-gray-400';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'synced':
        return <CheckCircle2 className="w-5 h-5" />;
      case 'syncing':
        return <RefreshCw className="w-5 h-5 animate-spin" />;
      case 'pending':
        return <AlertCircle className="w-5 h-5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5" />;
      case 'offline':
        return <WifiOff className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'synced':
        return 'Synchronisiert';
      case 'syncing':
        return 'Synchronisiere...';
      case 'pending':
        return `${pendingCount} ausstehend`;
      case 'error':
        return 'Sync-Fehler';
      case 'offline':
        return 'Offline';
      default:
        return 'Unbekannt';
    }
  };

  return (
    <div className="relative">
      {/* Status Indicator Button */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${getStatusColor()} hover:bg-gray-100 dark:hover:bg-gray-800`}
        title={getStatusLabel()}
      >
        {getStatusIcon()}
        <span className="hidden sm:inline">{getStatusLabel()}</span>
      </button>

      {/* Details Popup */}
      {showDetails && (
        <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 w-72 z-50">
          <div className="space-y-3">
            {/* Status */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Status:</span>
                <span className={`text-sm font-medium ${getStatusColor()}`}>
                  {getStatusLabel()}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    status === 'synced'
                      ? 'bg-green-500 w-full'
                      : status === 'syncing'
                      ? 'bg-blue-500 w-3/4 animate-pulse'
                      : status === 'pending'
                      ? 'bg-amber-500 w-1/2'
                      : status === 'error'
                      ? 'bg-red-500 w-full'
                      : 'bg-gray-400 w-1/4'
                  }`}
                />
              </div>
            </div>

            {/* Network Status */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Netzwerk:</span>
              <span className={isOnline ? 'text-green-600' : 'text-red-600'}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Pending Items */}
            {pendingCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  Ausstehende Items:
                </span>
                <span className="font-medium">{pendingCount}</span>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {status === 'pending' || status === 'error' ? (
                <button
                  onClick={handleRetry}
                  className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Jetzt synchronisieren
                </button>
              ) : null}

              <button
                onClick={() => setShowDetails(false)}
                className="w-full px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                Schließen
              </button>
            </div>

            {/* Info */}
            <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
              💡 Die App arbeitet offline. Änderungen werden automatisch synchronisiert,
              wenn das Netzwerk verfügbar ist.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
