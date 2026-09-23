import { useSearchParams } from 'react-router-dom';
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { functions } from "@/api/frontendClient";
import { Spot } from "@/entities/Spot";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { toast } from "sonner";
import { useLocation } from "@/components/location/LocationManager";
import AddSpotModal from "@/components/map/v2/AddSpotModal";
import SpotDetailPanel from "@/components/map/SpotDetailPanel";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import MapLayerControls from "@/components/map/v2/MapLayerControls";
import HillshadeLayer from "@/components/map/v2/HillshadeLayer";
import Terrain3DLayer from "@/components/map/v2/Terrain3DLayer";
import HydrographicAnalysis from "@/components/map/v2/HydrographicAnalysis";
import SatelliteOverlayLayer from "@/components/map/v2/SatelliteOverlayLayer";
import AdvancedCacheManager from "@/components/map/v2/AdvancedCacheManager";
import MapNavigationHub from "@/components/map/MapNavigationHub";
import MapModeManager from "@/components/map/MapModeManager";
import { RadarLayer, useRainviewerRadar, RADAR_MODES } from "@/components/map/RadarOverlay";
import { MapPin, CloudRain, Crosshair, Play, Pause, ChevronDown, Sunrise, Ticket } from "lucide-react";
import SunriseSunsetPanel from "@/components/map/SunriseSunsetPanel";
import PublicSpotsClusterLayer from "@/components/map/PublicSpotsClusterLayer";
import { PERMIT_LOCATIONS, CATEGORY_LABELS, GERMAN_STATES } from "@/data/permitLocations";
import angelparksExport from "@/data/angelparks-export.json";

// Statische Angelvereine & Parks (~700). Diese Standorte liegen als Datendatei
// vor (nicht in der DB) und werden in die öffentlichen Spots gemerged, damit die
// Karte tatsächlich die versprochenen ~700 Orte zeigt.
const STATIC_PUBLIC_LOCATIONS = (Array.isArray(angelparksExport) ? angelparksExport : [])
  .filter((p) => p?.coordinates?.lat != null && p?.coordinates?.lng != null)
  .map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category || "club",
    coordinates: { lat: Number(p.coordinates.lat), lng: Number(p.coordinates.lng) },
    address: p.address,
    website: p.website,
    phone: p.phone,
    source: p.source,
  }));

// Leaflet CSS laden
if (typeof document !== "undefined") {
  const existingLink = document.querySelector('link[data-leaflet]');
  if (!existingLink) {
    const link = document.createElement("link");
    link.setAttribute("data-leaflet", "1");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
}

// Standard Leaflet Icons - Fix für className
const createIcon = (iconUrl, shadowUrl) => {
  return L.icon({
    iconUrl,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    className: '' // Leerer String statt undefined
  });
};

const defaultIcon = createIcon(
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
);

const userIcon = createIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
);

const orangeIcon = createIcon(
  "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
);

function MapController({ center, zoom }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || 13);
    }
  }, [center, zoom, map]);
  
  return null;
}

function MapClickHandler({ onMapClick }) {
  const map = useMap();
  
  useEffect(() => {
    const handleClick = (e) => {
      onMapClick(e.latlng);
    };
    
    map.on('click', handleClick);
    
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onMapClick]);
  
  return null;
}

