import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { onOnlineStatusChange } from "@/utils/networkStatus";
import { Spot } from "@/entities/Spot";
import { FishingClub } from "@/entities/FishingClub";
import { angelparks } from "@/data/angelparks";
import fishingClubsCSVExport from "@/data/fishingClubsCSVExport.json";
import angelparksExport from "@/data/angelparks-export.json";
import angelshopsCSVExport from "@/data/angelshops.json";
import angelparksEuCSVExport from "@/data/angelparks_eu.json";
import tiefenkartenData from "@/data/tiefenkarten.json";
import { Button } from "@/components/ui/button";
import { MapPin, Plus, Layers, Navigation, X, Loader2, Info, Search } from "lucide-react";
import { useLocation } from "@/components/location/LocationManager";
import { toast } from "sonner";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useSound } from "@/components/utils/SoundManager";
import { useOptimisticMutation } from "@/lib/useOptimisticMutation";
import MapView from "./MapView";
import AddSpotModal from "./AddSpotModal";
import LocationDetailPanel from "./LocationDetailPanel";
import MarkerDetailCardContainer from "./MarkerDetailCard/MarkerDetailCardContainer";


function MapController() {
  const { currentLocation, requestGpsLocation, setSpotAsLocation } = useLocation();
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();
  const queryClient = useQueryClient();

  const [mapCenter, setMapCenter] = useState(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedMarkerType, setSelectedMarkerType] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSpotCoords, setNewSpotCoords] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [filters, setFilters] = useState({
    spots: true,
    clubs: true,
    parks: true,
    angelparks: true,
    waters: true,
    angelshops: true,
    angelparksEu: true,
    tiefenkarten: true,
    forellenseen: false,
    bathymetrie: false,
    fluesse: false
  });
  const [waterBodies, setWaterBodies] = useState([]);
  const [_reviews, setReviews] = useState([]);
  const [isOnlineStatus, setIsOnlineStatus] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tiefenkarten, setTiefenkarten] = useState([]);
  const [forellenseen, setForellenseen] = useState([]);
  const [bathymetryData, setBathymetryData] = useState([]);
  const [deutscheFluesse, setDeutscheFluesse] = useState([]);
  const [europeanRivers, setEuropeanRivers] = useState([]);
  const [europeanBathymetry, setEuropeanBathymetry] = useState([]);

  // Query data with react-query
  const { data: spots = [] } = useQuery({
    queryKey: ['mapSpots'],
    queryFn: () => Spot.list().catch(() => []),
    initialData: []
  });

  const { data: fishingClubs = [] } = useQuery({
    queryKey: ['mapClubs'],
    queryFn: () => FishingClub.list(),
    initialData: []
  });

  // Dedizierte Angelpark-Ebene aus dem CSV-Export.
  // Alle Einträge werden als eigene Kategorie 'angelpark' geführt, damit sie
  // auf der Karte klar als Angelparks erkennbar sind (eigener Marker/Filter).
  const allAngelparks = useMemo(() => {
    return (angelparksExport || [])
      .filter(p => p.coordinates && p.coordinates.lat != null && p.coordinates.lng != null)
      .map(p => ({ ...p, category: 'angelpark' }));
  }, []);

  // IDs der Angelpark-Ebene, um Doppel-Marker in der Vereins-Ebene zu vermeiden.
  const angelparkIds = useMemo(
    () => new Set(allAngelparks.map(p => p.id)),
    [allAngelparks]
  );

  // Merge: Backend Clubs + CSV Exports + statische Angelparks
  // Backend-Einträge > CSV-Exports > statische Parks (Dedupe per id).
  // Einträge, die bereits in der Angelpark-Ebene stecken, werden hier
  // ausgeschlossen, damit sie nicht doppelt (Verein + Angelpark) erscheinen.
  const allClubs = useMemo(() => {
    const seen = new Set((fishingClubs || []).map(fc => fc.id));
    const csvClubs = (fishingClubsCSVExport || []).filter(c => !seen.has(c.id));
    csvClubs.forEach(c => seen.add(c.id));
    const staticParks = angelparks.filter(p => !seen.has(p.id));
    return [...fishingClubs, ...csvClubs, ...staticParks]
      .filter(c => !angelparkIds.has(c.id));
  }, [fishingClubs, angelparkIds]);

  // Separate Angelshops (statische CSV-Liste)
  const allAngelshops = useMemo(() => {
    return (angelshopsCSVExport || []).filter(shop =>
      shop.category === 'angelshop' &&
      shop.coordinates &&
      shop.coordinates.lat != null &&
      shop.coordinates.lng != null
    );
  }, []);

  // Separate europäische Angelparks
  const allAngelparksEu = useMemo(() => {
    return (angelparksEuCSVExport || []).filter(park =>
      park.category === 'angelpark_eu' &&
      park.coordinates &&
      park.coordinates.lat != null &&
      park.coordinates.lng != null
    );
  }, []);

  useEffect(() => {
    initializeMap();

    const unsubscribe = onOnlineStatusChange((online) => {
      setIsOnlineStatus(online);
    });

    // Lade Tiefenkarten aus statischer JSON
    if (tiefenkartenData && Array.isArray(tiefenkartenData)) {
      setTiefenkarten(tiefenkartenData);
    }

    // Lade Forellenseen
    const loadForellenseen = async () => {
      try {
        const response = await fetch('/assets/forellenseen/forellenseen.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}: Forellenseen`);
        const data = await response.json();
        setForellenseen(data);
      } catch (error) {
        console.error('Forellenseen konnten nicht geladen werden:', error);
      }
    };

    // Lade Bathymetrie Metadaten
    const loadBathymetry = async () => {
      try {
        const response = await fetch('/assets/bathymetry/bathymetry_metadata.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}: Bathymetrie`);
        const data = await response.json();
        setBathymetryData(data.bundeslaender_list || []);
      } catch (error) {
        console.error('Bathymetrie-Metadaten konnten nicht geladen werden:', error);
      }
    };

    // Lade deutsche Flüsse
    const loadDeutscheFluesse = async () => {
      try {
        const response = await fetch('/assets/rivers/deutsche_fluesse.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}: Deutsche Flüsse`);
        const data = await response.json();
        setDeutscheFluesse(data);
      } catch (error) {
        console.error('Deutsche Flüsse konnten nicht geladen werden:', error);
      }
    };

    // Lade europäische Flüsse
    const loadEuropeanRivers = async () => {
      try {
        const response = await fetch('/assets/rivers/european_rivers.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}: Europäische Flüsse`);
        const data = await response.json();
        setEuropeanRivers(data);
      } catch (error) {
        console.error('Europäische Flüsse konnten nicht geladen werden:', error);
      }
    };

    // Lade europäische Bathymetrie
    const loadEuropeanBathymetry = async () => {
      try {
        const response = await fetch('/assets/bathymetry/european_bathymetry_metadata.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}: Europäische Bathymetrie`);
        const data = await response.json();
        setEuropeanBathymetry(data);
      } catch (error) {
        console.error('Europäische Bathymetrie konnte nicht geladen werden:', error);
      }
    };

    loadForellenseen();
    loadBathymetry();
    loadDeutscheFluesse();
    loadEuropeanRivers();
    loadEuropeanBathymetry();

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (currentLocation && currentLocation.lat != null && currentLocation.lon != null && !isInitialized) {
      setMapCenter({ lat: currentLocation.lat, lng: currentLocation.lon });
      setIsInitialized(true);
    }
  }, [currentLocation, isInitialized]);

  const initializeMap = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');
    
    if (lat && lon) {
      setMapCenter({ lat: parseFloat(lat), lng: parseFloat(lon) });
      setMapZoom(15);
      setIsInitialized(true);
    } else if (currentLocation && currentLocation.lat != null && currentLocation.lon != null) {
      setMapCenter({ lat: currentLocation.lat, lng: currentLocation.lon });
      setIsInitialized(true);
    } else {
      setMapCenter({ lat: 51.1657, lng: 10.4515 });
      setMapZoom(6);
      setIsInitialized(true);
    }
  };



  const handleMapClick = useCallback((coords) => {
    if (!showAddModal && !selectedLocation) {
      setNewSpotCoords(coords);
      triggerHaptic('light');
    }
  }, [showAddModal, selectedLocation, triggerHaptic]);

  const handleAddSpotClick = useCallback(() => {
    if (!newSpotCoords) {
      toast.warning("Bitte setze zuerst einen Pin auf der Karte");
      return;
    }
    setShowAddModal(true);
    triggerHaptic('medium');
    playSound('click');
  }, [newSpotCoords, triggerHaptic, playSound]);

  const addSpotMutation = useOptimisticMutation({
    queryKey: 'mapSpots',
    mutationFn: (spotData) => Spot.create(spotData),
    optimisticUpdate: (oldSpots = [], newSpot) => [
      { id: `tmp-${Date.now()}`, ...newSpot },
      ...oldSpots
    ],
    onSuccess: () => {
      triggerHaptic('success');
      playSound('success');
      toast.success("Spot erfolgreich hinzugefügt!");
    },
    onError: (error) => {
      console.error('Add spot error:', error);
      toast.error("Fehler beim Hinzufügen des Spots");
    },
    invalidateOnSettle: true
  });

  const _updateSpotMutation = useOptimisticMutation({
    queryKey: 'mapSpots',
    mutationFn: ({ id, data }) => Spot.update(id, data),
    optimisticUpdate: (oldSpots = [], variables) => 
      oldSpots.map(spot => 
        spot.id === variables.id ? { ...spot, ...variables.data } : spot
      ),
    onSuccess: () => {
      triggerHaptic('success');
      playSound('success');
      toast.success("Spot erfolgreich aktualisiert!");
    },
    onError: (error) => {
      console.error('Update spot error:', error);
      toast.error("Fehler beim Aktualisieren des Spots");
    },
    invalidateOnSettle: true
  });

  const _deleteSpotMutation = useOptimisticMutation({
    queryKey: 'mapSpots',
    mutationFn: (id) => Spot.delete(id),
    optimisticUpdate: (oldSpots = [], id) => 
      oldSpots.filter(spot => spot.id !== id),
    onSuccess: () => {
      triggerHaptic('success');
      playSound('success');
      toast.success("Spot erfolgreich gelöscht!");
      setSelectedLocation(null);
    },
    onError: (error) => {
      console.error('Delete spot error:', error);
      toast.error("Fehler beim Löschen des Spots");
    },
    invalidateOnSettle: true
  });

  const handleSpotAdded = useCallback(() => {
    setNewSpotCoords(null);
    setShowAddModal(false);
    // Invalidate fishingClubs as well since spots might relate to clubs
    queryClient.invalidateQueries({ queryKey: ['mapClubs'] });
  }, [queryClient]);

  // Screenreader-Statusmeldung für dynamische Kartenänderungen
  const [liveRegionMessage, setLiveRegionMessage] = useState('');

  const announceLive = useCallback((msg) => {
    setLiveRegionMessage('');
    setTimeout(() => setLiveRegionMessage(msg), 50);
  }, []);

  const handleLocationClick = useCallback((location, type) => {
    setSelectedLocation(location);
    setSelectedMarkerType(type);
    triggerHaptic('light');
    playSound('selection');
  }, [triggerHaptic, playSound]);

  const handleMyLocation = useCallback(async () => {
    triggerHaptic('medium');
    announceLive('Standort wird ermittelt...');
    await requestGpsLocation();
    if (currentLocation && currentLocation.lat != null && currentLocation.lon != null) {
      setMapCenter({ lat: currentLocation.lat, lng: currentLocation.lon });
      setMapZoom(15);
      toast.success("Standort aktualisiert");
      announceLive('Standort aktualisiert');
    }
  }, [triggerHaptic, requestGpsLocation, currentLocation, announceLive]);

  const matchesSearch = (name) => {
    if (!searchQuery) return true;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const filteredSpots = filters.spots
    ? spots.filter(s => matchesSearch(s.name))
    : [];
  const filteredClubs = allClubs.filter(fc => {
    // CSV exports have category field, else default to 'club'
    const category = fc.category || 'club';
    const categoryMatch = category === 'club' ? filters.clubs : (category === 'spot' ? filters.parks : false);
    return categoryMatch && matchesSearch(fc.name);
  });
  const filteredAngelparks = filters.angelparks
    ? allAngelparks.filter(park => matchesSearch(park.name))
    : [];
  const filteredAngelshops = filters.angelshops
    ? allAngelshops.filter(shop => matchesSearch(shop.name))
    : [];
  const filteredAngelparksEu = filters.angelparksEu
    ? allAngelparksEu.filter(park => matchesSearch(park.name))
    : [];
  const filteredWaters = filters.waters ? waterBodies : [];
  const filteredTiefenkarten = filters.tiefenkarten
    ? tiefenkarten.filter(tk => matchesSearch(tk.name))
    : [];
  const filteredForellenseen = filters.forellenseen
    ? forellenseen.filter(fs => matchesSearch(fs.name))
    : [];
  const filteredBathymetrie = filters.bathymetrie
    ? [...bathymetryData, ...europeanBathymetry].filter(bd => matchesSearch(bd.name))
    : [];
  const filteredFluesse = filters.fluesse
    ? [...deutscheFluesse, ...europeanRivers].filter(f => matchesSearch(f.name))
    : [];

  if (!isInitialized || !mapCenter) {
    return (
      <div 
        className="relative h-[calc(100vh-250px)] min-h-[500px] rounded-2xl overflow-hidden border border-gray-800 bg-gray-900 flex items-center justify-center"
        role="status"
        aria-live="polite"
        aria-label="Karte wird geladen"
      >
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-cyan-400 mx-auto mb-4" />
          <p className="text-gray-400">Karte wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-250px)] min-h-[500px] rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
      {/* Screenreader-Live-Region fuer Kartenstatusaenderungen */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveRegionMessage}
      </div>
      
      {/* Button-Leiste */}
      <div className="flex-shrink-0 bg-gray-950/95 backdrop-blur-xl border-b border-gray-800 p-2">
        <div className="flex justify-between items-center gap-2">
          
          {/* Linke Button-Gruppe */}
          <div className="flex gap-1.5">
            <Button
              onClick={() => setShowInfo(!showInfo)}
              aria-label={showInfo ? "Karteninfo ausblenden" : "Karteninfo anzeigen"}
              aria-expanded={showInfo}
              className="bg-gray-800/90 hover:bg-gray-700 border border-gray-700 min-h-[44px] px-3"
            >
              <Info aria-hidden="true" className="w-4 h-4 sm:mr-1.5 text-cyan-400" />
              <span className="hidden sm:inline text-xs">Info</span>
            </Button>
            
            <Button
              onClick={handleMyLocation}
              aria-label="Zu meinem aktuellen Standort navigieren"
              className="bg-gray-800/90 hover:bg-gray-700 border border-gray-700 min-h-[44px] px-3"
            >
              <Navigation aria-hidden="true" className="w-4 h-4 sm:mr-1.5 text-cyan-400" />
              <span className="hidden sm:inline text-xs">Standort</span>
            </Button>

            <Button
              onClick={() => setShowFilters(!showFilters)}
              aria-label={showFilters ? "Kartenfilter ausblenden" : "Kartenfilter anzeigen"}
              aria-expanded={showFilters}
              className="bg-gray-800/90 hover:bg-gray-700 border border-gray-700 min-h-[44px] px-3"
            >
              <Layers aria-hidden="true" className="w-4 h-4 sm:mr-1.5 text-cyan-400" />
              <span className="hidden sm:inline text-xs">Filter</span>
            </Button>
          </div>

          {/* Rechte Buttons */}
           <div className="flex gap-1.5">
{newSpotCoords && !showAddModal && (
                  <Button
                    onClick={handleAddSpotClick}
                    disabled={addSpotMutation.isPending}
                    aria-label="Neuen Spot bei ausgewaehltem Ort hinzufuegen"
                    className="bg-emerald-600/90 hover:bg-emerald-700 border border-emerald-500/50 text-white min-h-[44px] px-3"
                  >
                    <Plus aria-hidden="true" className="w-4 h-4 sm:mr-1.5" />
                    <span className="hidden sm:inline text-xs">Spot</span>
                  </Button>
                )}
           </div>
          </div>

        {/* Search & Filter Panel */}
        {showFilters && (
         <div className="mt-2 bg-gradient-to-b from-gray-800/80 to-gray-800/40 rounded-lg p-3 space-y-3 border border-gray-700/50 backdrop-blur-sm" role="group" aria-label="Karte durchsuchen und filtern">
           {/* Suche */}
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
             <input
               type="text"
               placeholder="Spot oder Verein suchen..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full bg-gray-700/60 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-400/20"
             />
           </div>

           <div aria-live="polite" aria-atomic="true">
             <div className="text-xs text-gray-300 px-2 py-1 bg-gray-900/50 rounded" role="status">
               {filteredSpots.length} Spots • {filteredClubs.length} Vereine • {filteredAngelparks.length} Angelparks • {filteredAngelshops.length} Shops • {filteredAngelparksEu.length} EU Parks • {filteredWaters.length} Gewässer • {filteredTiefenkarten.length} Tiefenkarten • {filteredForellenseen.length} Seen • {filteredBathymetrie.length} Bathymetrie • {filteredFluesse.length} Flüsse
             </div>
           </div>

           {/* Filter Buttons */}
           <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
             <button type="button"
               onClick={() => setFilters({ ...filters, spots: !filters.spots })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.spots
                   ? 'bg-blue-600 text-white ring-2 ring-blue-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Spots
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, clubs: !filters.clubs })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.clubs
                   ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Vereine
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, parks: !filters.parks })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.parks
                   ? 'bg-amber-600 text-white ring-2 ring-amber-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Parks
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, angelparks: !filters.angelparks })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.angelparks
                   ? 'bg-lime-600 text-white ring-2 ring-lime-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Angelparks
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, angelshops: !filters.angelshops })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.angelshops
                   ? 'bg-yellow-600 text-white ring-2 ring-yellow-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Shops
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, angelparksEu: !filters.angelparksEu })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.angelparksEu
                   ? 'bg-orange-600 text-white ring-2 ring-orange-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               EU Parks
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, waters: !filters.waters })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.waters
                   ? 'bg-cyan-600 text-white ring-2 ring-cyan-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Gewässer
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, tiefenkarten: !filters.tiefenkarten })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.tiefenkarten
                   ? 'bg-violet-600 text-white ring-2 ring-violet-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Tiefenkarten
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, forellenseen: !filters.forellenseen })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.forellenseen
                   ? 'bg-pink-600 text-white ring-2 ring-pink-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Forellenseen
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, bathymetrie: !filters.bathymetrie })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.bathymetrie
                   ? 'bg-blue-600 text-white ring-2 ring-blue-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Bathymetrie
             </button>
             <button type="button"
               onClick={() => setFilters({ ...filters, fluesse: !filters.fluesse })}
               className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                 filters.fluesse
                   ? 'bg-teal-600 text-white ring-2 ring-teal-400/50'
                   : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
               }`}
             >
               Flüsse
             </button>
           </div>
          </div>
        )}
      </div>

      {/* Karten-Container */}
      <div className="relative flex-1 min-h-0">
        
        {/* Info-Banner */}
         {showInfo && (
           <div 
             className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-gray-950/95 via-gray-950/90 to-transparent backdrop-blur-md z-[1001] border-b border-cyan-500/20" 
             role="region" 
             aria-live="polite" 
             aria-atomic="true"
             aria-label="Karteninfos und Anleitung"
           >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]">
                    Deine Angelkarte
                  </h2>
                </div>
                <p className="text-xs text-gray-300 mb-2">
                  Entdecke, plane und navigiere zu deinen Angelspots:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    <span><strong className="text-blue-300">Blaue Marker:</strong> Deine persönlichen Spots</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                    <span><strong className="text-green-300">Grüne Marker:</strong> Angelvereine & Parks</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                    <span><strong className="text-yellow-300">Gelbe Marker:</strong> Angelshops & Fachmärkte</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    <span><strong className="text-red-300">Roter Marker:</strong> Dein aktueller Standort</span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-gray-700/50">
                  <p className="text-xs text-gray-400">
                    <strong>Tipp:</strong> Klicke auf die Karte um einen neuen Spot zu markieren, oder auf einen Marker für Details & Navigation.
                  </p>
                </div>
              </div>
              <button type="button"
                onClick={() => setShowInfo(false)}
                aria-label="Infobanner schliessen"
                className="text-gray-400 hover:text-white transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded active:scale-95"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Map View */}
         <MapView
           center={mapCenter}
           zoom={mapZoom}
           spots={filteredSpots}
           fishingClubs={filteredClubs}
           angelparks={filteredAngelparks}
           angelshops={filteredAngelshops}
           angelparksEu={filteredAngelparksEu}
           waterBodies={filteredWaters}
           tiefenkarten={filteredTiefenkarten}
           forellenseen={filteredForellenseen}
           bathymetrie={filteredBathymetrie}
           fluesse={filteredFluesse}
           currentLocation={currentLocation}
           newSpotMarker={newSpotCoords}
           onMapClick={handleMapClick}
           onLocationClick={handleLocationClick}
           onSpotClick={(spot) => handleLocationClick(spot, 'spot')}
           onClubClick={(club) => handleLocationClick(club, 'club')}
           onAngelparkClick={(park) => handleLocationClick(park, 'angelpark')}
           onAngelshopClick={(shop) => handleLocationClick(shop, 'angelshop')}
           onAngelParkEuClick={(park) => handleLocationClick(park, 'angelpark_eu')}
           onWaterBodiesLoad={setWaterBodies}
           onReviewsLoad={setReviews}
           isOnline={isOnlineStatus}
         />

        {/* Marker Detail Card (new UI) */}
        {selectedLocation && selectedMarkerType && (
          <MarkerDetailCardContainer
            marker={selectedLocation}
            markerType={selectedMarkerType}
            isVisible={!!selectedLocation}
            onClose={() => {
              setSelectedLocation(null);
              setSelectedMarkerType(null);
            }}
          />
        )}

        {/* Legacy Location Detail Panel (fallback for unmapped types) */}
        {selectedLocation && !selectedMarkerType && (
          <LocationDetailPanel
            location={selectedLocation}
            onClose={() => setSelectedLocation(null)}
            onSetAsLocation={() => {
              if (selectedLocation.type === 'spot') {
                setSpotAsLocation(selectedLocation);
              }
              setSelectedLocation(null);
            }}
          />
        )}

        {/* Add Spot Modal */}
         {showAddModal && (
           <AddSpotModal
             isOpen={showAddModal}
             coordinates={newSpotCoords}
             onClose={() => {
               setShowAddModal(false);
               setNewSpotCoords(null);
             }}
             onSpotAdded={handleSpotAdded}
           />
         )}


        </div>
        </div>
        );
        }

export default memo(MapController);