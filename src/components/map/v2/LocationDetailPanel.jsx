import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, MapPin, Navigation, Clock, ExternalLink, Loader2, Zap } from "lucide-react";
import { functions } from "@/api/frontendClient";
import { useLocation } from "@/components/location/LocationManager";
import { toast } from "sonner";
import SportSelectorModal from "./SportSelectorModal";

export default function LocationDetailPanel({ location, onClose, onSetAsLocation }) {
  const { currentLocation } = useLocation();
  const [travelInfo, setTravelInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSportSelector, setShowSportSelector] = useState(false);

  useEffect(() => {
    if (currentLocation?.lat && currentLocation?.lon) {
      loadTravelTime();
    }
  }, [currentLocation, location]);

  const loadTravelTime = async () => {
    if (!currentLocation?.lat || !currentLocation?.lon) {
      return;
    }

    // Koordinaten extrahieren
    let toLat, toLon;
    
    if (location.type === 'spot') {
      toLat = location.latitude;
      toLon = location.longitude;
    } else if (location.type === 'club') {
      toLat = location.coordinates?.lat;
      toLon = location.coordinates?.lng;
    }

    if (!toLat || !toLon) {
      return;
    }

    setLoading(true);

    try {
      const response = await functions.invoke('calculateTravelTime', {
        fromLat: currentLocation.lat,
        fromLon: currentLocation.lon,
        toLat: toLat,
        toLon: toLon
      });

      if (response.data?.duration_minutes) {
        setTravelInfo({
          duration_minutes: response.data.duration_minutes,
          distance_km: response.data.distance_km,
          fromLat: currentLocation.lat,
          fromLon: currentLocation.lon,
          toLat,
          toLon
        });
        toast.success(`Fahrzeit ca. ${response.data.duration_minutes} Min`);
      } else {
        console.warn("No travel data in response:", response);
        toast.error("Fahrzeitberechnung fehlgeschlagen");
      }
    } catch (error) {
      console.error("Travel time calculation error:", error);
      toast.error("Fehler bei der Fahrzeitberechnung");
    } finally {
      setLoading(false);
    }
  };

  const openGoogleMaps = () => {
    if (!travelInfo) return;
    
    const url = `https://www.google.com/maps/dir/?api=1&origin=${travelInfo.fromLat},${travelInfo.fromLon}&destination=${travelInfo.toLat},${travelInfo.toLon}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const openDirectRoute = () => {
    let toLat, toLon;
    
    if (location.type === 'spot') {
      toLat = location.latitude;
      toLon = location.longitude;
    } else if (location.type === 'club') {
      toLat = location.coordinates?.lat;
      toLon = location.coordinates?.lng;
    }

    if (!toLat || !toLon) {
      toast.error("Keine Koordinaten verfügbar");
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${toLat},${toLon}&travelmode=driving`;
    window.open(url, '_blank');
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 z-[1000] max-w-md">
      <Card className="glass-morphism border-gray-700 bg-gray-900/95">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-cyan-400 text-lg">{location.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                <MapPin className="w-3 h-3" />
                {location.type === 'spot' ? (
                  <span>{location.water_type}</span>
                ) : (
                  <span>{location.category === 'club' ? 'Angelverein' : 'Angelpark'}</span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Standort-Details schliessen"
              className="text-gray-400 hover:text-white min-h-[44px] min-w-[44px]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Location Info */}
          {location.notes && (
            <div className="text-sm text-gray-300">
              <p>{location.notes}</p>
            </div>
          )}

          {location.address && (
            <div className="text-sm text-gray-300">
              {location.address.street && <p>{location.address.street}</p>}
              <p>{location.address.city}</p>
            </div>
          )}

          {location.besonderheit && (
            <div className="text-sm text-gray-300">
              <p>{location.besonderheit}</p>
            </div>
          )}

          {Array.isArray(location.fische) && location.fische.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-sm text-gray-400 mb-2">Fischarten:</div>
              <div className="flex flex-wrap gap-2">
                {location.fische.map(fisch => (
                  <span key={fisch} className="text-xs bg-cyan-600/30 text-cyan-300 px-2 py-1 rounded">
                    {fisch}
                  </span>
                ))}
              </div>
            </div>
          )}

          {location.website && (
            <a
              href={location.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Website besuchen
            </a>
          )}

          {/* Travel Info */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Berechne Route...</span>
            </div>
          )}

          {travelInfo && !loading && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Fahrzeit (geschätzt):</span>
                <span className="text-white font-medium">ca. {travelInfo.duration_minutes} Minuten</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Luftlinie:</span>
                <span className="text-white font-medium">{travelInfo.distance_km} km</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={openGoogleMaps}
                aria-label="Navigation in Google Maps oeffnen"
                className="w-full mt-2 min-h-[44px]"
              >
                <Navigation className="w-4 h-4 mr-2" aria-hidden="true" />
                Navigation starten
                <ExternalLink className="w-3 h-3 ml-2" aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* Sports */}
          {location.type === 'spot' && location.sports && location.sports.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-sm text-gray-400 mb-2">Sportarten:</div>
              <div className="flex flex-wrap gap-2">
                {location.sports.map(sport => (
                  <span key={sport} className="text-xs bg-cyan-600/30 text-cyan-300 px-2 py-1 rounded">
                    {sport}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {location.type === 'spot' && (
              <>
                <Button
                  onClick={onSetAsLocation}
                  aria-label="Diesen Spot als aktuellen Standort festlegen"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
                >
                  <MapPin className="w-4 h-4 mr-2" aria-hidden="true" />
                  Als Standort
                </Button>
                <Button
                  onClick={() => setShowSportSelector(true)}
                  variant="outline"
                  aria-label="Sportarten fuer diesen Spot bearbeiten"
                  className="flex-1 min-h-[44px]"
                >
                  <Zap className="w-4 h-4 mr-2" aria-hidden="true" />
                  Sportarten
                </Button>
              </>
            )}

            {!location.type || location.type === 'club' ? (
              <Button
                onClick={openDirectRoute}
                variant="outline"
                aria-label="Route in Google Maps oeffnen"
                className="flex-1 min-h-[44px]"
              >
                <Navigation className="w-4 h-4 mr-2" aria-hidden="true" />
                Route
              </Button>
            ) : null}

            {!loading && !travelInfo && currentLocation && (
              <Button
                onClick={loadTravelTime}
                variant="outline"
                aria-label="Fahrtzeit zum Spot berechnen"
                className="flex-1 min-h-[44px]"
              >
                <Clock className="w-4 h-4 mr-2" aria-hidden="true" />
                Fahrzeit
              </Button>
            )}
          </div>

          {/* Sport Selector Modal */}
          {location.type === 'spot' && (
            <SportSelectorModal
              isOpen={showSportSelector}
              onClose={() => setShowSportSelector(false)}
              spot={location}
            />
          )}
          </CardContent>
          </Card>
          </div>
          );
          }