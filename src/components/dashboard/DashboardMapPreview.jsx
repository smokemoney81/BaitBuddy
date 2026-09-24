import React from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import { Maximize2, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO';

// Nicht-interaktive Kartenvorschau: dein Standort + gespeicherte Spots.
// Ein Tipp öffnet die volle Karte.
export default function DashboardMapPreview({ location, spots = [] }) {
  const points = spots
    .map(spot => [Number(spot.latitude), Number(spot.longitude)])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  const center = location?.lat != null && location?.lon != null
    ? [location.lat, location.lon]
    : points[0];

  if (!center) {
    return (
      <Link to="/Map" className="bb-dash-map bb-dash-map-empty">
        <MapPin size={28} aria-hidden="true" className="bb-title-accent" />
        <span>Karte öffnen und Gewässer in deiner Nähe entdecken</span>
      </Link>
    );
  }

  return (
    <div className="bb-dash-map">
      <MapContainer
        center={center}
        zoom={12}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        attributionControl
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} subdomains="abcd" />
        {points.map(([lat, lon], index) => (
          <CircleMarker
            key={`${lat}-${lon}-${index}`}
            center={[lat, lon]}
            radius={7}
            pathOptions={{ color: '#00E5FF', weight: 2, fillColor: '#00E5FF', fillOpacity: 0.55 }}
          />
        ))}
        {location?.lat != null && (
          <CircleMarker
            center={[location.lat, location.lon]}
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#00E5FF', fillOpacity: 1 }}
          />
        )}
      </MapContainer>
      <Link to="/Map" className="bb-dash-map-link" aria-label="Karte öffnen">
        <span className="bb-dash-map-expand"><Maximize2 size={20} aria-hidden="true" /></span>
      </Link>
    </div>
  );
}
