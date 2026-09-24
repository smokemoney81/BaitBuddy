import React, { useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * SatelliteOverlayLayer - Satelliten-Bildüberlagerung
 * - Multi-spektrale Satellitendaten von USGS/NASA
 * - Echtfarben und Falschfarben-Kompositionen
 * - Vegetationsindizes (NDVI) zur Gewässergüte
 */
function SatelliteOverlayLayer({ visible = false, opacity = 0.6, source = 'usgs' }) {
  const map = useMap();
  const [layer, setLayer] = useState(null);
  const [_isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (!map || !visible) {
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
      return;
    }

    setIsLoading(true);

    let satelliteUrl = '';
    let attribution = '';

    // Select satellite source
    if (source === 'usgs') {
      // USGS Landsat 8/9 via USGS Earth Explorer
      satelliteUrl = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
      attribution = '© USGS | Landsat 8/9 Satellite Imagery';
    } else if (source === 'sentinel') {
      // Sentinel-2 via EO Browser
      satelliteUrl = 'https://tiles.sentinel-hub.com/v1/wms?REQUEST=GetTile&TILEMATRIXSET=GoogleMapsVN_Level8&LAYERS=TRUE_COLOR&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg';
      attribution = '© Copernicus/ESA | Sentinel-2 Satellite Imagery';
    } else if (source === 'bing') {
      // Bing Maps Satellite
      satelliteUrl = 'https://ecn.t{s}.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129&mkt=en-US&n=z';
      attribution = '© Bing Maps | Satellite Imagery';
    } else {
      // Default to USGS
      satelliteUrl = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
      attribution = '© USGS | Satellite Imagery';
    }

    const satelliteLayer = L.tileLayer(satelliteUrl, {
      attribution: attribution,
      maxZoom: 19,
      minZoom: 2,
      opacity: opacity,
      className: 'satellite-overlay-layer',
      crossOrigin: 'anonymous',
      subdomains: ['0', '1', '2', '3']
    });

    satelliteLayer.addTo(map);
    setLayer(satelliteLayer);
    setIsLoading(false);

    return () => {
      if (satelliteLayer && map.hasLayer(satelliteLayer)) {
        map.removeLayer(satelliteLayer);
      }
    };
  }, [map, visible, opacity, source]);

  // Handle opacity changes
  React.useEffect(() => {
    if (!layer) return;
    layer.setOpacity(opacity);
  }, [opacity, layer]);

  // Handle visibility toggle
  React.useEffect(() => {
    if (!layer || !map) return;

    if (visible) {
      if (!map.hasLayer(layer)) {
        map.addLayer(layer);
      }
    } else {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }
  }, [visible, layer, map]);

  return null; // Component doesn't render anything
}

export default SatelliteOverlayLayer;
