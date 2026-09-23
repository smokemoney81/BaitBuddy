import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "@/components/location/LocationManager";
import LocationSelector from "@/components/location/LocationSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Cloud, Sun, CloudRain, Wind, Activity, MapPin } from "lucide-react";

const cacheKey = (lat, lon) => {
  const hour = new Date().toISOString().slice(0, 13);
  return `openmeteo_${lat.toFixed(2)}_${lon.toFixed(2)}_${hour}`;
};

export default function WeatherSection() {
  const { currentLocation } = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = useCallback(async (lat, lon) => {
    setLoading(true);
    const key = cacheKey(lat, lon);
    const cached = localStorage.getItem(key);
    
    if (cached) { 
      try {
        setData(JSON.parse(cached)); 
        setLoading(false); 
        setLastUpdate(new Date());
        return;
      } catch {
        localStorage.removeItem(key);
      }
    }
    
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,pressure_msl,weather_code&hourly=cloud_cover,precipitation&daily=sunrise,sunset&timezone=auto`;
      const res = await fetch(url);
      const json = await res.json();
      
      const current = {
        temperature: json?.current?.temperature_2m,
        wind: json?.current?.wind_speed_10m,
        pressure: json?.current?.pressure_msl,
        weatherCode: json?.current?.weather_code,
        sunrise: json?.daily?.sunrise?.[0],
        sunset: json?.daily?.sunset?.[0],
        cloudCover: json?.hourly?.cloud_cover?.[0],
        precipitation: json?.hourly?.precipitation?.[0]
      };
      
      localStorage.setItem(key, JSON.stringify(current));
      setData(current);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Wetter-API Fehler:", error);
    }
    setLoading(false);
  }, []);

  // KI-Buddy über Funktionsaufruf informieren (nur beim Mount)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('kiBuddyFunctionCall', {
      detail: {
        functionName: 'weather',
        context: { timestamp: Date.now() }
      }
    }));
  }, []);

  // Wetter laden wenn sich der Standort ändert
  useEffect(() => {
    if (currentLocation?.lat && currentLocation?.lon) {
      load(currentLocation.lat, currentLocation.lon);
    }
  }, [currentLocation, load]);

  const getWeatherIcon = (code) => {
    if (code === null || code === undefined) return <Activity className="w-6 h-6 text-gray-300" />;
    if ([0, 1].includes(code)) return <Sun className="w-6 h-6 text-yellow-400" />;
    if ([2, 3].includes(code)) return <Cloud className="w-6 h-6 text-gray-300" />;
    return <CloudRain className="w-6 h-6 text-blue-400" />;
  };

  const getFishingConditions = () => {
    if (!data) return null;
    
    const conditions = [];
    
    // Luftdruck bewerten
    if (data.pressure > 1020) {
      conditions.push({ text: "Hoher Luftdruck - gut für Raubfische", type: "good" });
    } else if (data.pressure < 1000) {
      conditions.push({ text: "Fallender Luftdruck - Fische weniger aktiv", type: "warning" });
    }
    
    // Wind bewerten
    if (data.wind > 25) {
      conditions.push({ text: "Starker Wind - schwierige Bedingungen", type: "warning" });
    } else if (data.wind < 10) {
      conditions.push({ text: "Wenig Wind - ideal für Oberflächenköder", type: "good" });
    }
    
    // Bewölkung bewerten
    if (data.cloudCover > 70) {
      conditions.push({ text: "Stark bewölkt - gute Bedingungen für Hecht", type: "good" });
    } else if (data.cloudCover < 30) {
      conditions.push({ text: "Klarer Himmel - tiefere Gewässer bevorzugen", type: "info" });
    }
    
    return conditions;
  };

  const conditions = getFishingConditions();

  return (
    <Card className="glass-morphism border-gray-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            Wetter
            {currentLocation && (
              <div className="flex items-center gap-1 text-sm text-gray-300">
                <MapPin className="w-3 h-3" />
                {currentLocation.name}
              </div>
            )}
          </div>
          {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LocationSelector compact={true} />
        
        {data ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-white">
              <div className="p-3 bg-gray-800/50 rounded-xl flex items-center gap-2">
                {getWeatherIcon(data.weatherCode)}
                <span className="font-semibold">{Math.round(data.temperature)}°C</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-xl flex items-center gap-2">
                <Wind className="w-5 h-5" />
                <span className="font-semibold">{Math.round(data.wind)} km/h</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-xl flex items-center gap-2">
                <Activity className="w-5 h-5" />
                <span className="font-semibold">{Math.round(data.pressure)} hPa</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-xl">
                <div className="text-xs text-gray-400">Bewölkung</div>
                <span className="font-semibold">{data.cloudCover ?? "-"}%</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-xl">
                <div className="text-xs text-gray-400">Niederschlag</div>
                <span className="font-semibold">{data.precipitation ?? "-"} mm</span>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-xl">
                <div className="text-xs text-gray-400">Sonne</div>
                <span className="font-semibold text-xs">
                  {data.sunrise && data.sunset ? 
                    `${new Date(data.sunrise).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} / ${new Date(data.sunset).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}` : 
                    "-"
                  }
                </span>
              </div>
            </div>

            {conditions && conditions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-300">Angel-Bedingungen</h4>
                {conditions.map((condition, idx) => (
                  <Badge 
                    key={idx}
                    className={`block w-full text-left p-2 text-xs ${
                      condition.type === 'good' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                      condition.type === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                      'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    }`}
                  >
                    {condition.text}
                  </Badge>
                ))}
              </div>
            )}

            {lastUpdate && (
              <div className="text-xs text-gray-500">
                Letztes Update: {lastUpdate.toLocaleTimeString('de-DE')}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 mt-4">
            {currentLocation ? "Wetter wird geladen..." : "Kein Standort ausgewählt"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}