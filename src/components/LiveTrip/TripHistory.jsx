import React, { useState, useEffect } from 'react';
import { Trash2, Download, Cloud, AlertCircle, Clock, Fish } from 'lucide-react';
import { toast } from 'sonner';
import TripSyncService from '../../services/TripSyncService';
import { auth } from '../../api/frontendClient';

function TripHistory() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const allTrips = JSON.parse(localStorage.getItem('liveTrips') || '[]').reverse(); // Neueste zuerst
      setTrips(allTrips);

      const stats = await TripSyncService.getStorageStats();
      setStats(stats);
    } catch (error) {
      toast.error('Fehler beim Laden der Touren');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tripId) => {
    if (!window.confirm('Tour wirklich löschen?')) return;

    try {
      await TripSyncService.deleteLocalTrip(tripId);
      setTrips(trips.filter(t => t.id !== tripId));
      toast.success('Tour gelöscht');
      loadTrips();
    } catch (error) {
      toast.error('Fehler beim Löschen');
    }
  };

  const handleSync = async () => {
    const token = auth.getToken();
    if (!token) {
      toast.error('Bitte melde dich an, um Touren zu synchronisieren');
      return;
    }
    setSyncing(true);
    try {
      const result = await TripSyncService.syncTripsToCloud(token);
      toast.success(`${result.synced} Touren synchronisiert`);
      loadTrips();
    } catch (error) {
      toast.error('Sync-Fehler');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = (trip, format) => {
    if (format === 'json') {
      TripSyncService.exportTripAsJSON(trip);
      toast.success('Als JSON exportiert');
    } else if (format === 'csv') {
      TripSyncService.exportTripAsCSV(trip);
      toast.success('Als CSV exportiert');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full mx-auto mb-2"></div>
        <p className="text-gray-400 text-sm">Touren werden geladen...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header mit Sync */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-cyan-300">Tour-Verlauf</h3>
          <p className="text-xs text-gray-400">
            {stats && `${stats.totalTrips} Touren • ${stats.pendingTrips} ausstehend • ~${stats.estimatedSizeMB}MB`}
          </p>
        </div>
        <button type="button"
          onClick={handleSync}
          disabled={syncing || !stats?.pendingTrips}
          className={`px-4 py-2 rounded font-semibold text-sm flex items-center gap-2 transition ${
            syncing
              ? 'bg-gray-700 text-gray-400 cursor-wait'
              : stats?.pendingTrips
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                : 'bg-gray-700 text-gray-400'
          }`}
        >
          <Cloud className="w-4 h-4" />
          {syncing ? 'Wird synchronisiert...' : `Synchen (${stats?.pendingTrips || 0})`}
        </button>
      </div>

      {/* Online Status */}
      {!navigator.onLine && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400" />
          <span className="text-xs text-yellow-300">Du bist offline - Touren werden lokal gespeichert</span>
        </div>
      )}

      {/* Tour-Liste */}
      {trips.length === 0 ? (
        <div className="text-center py-8 bg-gray-800 border border-gray-700 rounded-lg">
          <Fish className="w-8 h-8 text-gray-500 mx-auto mb-2 opacity-50" />
          <p className="text-gray-400 text-sm">Noch keine Touren gespeichert</p>
          <p className="text-xs text-gray-500 mt-1">Starte eine neue Tour um zu beginnen</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-3 hover:border-gray-600 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Datum + Zeit */}
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-cyan-300">
                      {new Date(trip.startTime).toLocaleDateString('de-DE')}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(trip.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
                    <div className="bg-gray-700/50 rounded px-2 py-1">
                      
                      <span className="text-cyan-300 font-semibold">{trip.stats.duration}</span>
                    </div>
                    <div className="bg-gray-700/50 rounded px-2 py-1">
                      
                      <span className="text-cyan-300 font-semibold">{trip.stats.distance}km</span>
                    </div>
                    <div className="bg-gray-700/50 rounded px-2 py-1">
                      
                      <span className="text-cyan-300 font-semibold">{trip.catches?.length || 0}</span>
                    </div>
                  </div>

                  {/* Sync Status */}
                  {trip.syncStatus === 'synced' && (
                    <div className="flex items-center gap-1 text-xs text-green-400">
                      <Cloud className="w-3 h-3" />
                      Synchronisiert
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <button type="button"
                    onClick={() => handleExport(trip, 'json')}
                    title="Als JSON exportieren"
                    className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded transition text-gray-300 hover:text-cyan-300"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button type="button"
                    onClick={() => handleExport(trip, 'csv')}
                    title="Als CSV exportieren"
                    className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded transition text-gray-300 hover:text-cyan-300"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button type="button"
                    onClick={() => handleDelete(trip.id)}
                    title="Löschen"
                    className="p-1.5 bg-red-900/30 hover:bg-red-900/50 rounded transition text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Fang-Zusammenfassung */}
              {trip.catches && trip.catches.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="text-xs text-gray-400">Fänge:</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {trip.catches.slice(0, 5).map((catch_, idx) => (
                      <span
                        key={idx}
                        className="inline-block px-2 py-0.5 bg-green-900/30 text-green-300 rounded text-xs"
                      >
                        {catch_.species} {catch_.weight ? `(${catch_.weight}g)` : ''}
                      </span>
                    ))}
                    {trip.catches.length > 5 && (
                      <span className="inline-block px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
                        +{trip.catches.length - 5} mehr
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="bg-gray-800/50 rounded-lg p-2 text-xs text-gray-400 italic">
        Touren werden automatisch lokal gespeichert. Bei Internetverbindung werden sie automatisch synchronisiert.
      </div>
    </div>
  );
}

export default TripHistory;
