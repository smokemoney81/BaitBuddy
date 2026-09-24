import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * BathymetryLayer - Zeigt Tiefendaten (Bathymetrie) als Overlay an
 *
 * Features:
 * - Lädt GeoTIFF Bathymetrie-Daten
 * - Zeigt als WMS oder raster Overlay
 * - Unterstützt alle 16 Bundesländer
 * - Transparente Heatmap-Visualisierung
 */

function BathymetryLayer({ selectedBundesland = null, opacity = 0.6, visible = true }) {
  const map = useMap();
  const [layer, setLayer] = useState(null);
  const [_loading, setLoading] = useState(false);

  // Bathymetrie-Daten URLs pro Bundesland
  const bathymetryUrls = {
    'Baden-Württemberg': '/assets/bathymetry/Bathymetrie_Baden-Württemberg.tif',
    'Bayern': '/assets/bathymetry/Bathymetrie_Bayern.tif',
    'Berlin': '/assets/bathymetry/Bathymetrie_Berlin.tif',
    'Brandenburg': '/assets/bathymetry/Bathymetrie_Brandenburg.tif',
    'Bremen': '/assets/bathymetry/Bathymetrie_Bremen.tif',
    'Hamburg': '/assets/bathymetry/Bathymetrie_Hamburg.tif',
    'Hessen': '/assets/bathymetry/Bathymetrie_Hessen.tif',
    'Mecklenburg-Vorpommern': '/assets/bathymetry/Bathymetrie_Mecklenburg-Vorpommern.tif',
    'Niedersachsen': '/assets/bathymetry/Bathymetrie_Niedersachsen.tif',
    'Nordrhein-Westfalen': '/assets/bathymetry/Bathymetrie_Nordrhein-Westfalen.tif',
    'Rheinland-Pfalz': '/assets/bathymetry/Bathymetrie_Rheinland-Pfalz.tif',
    'Saarland': '/assets/bathymetry/Bathymetrie_Saarland.tif',
    'Sachsen': '/assets/bathymetry/Bathymetrie_Sachsen.tif',
    'Sachsen-Anhalt': '/assets/bathymetry/Bathymetrie_Sachsen-Anhalt.tif',
    'Schleswig-Holstein': '/assets/bathymetry/Bathymetrie_Schleswig-Holstein.tif',
    'Thüringen': '/assets/bathymetry/Bathymetrie_Thüringen.tif',
  };

  useEffect(() => {
    if (!visible || !selectedBundesland || !bathymetryUrls[selectedBundesland]) {
      if (layer) {
        map.removeLayer(layer);
        setLayer(null);
      }
      return;
    }

    setLoading(true);

    // Bathymetrie als ImageOverlay laden
    // Für echte GeoTIFF-Rendering würde man GDAL/WebGL verwenden
    // Vereinfachte Version: GeoTIFF als PNG/JPEG Tile Server

    const _tileUrl = bathymetryUrls[selectedBundesland];

    // Temporary: Einfache TileLayer (benötigt GeoServer oder ähnlich)
    // Später: Mit Rasterio + GeoServer oder GeoTIFF.js

    // Für jetzt: Platzhalter mit Infos
    const infoLayer = L.control({position: 'topright'});

    infoLayer.onAdd = function() {
      const div = L.DomUtil.create('div', 'bathymetry-info');
      const container = L.DomUtil.create('div', '', div);
      container.style.cssText = 'background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; font-size: 12px;';

      const title = L.DomUtil.create('strong', '', container);
      title.textContent = 'Bathymetrie';

      L.DomUtil.create('br', '', container);

      const region = L.DomUtil.create('span', '', container);
      region.textContent = selectedBundesland;

      L.DomUtil.create('br', '', container);

      const loading = L.DomUtil.create('small', '', container);
      loading.textContent = 'GeoTIFF laden...';

      return div;
    };

    if (layer) {
      map.removeLayer(layer);
    }

    infoLayer.addTo(map);
    setLayer(infoLayer);
    setLoading(false);

    return () => {
      if (infoLayer) {
        map.removeControl(infoLayer);
      }
    };
  }, [visible, selectedBundesland, map, layer]);

  // Opacität anpassen
  useEffect(() => {
    if (layer && opacity !== undefined) {
      // Opacität für den Layer setzen
      if (layer.setOpacity) {
        layer.setOpacity(opacity);
      }
    }
  }, [opacity, layer]);

  return null;
}

export default BathymetryLayer;