export default function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  useFeatureTracking("map");
  const { currentLocation, gpsLocation, requestGpsLocation } = useLocation();
  const [spots, setSpots] = useState([]);
  const [publicLocations, setPublicLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [clickedCoords, setClickedCoords] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState([51.1657, 10.4515]);
  const [mapZoom, setMapZoom] = useState(6);
  const [nearestSpot, setNearestSpot] = useState(null);
  const [travelInfo, setTravelInfo] = useState(null);
  const [showHillshade, setShowHillshade] = useState(false);
  const [show3DTerrain, setShow3DTerrain] = useState(false);
  const [showHydrographic, setShowHydrographic] = useState(false);
  const [showSatellite, setShowSatellite] = useState(false);
  const [mapMode, setMapMode] = useState(() => {
    return localStorage.getItem('mapMode') || 'guided';
  });
  const [isFirstTime, setIsFirstTime] = useState(() => {
    return !localStorage.getItem('mapTourCompleted');
  });
  const [showPublicSpots, setShowPublicSpots] = useState(false);
  const [showPermitLocations, setShowPermitLocations] = useState(false);
  const [permitStateFilter, setPermitStateFilter] = useState("all");
  // Ansicht: Spots-Karte, Wetter-Radar oder Beiszeiten-Rechner
  const [mapView, setMapView] = useState("spots");
  const [showDetails, setShowDetails] = useState(false);
  const radar = useRainviewerRadar(mapView === "radar");
  useEffect(() => {
    if (searchParams.get('addSpot') === '1' && currentLocation?.lat != null) {
      setClickedCoords({ lat: currentLocation.lat, lng: currentLocation.lon });
      setShowAddModal(true);
      setSearchParams({}, { replace: true });
    }
    const selected = spots.find(spot => String(spot.id) === searchParams.get('spot'));
    if (selected) { setSelectedLocation({ ...selected, type: 'spot' }); setMapCenter([Number(selected.latitude), Number(selected.longitude)]); setMapZoom(14); }
  }, [searchParams, setSearchParams, currentLocation, spots]);

  useEffect(() => {
    loadMapData();
  }, []);

  const handleLocateMe = useCallback(() => {
    requestGpsLocation?.();
  }, [requestGpsLocation]);

  useEffect(() => {
    if (gpsLocation) {
      setMapCenter([gpsLocation.lat, gpsLocation.lon]);
      setMapZoom(13);
      findNearestSpot();
    } else if (currentLocation) {
      setMapCenter([currentLocation.lat, currentLocation.lon]);
      setMapZoom(13);
    }
  }, [gpsLocation, currentLocation]);

  const findNearestSpot = useCallback(async () => {
    if (!gpsLocation || spots.length === 0) return;

    let nearest = null;
    let minDistance = Infinity;

    spots.forEach(spot => {
      const distance = calculateDistance(
        gpsLocation.lat,
        gpsLocation.lon,
        spot.latitude,
        spot.longitude
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = spot;
      }
    });

    if (nearest) {
      setNearestSpot(nearest);
      calculateTravelTime(nearest);
    }
  }, [gpsLocation, spots]);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const parsePublicSpots = (response) => {
    let locations = [];
    if (Array.isArray(response?.features)) {
      locations = response.features
        .filter(f => f?.geometry?.coordinates?.length >= 2)
        .map(feature => ({
          id: feature.properties?.id,
          name: feature.properties?.name,
          category: feature.properties?.category,
          coordinates: {
            lng: feature.geometry.coordinates[0],
            lat: feature.geometry.coordinates[1]
          },
          address: feature.properties?.address,
          website: feature.properties?.website,
          source: feature.properties?.source
        }));
    } else if (Array.isArray(response?.hotspots)) {
      locations = response.hotspots
        .filter(h => h.latitude != null && h.longitude != null)
        .map(h => ({
          id: h.id,
          name: h.name,
          category: h.category || 'spot',
          water_type: h.water_type,
          coordinates: {
            lat: Number(h.latitude),
            lng: Number(h.longitude)
          }
        }));
    }
    return locations;
  };

  // Backend-Hotspots (DB) mit den statischen Angelvereinen/Parks (~700)
  // zusammenführen. Backend-Einträge haben Vorrang; Dedupe über die id.
  const mergePublicLocations = (backendLocations) => {
    const seen = new Set();
    const merged = [];
    for (const loc of backendLocations) {
      if (loc?.id != null && seen.has(loc.id)) continue;
      if (loc?.id != null) seen.add(loc.id);
      merged.push(loc);
    }
    for (const loc of STATIC_PUBLIC_LOCATIONS) {
      if (loc.id != null && seen.has(loc.id)) continue;
      if (loc.id != null) seen.add(loc.id);
      merged.push(loc);
    }
    return merged;
  };

  const calculateTravelTime = useCallback(async (spot) => {
    if (!gpsLocation) return;

    try {
      const response = await functions.invoke('calculateTravelTime', {
        fromLat: gpsLocation.lat,
        fromLon: gpsLocation.lon,
        toLat: spot.latitude,
        toLon: spot.longitude
      });

      if (response.data) {
        setTravelInfo(response.data);
      }
    } catch (error) {
      console.error('Fehler bei Fahrzeitberechnung:', error);
    }
  }, [gpsLocation]);

  const loadMapData = useCallback(async () => {
    setLoading(true);
    try {
      const userSpots = await Spot.list();
      const safeUserSpots = Array.isArray(userSpots) ? userSpots : [];
      setSpots(safeUserSpots);

      if (safeUserSpots.length > 0) {
        toast.success("Deine Spots geladen", {
          description: `${safeUserSpots.length} eigene Spots gefunden`,
          duration: 2000
        });
      }
    } catch (error) {
      console.error("Fehler beim Laden der Karten-Daten:", error);
      toast.error("Fehler beim Laden der Spots");
      setSpots([]);
    }

    try {
      const response = await functions.invoke('angelspotsGeojson');
      const locations = mergePublicLocations(parsePublicSpots(response));
      if (locations.length > 0) {
        setPublicLocations(locations);
        setShowPublicSpots(true);
      }
    } catch (error) {
      console.error("Fehler beim Laden öffentlicher Spots:", error);
      // Auch ohne Backend zeigen wir wenigstens die statischen ~700 Angelparks.
      setPublicLocations(mergePublicLocations([]));
      setShowPublicSpots(true);
    }

    setLoading(false);
  }, []);

  const loadPublicSpots = useCallback(async () => {
    try {
      const response = await functions.invoke('angelspotsGeojson');
      const locations = mergePublicLocations(parsePublicSpots(response));
      setPublicLocations(locations);
      setShowPublicSpots(true);

      toast.success("Öffentliche Spots geladen", {
        description: `${locations.length} Angelvereine & Parks`,
        duration: 2000
      });
    } catch (error) {
      console.error("Fehler beim Laden öffentlicher Spots:", error);
      const locations = mergePublicLocations([]);
      setPublicLocations(locations);
      setShowPublicSpots(true);
      toast.success("Öffentliche Spots geladen", {
        description: `${locations.length} Angelvereine & Parks`,
        duration: 2000
      });
    }
  }, []);

  const handleMapClick = useCallback((latlng) => {
    setClickedCoords({ lat: latlng.lat, lng: latlng.lng });
    setShowAddModal(true);
  }, []);

  const handleAddSpot = useCallback(async () => {
    await loadMapData();
    setShowAddModal(false);
    setClickedCoords(null);
  }, [loadMapData]);

  const handleCloseModal = useCallback(() => {
    setShowAddModal(false);
    setClickedCoords(null);
  }, []);

  const handleModeChange = useCallback((newMode) => {
    setMapMode(newMode);
    localStorage.setItem('mapMode', newMode);
    toast.success(`Modus gewechselt zu ${newMode === 'guided' ? 'Geführt' : newMode === 'simple' ? 'Einfach' : 'Erweitert'}`);
  }, []);

  const validSpots = useMemo(() =>
    spots.filter(s => s.latitude != null && s.longitude != null),
    [spots]
  );

  const validPublicLocations = useMemo(() =>
    publicLocations.filter(l => l.coordinates?.lat != null && l.coordinates?.lng != null),
    [publicLocations]
  );

  const filteredPermitLocations = useMemo(() => {
    if (permitStateFilter === "all") return PERMIT_LOCATIONS;
    return PERMIT_LOCATIONS.filter(l => l.state === permitStateFilter);
  }, [permitStateFilter]);

  const biteZeitCoords = useMemo(() => {
    if (gpsLocation) return { lat: gpsLocation.lat, lon: gpsLocation.lon, label: 'GPS-Standort' };
    return { lat: mapCenter[0], lon: mapCenter[1], label: 'Kartenmittelpunkt' };
  }, [gpsLocation, mapCenter]);

  const handleFeatureSelect = useCallback((featureId) => {
    switch(featureId) {
      case 'relief-shading':
        setShowHillshade(v => !v);
        break;
      case '3d-terrain':
        setShow3DTerrain(v => !v);
        break;
      case 'satellite':
        setShowSatellite(v => !v);
        break;
      case 'hydrographic':
        setShowHydrographic(v => !v);
        break;
      default:
        toast.info(`Feature "${featureId}" wurde selektiert`);
    }
  }, []);

  if (loading) {
    return (
      <div className="bb-page flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <div style={{ color: 'var(--bb-cyan)' }}>Lade Karten-Daten...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 overflow-y-auto" style={{ background: 'var(--bb-bg)' }}>
      {/* Mode Manager & Guided Tour */}
      <MapModeManager
        mapMode={mapMode}
        onModeChange={handleModeChange}
        isFirstTime={isFirstTime}
        onTourComplete={() => setIsFirstTime(false)}
      />

      <div className="max-w-7xl mx-auto p-4 space-y-4 min-h-screen">
        {/* Removed: NewFeaturesNotification - Alle Infos sind jetzt im MapNavigationHub */}
        {/* Removed: MapFeaturesInfo - Integriert in MapNavigationHub */}

        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg sm:text-2xl font-bold" style={{ color: 'var(--bb-cyan)' }}>
            Karte & Spots
          </h1>
          <button type="button"
            onClick={() => setShowDetails(v => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-gray-800/70 border border-gray-700 text-gray-300 hover:bg-gray-700/70 transition-colors"
          >
            Details
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Umschalter: Spots | Wetter-Radar | Beiszeiten */}
        <div className="flex p-1 rounded-xl bg-gray-900/70 border border-gray-800 gap-1">
          <button type="button"
            onClick={() => setMapView("spots")}
            aria-pressed={mapView === "spots"}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mapView === "spots"
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/40"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <MapPin className="w-4 h-4" />
            Spots
          </button>
          <button type="button"
            onClick={() => setMapView("radar")}
            aria-pressed={mapView === "radar"}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mapView === "radar"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <CloudRain className="w-4 h-4" />
            Radar
          </button>
          <button type="button"
            onClick={() => setMapView("bitezeit")}
            aria-pressed={mapView === "bitezeit"}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mapView === "bitezeit"
                ? "bg-amber-600 text-white shadow-lg shadow-amber-900/40"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Sunrise className="w-4 h-4" />
            Beiszeiten
          </button>
        </div>

        {/* Radar-Modus-Auswahl (nur im Radar-Modus) */}
        {mapView === "radar" && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {Object.entries(RADAR_MODES).map(([key, val]) => (
              <button type="button"
                key={key}
                onClick={() => radar.setMode(key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  radar.mode === key
                    ? "bg-emerald-600/30 border-emerald-400 text-emerald-200"
                    : "bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-700/50"
                }`}
              >
                {val.name}
              </button>
            ))}
          </div>
        )}

        {/* Einklappbare Detail-Karten */}
        {showDetails && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bb-card" style={{ borderColor: 'rgba(14,116,144,.7)', background: 'rgba(22,78,99,.2)' }}>
            <div className="p-4">
              <div className="text-xs text-cyan-400 mb-2 font-semibold">6 ADVANCED FEATURES</div>
              <div className="space-y-1 text-xs text-cyan-200">
                <div>Offline Tile-Caching</div>
                <div>Relief-Shading</div>
                <div>3D-Terrain</div>
                <div>Hydrographische Daten</div>
                <div>Satelliten-Bilder</div>
                <div>Cache-Optimierung</div>
              </div>
              <div className="text-xs text-cyan-600 mt-2 italic">
                Klick den Hub rechts unten um Features zu aktivieren
              </div>
            </div>
          </div>

          <div className="bb-card">
            <div className="p-4">
              <div className="text-xs mb-2" style={{ color: 'var(--bb-muted)' }}>DEINE SPOTS & ORTE</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">Deine Spots:</span>
                  <span className="text-cyan-400 font-semibold">{spots.length}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-300">Angelvereine & Parks:</span>
                  <span className="text-green-400 font-semibold">{showPublicSpots ? publicLocations.length : '0'}</span>
                </div>
                {!showPublicSpots && (
                  <button type="button"
                    onClick={loadPublicSpots}
                    className="w-full mt-2 px-3 py-1 text-xs bg-green-900/50 hover:bg-green-800 text-green-300 rounded border border-green-700 transition-colors"
                  >
                    Öffentliche Spots laden (~700)
                  </button>
                )}
                {showPublicSpots && (
                  <button type="button"
                    onClick={() => setShowPublicSpots(false)}
                    className="w-full mt-2 px-3 py-1 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 rounded border border-red-700 transition-colors"
                  >
                    Öffentliche Spots verbergen
                  </button>
                )}
                <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--bb-border)' }}>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-gray-300">Angelkarten-Verkaufsstellen:</span>
                    <span className="text-orange-400 font-semibold">
                      {showPermitLocations ? filteredPermitLocations.length : "0"}
                    </span>
                  </div>
                  {!showPermitLocations ? (
                    <button type="button"
                      onClick={() => setShowPermitLocations(true)}
                      className="w-full mt-2 px-3 py-1 text-xs bg-orange-900/50 hover:bg-orange-800 text-orange-300 rounded border border-orange-700 transition-colors flex items-center justify-center gap-1"
                    >
                      <Ticket className="w-3 h-3" />
                      Verkaufsstellen anzeigen ({PERMIT_LOCATIONS.length})
                    </button>
                  ) : (
                    <>
                      <select
                        value={permitStateFilter}
                        onChange={(e) => setPermitStateFilter(e.target.value)}
                        className="w-full mt-2 px-2 py-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded"
                      >
                        <option value="all">Alle Bundesländer</option>
                        {GERMAN_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                      <button type="button"
                        onClick={() => setShowPermitLocations(false)}
                        className="w-full mt-1 px-3 py-1 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 rounded border border-red-700 transition-colors"
                      >
                        Verkaufsstellen verbergen
                      </button>
                    </>
                  )}
                </div>
                {nearestSpot && travelInfo && (
                  <>
                    <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--bb-border)' }}>
                      <div className="text-xs mb-1" style={{ color: 'var(--bb-muted)' }}>Nächster Spot:</div>
                      <div className="font-semibold text-white text-sm">{nearestSpot.name}</div>
                      <div className="flex gap-2 text-xs mt-1" style={{ color: 'var(--bb-muted)' }}>
                        <span>{travelInfo.distance_km?.toFixed(1)} km</span>
                        <span>{travelInfo.duration_min} min</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        <div className="h-[calc(100dvh-15rem)] min-h-[360px] md:h-[560px] rounded-2xl overflow-hidden border-2 border-gray-800 shadow-2xl relative z-10">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Wetter-Radar-Overlay (RainViewer) – nur im Radar-Modus */}
            {mapView === 'radar' && radar.currentFrame && (
              <RadarLayer frame={radar.currentFrame} opacity={radar.opacity} mode={radar.mode} />
            )}

            {/* Advanced Map Layers */}
            <HillshadeLayer visible={showHillshade} opacity={0.4} blendMode="multiply" />
            <Terrain3DLayer visible={show3DTerrain} mode="canvas" />
            <HydrographicAnalysis
              visible={showHydrographic}
              bounds={mapCenter ? L.latLngBounds([[mapCenter[0] - 0.5, mapCenter[1] - 0.5], [mapCenter[0] + 0.5, mapCenter[1] + 0.5]]) : null}
            />
            <SatelliteOverlayLayer visible={showSatellite} opacity={0.6} />

            {/* Layer Controls */}
            <MapLayerControls
              showHillshade={showHillshade}
              show3DTerrain={show3DTerrain}
              showHydrographic={showHydrographic}
              showSatellite={showSatellite}
              onHillshadeToggle={setShowHillshade}
              on3DTerrainToggle={setShow3DTerrain}
              onHydrographicToggle={setShowHydrographic}
              onSatelliteToggle={setShowSatellite}
              hillshadeEnabled={showHillshade}
              terrain3DEnabled={show3DTerrain}
              hydrographicEnabled={showHydrographic}
              satelliteEnabled={showSatellite}
            />

            {/* Advanced Cache Manager */}
            <AdvancedCacheManager visible={true} />

            <MapController center={mapCenter} zoom={mapZoom} />
            <MapClickHandler onMapClick={handleMapClick} />

            {gpsLocation && (
              <Marker
                position={[gpsLocation.lat, gpsLocation.lon]}
                icon={userIcon}
              >
                <Popup>
                  <div className="text-center">
                    <div className="font-semibold">Dein Standort</div>
                    <div className="text-xs text-gray-600">
                      {gpsLocation.lat.toFixed(4)}, {gpsLocation.lon.toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {validSpots.map((spot) => (
              <Marker
                key={spot.id}
                position={[Number(spot.latitude), Number(spot.longitude)]}
                icon={defaultIcon}
                eventHandlers={{
                  click: () => setSelectedLocation({ ...spot, type: 'spot' })
                }}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <div className="font-semibold text-base mb-1">{spot.name}</div>
                    <div className="text-sm text-gray-600">
                      {spot.water_type && `${spot.water_type.charAt(0).toUpperCase() + spot.water_type.slice(1)}`}
                    </div>
                    {spot.depth_meters && (
                      <div className="text-xs text-gray-500 mt-1">
                        Tiefe: ~{spot.depth_meters}m
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}

            <PublicSpotsClusterLayer
              locations={validPublicLocations}
              visible={showPublicSpots}
            />

            {showPermitLocations && filteredPermitLocations.map((loc) => (
              <Marker
                key={loc.id}
                position={[loc.lat, loc.lng]}
                icon={orangeIcon}
              >
                <Popup>
                  <div style={{ minWidth: "220px", maxWidth: "280px" }}>
                    <div style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "4px" }}>
                      {loc.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#c2410c", fontWeight: "600", marginBottom: "2px" }}>
                      {CATEGORY_LABELS[loc.category]}
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>
                      {loc.state}
                    </div>
                    {loc.address && (
                      <div style={{ fontSize: "11px", color: "#4b5563" }}>{loc.address}</div>
                    )}
                    {loc.phone && (
                      <div style={{ fontSize: "11px", color: "#4b5563" }}>Tel: {loc.phone}</div>
                    )}
                    {loc.website && (
                      <div style={{ fontSize: "11px", color: "#1d4ed8" }}>{loc.website}</div>
                    )}
                    {loc.sells && loc.sells.length > 0 && (
                      <div style={{ marginTop: "6px", borderTop: "1px solid #e5e7eb", paddingTop: "4px" }}>
                        <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "2px" }}>
                          ERHÄLTLICH:
                        </div>
                        {loc.sells.map((item, i) => (
                          <div key={i} style={{ fontSize: "11px", color: "#166534" }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Schwebender Standort-Button (mobilfreundlich, oben rechts) */}
          <button type="button"
            onClick={handleLocateMe}
            aria-label="Zu meinem Standort"
            className="absolute top-3 right-3 z-[1000] w-11 h-11 flex items-center justify-center rounded-full bg-gray-900/85 border border-gray-700 text-cyan-300 shadow-lg backdrop-blur-sm active:scale-95 transition-transform"
          >
            <Crosshair className="w-5 h-5" />
          </button>

          {/* Radar-Steuerung (Zeitleiste, Play/Pause, Transparenz) */}
          {mapView === 'radar' && (
            <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-xl bg-gray-900/90 border border-gray-700 backdrop-blur-md p-3 shadow-xl">
              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => radar.setIsPlaying(!radar.isPlaying)}
                  aria-label={radar.isPlaying ? 'Pause' : 'Abspielen'}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-emerald-600 text-white active:scale-95 transition-transform"
                >
                  {radar.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max={Math.max(radar.frames.length - 1, 0)}
                  value={radar.currentIndex}
                  onChange={(e) => {
                    radar.setIsPlaying(false);
                    radar.setCurrentIndex(parseInt(e.target.value, 10));
                  }}
                  disabled={radar.frames.length === 0}
                  className="flex-1 accent-emerald-500"
                />
                <span className="shrink-0 text-xs tabular-nums w-20 text-right">
                  {radar.loading ? (
                    <span className="text-gray-400">Lade…</span>
                  ) : radar.error ? (
                    <span className="text-red-400">Fehler</span>
                  ) : radar.currentFrame ? (
                    (() => {
                      const isForecast = radar.currentFrame.time > Date.now() / 1000;
                      const t = new Date(radar.currentFrame.time * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <span className={isForecast ? 'text-amber-400' : 'text-cyan-300'}>
                          {isForecast ? 'Prognose ' : ''}{t}
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider shrink-0">Transparenz</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={radar.opacity}
                  onChange={(e) => radar.setOpacity(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500"
                />
                <span className="text-[10px] text-gray-500 shrink-0">RainViewer</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Beiszeiten-Panel — erscheint unterhalb der Karte wenn Tab aktiv */}
      {mapView === "bitezeit" && (
        <div className="rounded-2xl border border-amber-700/40 bg-gray-900/80 p-4 shadow-xl">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
            <Sunrise className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
              Sonnenzeiten & Beiszeiten
            </h2>
          </div>
          <SunriseSunsetPanel
            lat={biteZeitCoords.lat}
            lon={biteZeitCoords.lon}
            locationLabel={biteZeitCoords.label}
          />
        </div>
      )}

      {showAddModal && (
        <AddSpotModal
          isOpen={showAddModal}
          onClose={handleCloseModal}
          onSave={handleAddSpot}
          initialCoords={clickedCoords}
        />
      )}

      {selectedLocation && (
        <SpotDetailPanel
          spot={selectedLocation}
          onClose={() => setSelectedLocation(null)}
          onUpdate={loadMapData}
        />
      )}

      {/* Map Navigation Hub - Zentrale Steuerstelle */}
      <MapNavigationHub
        onFeatureSelect={handleFeatureSelect}
        onModeChange={handleModeChange}
        currentMode={mapMode}
      />
    </div>
  );
}