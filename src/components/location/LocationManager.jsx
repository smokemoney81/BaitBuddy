import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

const LocationContext = createContext();

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};

export function LocationProvider({ children }) {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [isGpsEnabled, setIsGpsEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // GPS-Standort abrufen
  const requestGpsLocation = async () => {
    if (!navigator.geolocation) {
      const msg = "GPS wird von diesem Browser nicht unterstützt";
      setError(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    setError(null);

    try {

      const position = await new Promise((resolve, reject) => {
        // Harter JS-Fallback zusaetzlich zur nativen timeout-Option: In
        // manchen Browsern/WebViews laeuft der native Timeout NICHT, solange
        // der Berechtigungsdialog offen ist bzw. die Berechtigung in einem
        // unklaren Zustand haengt — die Standortsuche lud dann endlos.
        const fallbackTimer = setTimeout(() => {
          reject({ code: 3, message: 'GPS-Timeout (Fallback nach 15s)' });
        }, 15000);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(fallbackTimer);
            resolve(pos);
          },
          (err) => {
            clearTimeout(fallbackTimer);
            reject(err);
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          }
        );
      });

      const location = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString(),
        name: "GPS-Standort",
        source: "gps"
      };

      setGpsLocation(location);
      setCurrentLocation(location);
      setIsGpsEnabled(true);

      // GPS-Standort im localStorage speichern (Fehlertoleranz für Private-Mode)
      try {
        localStorage.setItem("fm_gps_location", JSON.stringify(location));
        localStorage.setItem("fm_current_location", JSON.stringify(location));
        localStorage.setItem("fm_gps_fetched", "true");
      } catch {
        // localStorage ist im Private-Mode nicht verfügbar — ignorieren
      }

      toast.success(
        "Standort erfolgreich ermittelt",
        {
          description: `Lat: ${location.lat.toFixed(3)}, Lon: ${location.lon.toFixed(3)}`,
          duration: 3000
        }
      );

    } catch (err) {
      let userMessage = "GPS-Standort konnte nicht ermittelt werden.";

      if (err.code === 1) {
        userMessage = "Standortzugriff wurde verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.";
      } else if (err.code === 2) {
        userMessage = "Standort nicht verfügbar. Bitte GPS aktivieren.";
      } else if (err.code === 3) {
        userMessage = "Standortabfrage hat zu lange gedauert.";
      }

      setError(userMessage);
      setIsGpsEnabled(false);

      toast.warning(
        "Standort nicht verfügbar",
        {
          description: userMessage,
          duration: 5000
        }
      );
    } finally {
      setLoading(false);
    }
  };

  // Spot als aktuellen Standort setzen
  const setSpotAsLocation = async (spot) => {
    if (!spot || spot.latitude == null || spot.longitude == null) {
      return;
    }
    
    const location = {
      lat: spot.latitude,
      lon: spot.longitude,
      name: String(spot.name || "Unbenannter Spot"),
      source: "spot",
      spotId: spot.id,
      waterType: String(spot.water_type || ""),
      timestamp: new Date().toISOString()
    };
    setCurrentLocation(location);
    try {
      localStorage.setItem("fm_current_location", JSON.stringify(location));
    } catch {
      // localStorage-Fehler ignorieren (Private-Mode)
    }

    toast.info(
      "Spot als Standort gesetzt",
      {
        description: location.name,
        duration: 2000
      }
    );
  };

  // Manuelle Koordinaten setzen
  const setManualLocation = (lat, lon, name = "Manueller Standort") => {
    const location = {
      lat,
      lon,
      name: String(name),
      source: "manual",
      timestamp: new Date().toISOString()
    };
    setCurrentLocation(location);
    try {
      localStorage.setItem("fm_current_location", JSON.stringify(location));
    } catch {
      // localStorage-Fehler ignorieren (Private-Mode)
    }

    toast.info(
      "Standort manuell gesetzt",
      {
        description: location.name,
        duration: 2000
      }
    );
  };

  // Beim Start: Nur gespeicherten Standort laden, NICHT automatisch GPS abrufen
  useEffect(() => {
    try {
      // Prüfe ob GPS schon mal abgerufen wurde
      const gpsFetched = localStorage.getItem("fm_gps_fetched");
      
      const savedLocation = localStorage.getItem("fm_current_location");
      if (savedLocation) {
        const location = JSON.parse(savedLocation);
        // Validiere Location-Objekt
        if (location && location.lat != null && location.lon != null) {
          // Prüfe ob Standort nicht älter als 7 Tage ist
          if (location.timestamp && new Date() - new Date(location.timestamp) < 7 * 24 * 60 * 60 * 1000) {
            setCurrentLocation(location);
          }
        }
      }

      const savedGps = localStorage.getItem("fm_gps_location");
      if (savedGps) {
        const gpsLoc = JSON.parse(savedGps);
        // Validiere GPS-Objekt
        if (gpsLoc && gpsLoc.lat != null && gpsLoc.lon != null && gpsLoc.timestamp) {
          if (new Date() - new Date(gpsLoc.timestamp) < 7 * 24 * 60 * 60 * 1000) {
            setGpsLocation(gpsLoc);
            setIsGpsEnabled(true);
          }
        }
      }

      // Nur beim allerersten App-Start GPS automatisch abrufen
      if (!gpsFetched && !savedLocation) {
        setTimeout(() => {
          requestGpsLocation();
        }, 1000);
      }
    } catch {
      // Fehler beim Laden gespeicherter Standorte ignorieren
    }
  }, []); // Nur einmal beim Mount ausführen

  const value = {
    currentLocation,
    gpsLocation,
    isGpsEnabled,
    loading,
    error,
    requestGpsLocation,
    setSpotAsLocation,
    setManualLocation,
    setCurrentLocation
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}