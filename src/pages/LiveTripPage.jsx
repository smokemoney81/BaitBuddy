import React, { useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause, X, Plus, Droplets, Moon, Sparkles, Bell } from 'lucide-react';
import { toast } from 'sonner';
import TideWidget from '../components/LiveTrip/TideWidget';
import SolunarWidget from '../components/LiveTrip/SolunarWidget';
import PredictionWidget from '../components/LiveTrip/PredictionWidget';
import NotificationSettings from '../components/LiveTrip/NotificationSettings';
import TripHistory from '../components/LiveTrip/TripHistory';
import SafetyMode from '../components/weather/SafetyMode';

/**
 * LiveTripPage - Live-Angeltour mit GPS-Tracking
 * - GPS-Tracking der Route
 * - Echtzeitstatistiken
 * - Fang-Logging mit Position
 * - Offline-Daten-Speicherung
 */
function LiveTripPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [tripData, setTripData] = useState({
    startTime: null,
    pausedTime: 0,
    route: [],
    catches: [],
    stats: {
      distance: 0,
      duration: 0,
      speed: 0,
      maxSpeed: 0,
    },
  });

  const [currentLocation, setCurrentLocation] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [showCatchModal, setShowCatchModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [mapCenter, setMapCenter] = useState([51.1657, 10.4515]);
  const [infoTab, setInfoTab] = useState('tides'); // 'tides', 'solunar', 'prediction'
  const routeRef = useRef([]);
  const startTimeRef = useRef(null);
  const pauseStartRef = useRef(null);
  const lastLocationRef = useRef(null);

  // GPS-Tracking starten
  const startTrip = () => {
    if (!navigator.geolocation) {
      toast.error('GPS wird nicht unterstützt');
      return;
    }

    setIsRecording(true);
    startTimeRef.current = Date.now();

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed } = position.coords;
        const newLocation = { latitude, longitude, accuracy, speed, timestamp: Date.now() };

        setCurrentLocation(newLocation);
        setMapCenter([latitude, longitude]);

        // Route punkt speichern
        if (!isPaused) {
          routeRef.current.push(newLocation);
          updateStats(newLocation);
        }
      },
      (error) => {
        console.error('GPS Fehler:', error);
        toast.error('GPS-Fehler: ' + error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );

    setWatchId(id);
    toast.success('Live-Tour gestartet');
  };

  const pauseTrip = () => {
    setIsPaused(true);
    pauseStartRef.current = Date.now();
    toast.info('Tour pausiert');
  };

  const resumeTrip = () => {
    setIsPaused(false);
    if (pauseStartRef.current) {
      setTripData(prev => ({
        ...prev,
        pausedTime: prev.pausedTime + (Date.now() - pauseStartRef.current),
      }));
    }
    toast.info('Tour fortgesetzt');
  };

  const endTrip = async () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }
    setIsRecording(false);

    // Trip speichern
    const duration = ((Date.now() - startTimeRef.current) - tripData.pausedTime) / 1000;
    const distance = calculateTotalDistance(routeRef.current);

    const finalTrip = {
      id: `trip_${Date.now()}`,
      startTime: startTimeRef.current,
      endTime: Date.now(),
      route: routeRef.current,
      catches: tripData.catches,
      stats: {
        distance: (distance / 1000).toFixed(2), // km
        duration: formatDuration(duration),
        durationSeconds: duration,
        catches: tripData.catches.length,
        catchRate: (tripData.catches.length / (duration / 3600)).toFixed(2), // Fische/Stunde
      },
    };

    // Speichern
    await saveTripOffline(finalTrip);

    toast.success('Tour beendet und gespeichert');
    setTripData({ ...tripData, route: [], catches: [] });
    routeRef.current = [];
  };

  const updateStats = (newLocation) => {
    if (lastLocationRef.current) {
      const distance = calculateDistance(
        lastLocationRef.current.latitude,
        lastLocationRef.current.longitude,
        newLocation.latitude,
        newLocation.longitude
      );

      setTripData(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          distance: (prev.stats.distance + distance).toFixed(2),
          speed: (newLocation.speed || 0).toFixed(1),
          maxSpeed: Math.max(prev.stats.maxSpeed, newLocation.speed || 0).toFixed(1),
          duration: formatDuration((Date.now() - startTimeRef.current - tripData.pausedTime) / 1000),
        },
      }));
    }

    lastLocationRef.current = newLocation;
  };

  const addCatch = (catchData) => {
    if (!currentLocation) {
      toast.error('GPS-Position nicht verfügbar');
      return;
    }

    const newCatch = {
      id: `catch_${Date.now()}`,
      timestamp: Date.now(),
      location: {
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
      },
      species: catchData.species,
      weight: catchData.weight,
      length: catchData.length,
      photo: catchData.photo,
      notes: catchData.notes,
    };

    setTripData(prev => ({
      ...prev,
      catches: [...prev.catches, newCatch],
    }));

    toast.success(`${catchData.species} geloggt!`);
    setShowCatchModal(false);
  };

  // Hilfsfunktionen
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const calculateTotalDistance = (route) => {
    let total = 0;
    for (let i = 1; i < route.length; i++) {
      total += calculateDistance(
        route[i - 1].latitude,
        route[i - 1].longitude,
        route[i].latitude,
        route[i].longitude
      );
    }
    return total;
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const saveTripOffline = async (trip) => {
    try {
      const trips = JSON.parse(localStorage.getItem('liveTrips') || '[]');
      trips.push(trip);
      localStorage.setItem('liveTrips', JSON.stringify(trips));

      // Auch in IndexedDB für größere Daten
      const db = await openIndexedDB();
      const tx = db.transaction('trips', 'readwrite');
      tx.objectStore('trips').add(trip);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    }
  };

  const openIndexedDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('BaitBuddy_LiveTrips', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('trips')) {
          db.createObjectStore('trips', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  // Marker-Icons
  const currentIcon = L.divIcon({
    html: `<div style="
      width: 30px;
      height: 30px;
      background: #3b82f6;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
    "></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  const catchIcon = L.divIcon({
    html: `<div style="
      font-size: 24px;
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gray-900/95 border-b border-cyan-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-400">Live-Tour</h1>
            <p className="text-xs text-gray-400 mt-1">
              GPS-Tracking, Fang-Logging & Echtzeit-Statistiken
            </p>
          </div>
          <button type="button"
            onClick={() => setShowNotificationSettings(true)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition border border-gray-700 flex items-center gap-2"
            title="Benachrichtigungseinstellungen"
          >
            <Bell className="w-5 h-5 text-yellow-400" />
            <span className="text-xs text-gray-300">Benachrichtigungen</span>
          </button>
        </div>
      </div>

      {/* Sicherheitsmodus */}
      {currentLocation && (
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <SafetyMode
            lat={currentLocation.latitude}
            lon={currentLocation.longitude}
            tripActive={isRecording}
            onPauseTrip={!isPaused ? pauseTrip : resumeTrip}
            onEndTrip={endTrip}
          />
        </div>
      )}

      {/* Hauptbereich */}
      <div className="max-w-7xl mx-auto p-4">
        {!isRecording ? (
          // Start-Screen
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border border-cyan-700 rounded-lg p-6">
              <h2 className="text-xl font-bold text-cyan-300 mb-4">Neue Tour starten</h2>
              <div className="space-y-3 mb-6">
                <div className="text-sm text-gray-300">
                  <strong>Was wird getrackt:</strong>
                  <ul className="mt-2 space-y-1 text-xs text-gray-400">
                    <li>GPS-Position (hochpräzise)</li>
                    <li>Komplette Route</li>
                    <li>Zeit & Geschwindigkeit</li>
                    <li>Alle Fänge mit Position</li>
                    <li>Live-Statistiken</li>
                  </ul>
                </div>
              </div>

              <button type="button"
                onClick={startTrip}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                <Play className="w-5 h-5" />
                Tour starten
              </button>
            </div>

            {/* Touren-Verlauf */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <TripHistory />
            </div>
          </div>
        ) : (
          // Live-Recording Screen
          <div className="space-y-4">
            {/* Live-Statistiken */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400">DAUER</div>
                <div className="text-lg font-bold text-cyan-400">{tripData.stats.duration}</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400">DISTANZ</div>
                <div className="text-lg font-bold text-cyan-400">{tripData.stats.distance} km</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400">SPEED</div>
                <div className="text-lg font-bold text-cyan-400">{tripData.stats.speed} km/h</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400">FÄNGE</div>
                <div className="text-lg font-bold text-cyan-400">{tripData.catches.length}</div>
              </div>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="text-xs text-gray-400">GPS</div>
                <div className={`text-lg font-bold ${currentLocation ? 'text-green-400' : 'text-red-400'}`}>
                  {currentLocation ? 'Aktiv' : 'Suche'}
                </div>
              </div>
            </div>

            {/* Karte + Gezeiten Seite-an-Seite */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Karte */}
              <div className="lg:col-span-2 h-[400px] rounded-lg overflow-hidden border-2 border-gray-700">
                {currentLocation && (
                  <MapContainer
                    center={[currentLocation.latitude, currentLocation.longitude]}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Route */}
                    {routeRef.current.length > 1 && (
                      <Polyline
                        positions={routeRef.current.map(p => [p.latitude, p.longitude])}
                        color="#0ea5e9"
                        weight={3}
                        opacity={0.7}
                      />
                    )}

                    {/* Aktuelle Position */}
                    <Marker
                      position={[currentLocation.latitude, currentLocation.longitude]}
                      icon={currentIcon}
                    >
                      <Popup>
                        <div className="text-sm">
                          <strong>Aktuelle Position</strong>
                          <p className="text-xs text-gray-600 mt-1">
                            {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                          </p>
                        </div>
                      </Popup>
                    </Marker>

                    {/* Fänge */}
                    {tripData.catches.map(catch_ => (
                      <Marker
                        key={catch_.id}
                        position={[catch_.location.lat, catch_.location.lng]}
                        icon={catchIcon}
                      >
                        <Popup>
                          <div className="text-sm">
                            <strong>{catch_.species}</strong>
                            <p className="text-xs text-gray-600 mt-1">
                              {catch_.weight && `${catch_.weight}g • `}
                              {catch_.length && `${catch_.length}cm`}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                )}
              </div>

              {/* Gezeiten + Solunar Widgets mit Tabs */}
              <div className="h-[400px] flex flex-col">
                {/* Tab-Navigation */}
                <div className="flex gap-2 border-b border-gray-700 p-2 bg-gray-800/50">
                  <button type="button"
                    onClick={() => setInfoTab('tides')}
                    className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition ${
                      infoTab === 'tides'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Droplets className="w-3 h-3" />
                    Gezeiten
                  </button>
                  <button type="button"
                    onClick={() => setInfoTab('solunar')}
                    className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition ${
                      infoTab === 'solunar'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Moon className="w-3 h-3" />
                    Solunar
                  </button>
                  <button type="button"
                    onClick={() => setInfoTab('prediction')}
                    className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition ${
                      infoTab === 'prediction'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    KI-Vorhersage
                  </button>
                </div>

                {/* Tab-Content */}
                <div className="flex-1 overflow-y-auto p-3">
                  {currentLocation && (
                    <>
                      {infoTab === 'tides' && (
                        <TideWidget
                          latitude={currentLocation.latitude}
                          longitude={currentLocation.longitude}
                          isActive={isRecording}
                        />
                      )}
                      {infoTab === 'solunar' && (
                        <SolunarWidget
                          latitude={currentLocation.latitude}
                          longitude={currentLocation.longitude}
                          isActive={isRecording}
                        />
                      )}
                      {infoTab === 'prediction' && (
                        <PredictionWidget
                          latitude={currentLocation.latitude}
                          longitude={currentLocation.longitude}
                          isActive={isRecording}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Fang-Logger + Kontrolle */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button type="button"
                onClick={() => setShowCatchModal(true)}
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <Plus className="w-5 h-5" />
                Fang hinzufügen
              </button>

              {!isPaused ? (
                <button type="button"
                  onClick={pauseTrip}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition"
                >
                  <Pause className="w-5 h-5" />
                  Pausieren
                </button>
              ) : (
                <button type="button"
                  onClick={resumeTrip}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition"
                >
                  <Play className="w-5 h-5" />
                  Fortsetzen
                </button>
              )}

              <button type="button"
                onClick={endTrip}
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <X className="w-5 h-5" />
                Tour beenden
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fang-Modal */}
      {showCatchModal && (
        <CatchLoggerModal
          onClose={() => setShowCatchModal(false)}
          onSave={addCatch}
        />
      )}

      {/* Benachrichtigungen-Einstellungen */}
      <NotificationSettings
        isOpen={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
      />
    </div>
  );
}

// Fang-Logger Modal
function CatchLoggerModal({ onClose, onSave }) {
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    if (!species) {
      toast.error('Bitte Fischart auswählen');
      return;
    }
    onSave({ species, weight, length, notes });
  };

  const commonSpecies = ['Hecht', 'Barsch', 'Forelle', 'Schleie', 'Aal', 'Karpfen'];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-cyan-700 rounded-lg shadow-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-cyan-300 mb-4">Fang hinzufügen</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400">Fischart *</label>
            <select
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            >
              <option value="">— Wählen —</option>
              {commonSpecies.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400">Gewicht (g)</label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="z.B. 1500"
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">Länge (cm)</label>
              <input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="z.B. 65"
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400">Notizen</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Köder, Technik, Bedingungen..."
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
              rows="3"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button type="button"
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2 rounded transition"
          >
            Abbrechen
          </button>
          <button type="button"
            onClick={handleSave}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold py-2 rounded transition"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

export default LiveTripPage;
