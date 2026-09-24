import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Building2,
  ChevronLeft,
  ChevronRight,
  Share2,
  ScrollText,
  CheckCircle2,
  CloudSun,
  Star
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { fishImageFor } from '@/lib/fishImages';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { weatherDescription } from '@/lib/fishingConditions';
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
  const species = Array.isArray(spot.fische) ? spot.fische : Array.isArray(spot.target_species) ? spot.target_species : [];
  const city = spot.address && typeof spot.address === 'object' ? spot.address.city : null;
  const categoryLabel = spot.category === 'club' ? 'Angelverein' : spot.category === 'spot' ? 'Angelpark' : null;
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;

  const share = async () => {
    const text = `${spot.name}: https://maps.google.com/?q=${coords.lat},${coords.lng}`;
    try {
      if (navigator.share) await navigator.share({ title: spot.name, text });
      else { await navigator.clipboard.writeText(text); toast.success('Link kopiert'); }
    } catch { /* Teilen abgebrochen */ }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25 }}
      className="bb-spot-sheet"
    >
      <div className="bb-spot-hero">
        <img src="/assets/buddy/lake-hero.png" alt="" aria-hidden="true" />
        <div className="bb-spot-hero-bar">
          <button type="button" onClick={onClose} className="bb-round-btn" aria-label="Schließen"><ChevronLeft size={24} aria-hidden="true" /></button>
          <span className="bb-spot-hero-title">Gewässer-Infos</span>
          <div className="flex gap-2">
            {isUserSpot && spot.id && (
              <button type="button" onClick={toggleFavorite} className={`bb-round-btn${isFavorite ? ' is-fav' : ''}`} aria-pressed={isFavorite} aria-label="Favorit">
                <Heart size={20} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            )}
            <button type="button" onClick={share} className="bb-round-btn" aria-label="Teilen"><Share2 size={20} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="bb-spot-hero-text">
          <h2>{spot.name}</h2>
          <div className="bb-water-chips">
            {spot.water_type && <span><Waves size={16} aria-hidden="true" />{spot.water_type}</span>}
            {categoryLabel && <span><Building2 size={16} aria-hidden="true" />{categoryLabel}</span>}
            {city && <span><MapPin size={16} aria-hidden="true" />{city}</span>}
          </div>
        </div>
      </div>

      <div className="bb-spot-body">
        <SpotWeather lat={coords.lat} lon={coords.lng} />

        {(species.length > 0 || spot.depth_meters) && (
          <div className={`grid gap-3${species.length > 0 && spot.depth_meters ? ' grid-cols-[1.4fr_1fr]' : ''}`}>
            {species.length > 0 && (
              <div className="bb-water-block">
                <h3 className="bb-water-block-title"><Fish size={20} aria-hidden="true" />Beliebte Fischarten</h3>
                <div className="bb-water-fish">
                  {species.map(name => {
                    const img = fishImageFor(name);
                    return (
                      <span key={name} className="bb-water-fish-item">
                        {img ? <img src={img} alt="" loading="lazy" /> : <Fish size={24} aria-hidden="true" />}
                        <span>{name}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {spot.depth_meters && (
              <div className="bb-water-block">
                <h3 className="bb-water-block-title"><Droplets size={20} aria-hidden="true" />Tiefe</h3>
                <p className="bb-spot-depth">{spot.depth_meters} m</p>
              </div>
            )}
          </div>
        )}

        {gpsLocation && (
          <div className="bb-water-block">
            <h3 className="bb-water-block-title"><Navigation size={20} aria-hidden="true" />Anfahrt</h3>
            {loadingTravel ? (
              <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Wird berechnet …</p>
            ) : travelData ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bb-spot-stat"><Clock size={16} aria-hidden="true" /><strong>{travelData.duration_minutes} min</strong><small>Fahrzeit</small></div>
                <div className="bb-spot-stat"><Ruler size={16} aria-hidden="true" /><strong>{travelData.distance_km} km</strong><small>Entfernung</small></div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Fahrzeit konnte nicht berechnet werden.</p>
            )}
          </div>
        )}

        {(spot.notes || spot.address) && (
          <div className="bb-water-block">
            <h3 className="bb-water-block-title"><ScrollText size={20} aria-hidden="true" />Hinweise</h3>
            <ul className="bb-water-notes">
              {spot.notes && <li><CheckCircle2 size={18} aria-hidden="true" />{spot.notes}</li>}
              {spot.address && (
                <li><MapPin size={18} aria-hidden="true" />
                  {typeof spot.address === 'string' ? spot.address : [spot.address.street, spot.address.city, spot.address.country].filter(Boolean).join(', ')}
                </li>
              )}
              <li><MapPin size={18} aria-hidden="true" /><code>{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</code></li>
            </ul>
            {spot.website && (
              <a href={spot.website} target="_blank" rel="noopener noreferrer" className="bb-see-all mt-2">
                Website <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        <div className="bb-water-block">
          <h3 className="bb-water-block-title"><Star size={20} aria-hidden="true" />Bewertungen</h3>
          <ReviewsList key={reviewsKey} spotId={spot.id} />
        </div>

        {isUserSpot && spot.id && (
          <RatingForm spot={spot} onSuccess={() => setReviewsKey(prev => prev + 1)} />
        )}

        <a href={navUrl} target="_blank" rel="noopener noreferrer" className="bb-action bb-action-block">
          <Navigation size={20} aria-hidden="true" className="bb-action-icon" />
          <span>Navigation starten</span>
          <ChevronRight size={20} aria-hidden="true" className="bb-action-arrow" />
        </a>
        {isUserSpot && spot.id && (
          <button type="button" className="bb-secondary justify-center text-red-300" onClick={handleDelete}>
            <Trash2 size={16} aria-hidden="true" />Spot löschen
          </button>
        )}
      </div>
    </motion.div>
  );
}

function SpotWeather({ lat, lon }) {
  const conditions = useFishingConditions(lat, lon);
  const current = conditions.data?.current;
  if (!current) return null;
  return (
    <Link to="/Weather" className="bb-water-weather">
      <CloudSun size={30} aria-hidden="true" className="bb-weather-icon" />
      <span>
        <strong>{Math.round(current.temperature_2m)}°C</strong>
        <small>{weatherDescription(current.weather_code)} · Wind {Math.round(current.wind_speed_10m)} km/h</small>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}