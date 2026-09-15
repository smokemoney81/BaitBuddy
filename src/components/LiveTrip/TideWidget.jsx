import React, { useState, useEffect } from 'react';
import { Droplets, AlertCircle } from 'lucide-react';
import TideService from '../../services/TideService';

function TideWidget({ latitude, longitude, isActive }) {
  const [tideData, setTideData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isActive || !latitude || !longitude) return;

    const fetchTideData = async () => {
      try {
        setLoading(true);
        const data = await TideService.getCurrentAndForecastTides(latitude, longitude);
        setTideData(data);
        setError(null);
      } catch (err) {
        console.error('Fehler beim Laden der Gezeitendaten:', err);
        setError('Gezeitendaten nicht verfügbar');
      } finally {
        setLoading(false);
      }
    };

    fetchTideData();

    // Aktualisiere alle 10 Minuten
    const interval = setInterval(fetchTideData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [latitude, longitude, isActive]);

  if (!isActive) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
        <Droplets className="w-4 h-4 text-gray-500 mx-auto mb-1" />
        <div className="text-xs text-gray-400">Gezeiten werden geladen...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
        <Droplets className="w-4 h-4 text-cyan-500 mx-auto mb-1 animate-pulse" />
        <div className="text-xs text-gray-400">Gezeitendaten werden abgerufen...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-300">{error}</div>
        </div>
      </div>
    );
  }

  if (!tideData || !tideData.current) {
    return null;
  }

  const current = tideData.current;
  const recommendation = TideService.getTideRecommendation(current);

  return (
    <div className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border border-blue-600/50 rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-400" />
          <div>
            <div className="text-xs font-semibold text-blue-300">Gezeiten</div>
            <div className="text-xs text-gray-400">{tideData?.station?.name || 'Standort'}</div>
          </div>
        </div>
      </div>

      {/* Current Tide State */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/50 rounded p-2">
          <div className="text-2xl text-center mb-1">{current.typeEmoji}</div>
          <div className="text-xs text-gray-300 text-center font-semibold">{current.type}</div>
          <div className="text-sm font-bold text-blue-300 text-center mt-1">{current.height}m</div>
        </div>

        <div className="bg-gray-800/50 rounded p-2">
          <div className="text-xs text-gray-400 text-center mb-1">bis {current.nextEvent}</div>
          <div className="text-sm font-bold text-cyan-300 text-center">
            {current.timeToNext.hours}h {String(current.timeToNext.minutes).padStart(2, '0')}m
          </div>
          <div className="text-xs text-gray-400 text-center mt-1">
            {current.nextEvent === 'Hochwasser' ? '🌊' : '⬇️'}
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-2">
        <div className="text-xs text-yellow-300 font-medium">{recommendation}</div>
      </div>

      {/* Upcoming Events */}
      {tideData.upcoming && tideData.upcoming.length > 0 && (
        <div className="border-t border-gray-700 pt-2">
          <div className="text-xs text-gray-400 mb-1 font-semibold">Nächste Events:</div>
          <div className="space-y-1">
            {tideData.upcoming.slice(0, 3).map((event, idx) => (
              <div key={idx} className="flex justify-between text-xs text-gray-300">
                <span>{event.type === 'high' ? 'Hochwasser' : 'Niedrigwasser'}</span>
                <span className="text-gray-400">
                  {/* `event.date` ist bereits korrekt als UTC aufgeloest; `event.t`
                      direkt an `new Date` zu geben, wuerde den GMT-Zeitstempel als
                      Lokalzeit lesen und die Uhrzeit verschieben. */}
                  {(event.date ? new Date(event.date) : new Date(event.t))
                    .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Updated */}
      <div className="text-xs text-gray-500 text-center pt-1 border-t border-gray-700">
        Aktualisiert: {new Date(tideData.lastUpdated).toLocaleTimeString('de-DE')}
      </div>
    </div>
  );
}

export default TideWidget;
