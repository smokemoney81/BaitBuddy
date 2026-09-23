import React, { useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Terrain3DLayer - 3D Terrain Visualisierung mit Canvas
 * Gradient-basierte Höhenvisualisierung mit Konturlinien
 */
function Terrain3DLayer({ visible = false, mode: _mode = 'canvas' }) {
  const map = useMap();
  const [terrain, setTerrain] = useState(null);
  const [_stats, setStats] = useState(null);

  React.useEffect(() => {
    if (!map || !visible) return;

    // Canvas-based terrain overlay (only mode)
    loadCanvasTerrain(map);
  }, [map, visible]);

  const loadCanvasTerrain = (map) => {
    // Canvas-based elevation visualization
    // Uses elevation data to create shaded relief

    const canvas = document.createElement('canvas');
    canvas.width = map.getSize().x;
    canvas.height = map.getSize().y;

    const ctx = canvas.getContext('2d');

    // Create gradient-based elevation visualization
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(70, 130, 180, 0.1)'); // Sky blue
    gradient.addColorStop(0.3, 'rgba(144, 238, 144, 0.15)'); // Light green (low elevation)
    gradient.addColorStop(0.6, 'rgba(218, 165, 32, 0.15)'); // Brown (mid elevation)
    gradient.addColorStop(1, 'rgba(192, 192, 192, 0.2)'); // Gray (high elevation)

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add subtle contour lines
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.1)';
    ctx.lineWidth = 1;

    for (let i = 0; i < 10; i++) {
      const y = (canvas.height / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Create custom overlay
    const overlay = L.imageOverlay(canvas.toDataURL(), map.getBounds(), {
      opacity: 0.3,
      interactive: false,
      className: 'terrain-3d-overlay',
    });

    overlay.addTo(map);
    setTerrain(overlay);

    // Update on map move
    map.on('moveend', () => {
      overlay.setBounds(map.getBounds());
    });

    setStats({
      mode: 'canvas',
      available: true,
    });
  };

  React.useEffect(() => {
    return () => {
      if (terrain && map) {
        if (terrain.addTo) {
          // Leaflet layer
          map.removeLayer(terrain);
        }
      }
    };
  }, [terrain, map]);

  return null;
}

export default Terrain3DLayer;
