import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  MapPin, 
  Navigation, 
  Clock,
  Ruler,
  Loader2,
  Droplets,
  Heart,
  Trash2,
  ExternalLink,
  Waves,
  Fish,
  Building2
} from 'lucide-react';
import { functions } from "@/api/frontendClient";
import { Spot } from "@/entities/Spot";
import { toast } from 'sonner';
import { useLocation } from '@/components/location/LocationManager';
import { motion } from 'framer-motion';
import RatingForm from '@/components/water/RatingForm';
import ReviewsList from '@/components/water/ReviewsList';

export default function SpotDetailPanel({ spot, onClose, onUpdate }) {
  const { gpsLocation } = useLocation();
  const [travelData, setTravelData] = useState(null);
  const [loadingTravel, setLoadingTravel] = useState(false);
  const [isFavorite, setIsFavorite] = useState(spot?.is_favorite || false);
  const [reviewsKey, setReviewsKey] = useState(0);

  // Koordinaten extrahieren (unterstützt beide Strukturen)
  const getCoordinates = () => {
    if (spot.latitude !== undefined && spot.longitude !== undefined) {
      return { lat: spot.latitude, lng: spot.longitude };
    }
    if (spot.coordinates?.lat !== undefined && spot.coordinates?.lng !== undefined) {
      return { lat: spot.coordinates.lat, lng: spot.coordinates.lng };
    }
    return null;
  };

  const coords = getCoordinates();

  useEffect(() => {
    if (gpsLocation && coords) {
      calculateTravelTime();
    }
  }, [gpsLocation, spot]);

  const calculateTravelTime = async () => {
    if (!gpsLocation || !coords) return;
    
    setLoadingTravel(true);
    try {
      const response = await functions.invoke('calculateTravelTime', {
        fromLat: gpsLocation.lat,
        fromLon: gpsLocation.lon,
        toLat: coords.lat,
        toLon: coords.lng
      });

      if (response.data) {
        setTravelData(response.data);
      }
    } catch (error) {
      console.error('Fehler bei Fahrzeitberechnung:', error);
    }
    setLoadingTravel(false);
  };

  const toggleFavorite = async () => {
    if (!spot.id || spot.type !== 'spot') {
      toast.warning('Nur eigene Spots können als Favorit markiert werden');
      return;
    }

    try {
      await Spot.update(spot.id, {
        is_favorite: !isFavorite
      });
      setIsFavorite(!isFavorite);
      toast.success(!isFavorite ? 'Als Favorit markiert' : 'Favorit entfernt');
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Fehler beim Aktualisieren:', error);
      toast.error('Fehler beim Speichern');
    }
  };

  const handleDelete = async () => {
    if (!spot.id || spot.type !== 'spot') {
      toast.warning('Nur eigene Spots können gelöscht werden');
      return;
    }
    if (!window.confirm('Spot wirklich löschen?')) return;
    try {
      await Spot.delete(spot.id);
      toast.success('Spot gelöscht');
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      toast.error('Fehler beim Löschen');
    }
  };

  const getWaterTypeIcon = (waterType) => {
    const cls = 'w-5 h-5 text-cyan-400 shrink-0';
    switch (waterType) {
      case 'see':
      case 'teich':
        return <Droplets className={cls} />;
      case 'fluss':
      case 'bach':
      case 'kanal':
      case 'meer':
        return <Waves className={cls} />;
      default:
        return <Fish className={cls} />;
    }
  };

  const getCategoryIcon = (category) => {
    const cls = 'w-5 h-5 text-cyan-400 shrink-0';
    if (category === 'club') return <Building2 className={cls} />;
    if (category === 'spot') return <Fish className={cls} />;
    return <MapPin className={cls} />;
  };

  if (!spot || !coords) {
    return (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-900 border-l border-gray-800 shadow-2xl z-[2000] overflow-y-auto"
      >
        <Card className="h-full rounded-none border-0 bg-transparent">
          <CardHeader className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 z-10">
            <div className="flex items-start justify-between">
              <CardTitle className="text-xl font-bold text-red-400">
                Fehler
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-gray-400">Keine Koordinaten für diesen Spot verfügbar.</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Ist es ein eigener Spot oder ein öffentlicher Ort?
  const isUserSpot = spot.type === 'spot' || (!spot.type && spot.water_type);
  const isPublicLocation = spot.type === 'club' || spot.type === 'spot';

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25 }}
      className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-900 border-l border-gray-800 shadow-2xl z-[2000] overflow-y-auto"
    >
      <Card className="h-full rounded-none border-0 bg-transparent">
        <CardHeader className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-xl font-bold text-cyan-400 flex items-center gap-2">
                {isUserSpot && getWaterTypeIcon(spot.water_type)}
                {isPublicLocation && getCategoryIcon(spot.category)}
                {spot.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {spot.water_type && (
                  <Badge variant="outline" className="text-xs">
                    {spot.water_type}
                  </Badge>
                )}
                {spot.category === 'club' && (
                  <Badge variant="outline" className="text-xs">
                    Angelverein
                  </Badge>
                )}
                {spot.category === 'spot' && (
                  <Badge variant="outline" className="text-xs">
                    Angelpark
                  </Badge>
                )}
                {spot.depth_meters && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <Droplets className="w-3 h-3" />
                    {spot.depth_meters}m Tiefe
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {isUserSpot && spot.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFavorite}
                  className={isFavorite ? 'text-yellow-400' : 'text-gray-400'}
                >
                  <Heart className={`w-5 h-5 ${isFavorite ? 'fill-yellow-400' : ''}`} />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Fahrzeit & Entfernung */}
          {gpsLocation && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Anfahrt
              </h3>
              
              {loadingTravel ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                </div>
              ) : travelData ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-center gap-2 text-emerald-400 mb-2">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs font-medium">Fahrzeit (geschätzt)</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                      ca. {travelData.duration_minutes} min
                    </div>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                      <Ruler className="w-4 h-4" />
                      <span className="text-xs font-medium">Luftlinie</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {travelData.distance_km} km
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  Fahrzeit konnte nicht berechnet werden
                </div>
              )}
            </div>
          )}

          {/* Koordinaten */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Koordinaten
            </h3>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <div className="flex items-center gap-2 text-cyan-400">
                <MapPin className="w-4 h-4" />
                <code className="text-sm">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </code>
              </div>
            </div>
          </div>

          {/* Adresse (für öffentliche Locations) */}
          {spot.address && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Adresse
              </h3>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <p className="text-sm text-gray-300">
                  {typeof spot.address === 'string' ? spot.address : (
                    <>
                      {spot.address.street && <>{spot.address.street}<br /></>}
                      {spot.address.city && <>{spot.address.city}<br /></>}
                      {spot.address.country && <>{spot.address.country}</>}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Notizen (für eigene Spots) */}
          {spot.notes && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Notizen
              </h3>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <p className="text-sm text-gray-300 leading-relaxed">
                  {spot.notes}
                </p>
              </div>
            </div>
          )}

          {/* Website (für öffentliche Locations) */}
          {spot.website && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Website
              </h3>
              <a
                href={spot.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
              >
                {spot.website}
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Bewertungen & Reviews */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Aktuelle Bewertungen
            </h3>
            <ReviewsList key={reviewsKey} spotId={spot.id} />
          </div>

          {/* Bewertungsformular */}
          {isUserSpot && spot.id && (
            <RatingForm 
              spot={spot}
              onSuccess={() => setReviewsKey(prev => prev + 1)}
            />
          )}

          {/* Quick Actions */}
           <div className="pt-4 space-y-2">
             <Button 
               className="w-full bg-cyan-600 hover:bg-cyan-700"
               onClick={() => {
                 const url = `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
                 window.open(url, '_blank');
               }}
             >
               <Navigation className="w-4 h-4 mr-2" />
               Navigation starten
             </Button>
             {isUserSpot && spot.id && (
               <Button
                 variant="outline"
                 className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
                 onClick={handleDelete}
               >
                 <Trash2 className="w-4 h-4 mr-2" />
                 Spot löschen
               </Button>
             )}
           </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}