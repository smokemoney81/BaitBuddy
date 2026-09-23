import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import MarkerDetailCard from './MarkerDetailCard';
import { normalizeMarker } from './adapters';

function MarkerDetailCardContainer({
  marker,
  markerType,
  onClose,
  isVisible = true
}) {
  const [normalizedData, setNormalizedData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [_error, setError] = useState(null);

  useEffect(() => {
    if (!marker || !isVisible) return;

    const loadMarker = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const normalized = await normalizeMarker(marker, markerType);
        if (normalized) {
          setNormalizedData(normalized);
        } else {
          setError(`Marker type "${markerType}" nicht unterstützt`);
        }
      } catch (err) {
        console.error('Error normalizing marker:', err);
        setError(err.message || 'Fehler beim Laden');
      } finally {
        setIsLoading(false);
      }
    };

    loadMarker();
  }, [marker, markerType, isVisible]);

  const handleAction = useCallback((actionId, actionData) => {
    console.log('Marker action:', { actionId, actionData });

    switch (actionId) {
      case 'website':
        if (actionData.link || marker?.website) {
          window.open(actionData.link || marker.website, '_blank');
        }
        break;
      case 'call':
        if (marker?.phone) {
          window.location.href = `tel:${marker.phone}`;
        }
        break;
      case 'navigate':
        if (marker?.latitude && marker?.longitude) {
          const mapsUrl = `https://www.google.com/maps?q=${marker.latitude},${marker.longitude}`;
          window.open(mapsUrl, '_blank');
        } else if (marker?.lat && marker?.lng) {
          const mapsUrl = `https://www.google.com/maps?q=${marker.lat},${marker.lng}`;
          window.open(mapsUrl, '_blank');
        }
        break;
      case 'open-map':
      case 'view-map':
        if (marker?.url) {
          window.open(marker.url, '_blank');
        } else {
          toast.info('Karte wird vorbereitet...');
        }
        break;
      case 'download':
      case 'download-data':
        if (marker?.url) {
          const link = document.createElement('a');
          link.href = marker.url;
          link.download = `${marker.name || markerType}.geotiff`;
          link.click();
        } else {
          toast.info('Download wird vorbereitet...');
        }
        break;
      case 'show-on-map':
        onClose?.();
        toast.success(`${marker?.name || 'Marker'} auf Karte angezeigt`);
        break;
      case 'add-to-trips':
      case 'add-trip':
        toast.success(`${marker?.name || 'Location'} zu Reise hinzugefügt`);
        break;
      case 'set-location':
      case 'as-location':
        toast.success(`${marker?.name || 'Spot'} als Standort gesetzt`);
        break;
      case 'sports':
        toast.info('Sportarten-Auswahl wird geladen...');
        break;
      case 'edit':
        toast.info('Bearbeitungsmodus wird geöffnet...');
        break;
      case 'info':
        toast.info(`${marker?.name || 'Marker'} Details`);
        break;
      default:
        console.log(`Unhandled action: ${actionId}`);
    }
  }, [marker, markerType, onClose]);

  if (!isVisible) return null;

  return (
    <MarkerDetailCard
      marker={normalizedData}
      markerType={markerType}
      onClose={onClose}
      onAction={handleAction}
      heroImage={normalizedData?.heroImage}
      isLoading={isLoading}
    />
  );
}

export default MarkerDetailCardContainer;
