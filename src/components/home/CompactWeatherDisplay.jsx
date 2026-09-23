import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "@/components/location/LocationManager";
import { Wind, Activity, Cloud, Droplets, Sun, CloudRain, MapPin } from "lucide-react";

const compactCacheKey = (lat, lon) => {
  const hour = new Date().toISOString().slice(0, 13);
  return `weather_compact_${lat.toFixed(2)}_${lon.toFixed(2)}_${hour}`;
};

function CompactWeatherDisplay() {
  const { currentLocation } = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (lat, lon) => {
    setLoading(true);
    const key = compactCacheKey(lat, lon);
    const cached = localStorage.getItem(key);

    if (cached) {
      try {
        const parsedData = JSON.parse(cached);
        setData(parsedData);
        setLoading(false);
        return;
      } catch {
        localStorage.removeItem(key);
      }
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,pressure_msl,weather_code,relative_humidity_2m,apparent_temperature,visibility,wind_gusts_10m,dew_point_2m&hourly=cloud_cover,precipitation_probability&daily=sunrise,sunset,uv_index_max&timezone=auto`;
      const res = await fetch(url);
      const json = await res.json();

      const current = {
        temperature: json?.current?.temperature_2m,
        wind: json?.current?.wind_speed_10m,
        pressure: json?.current?.pressure_msl,
        humidity: json?.current?.relative_humidity_2m,
        apparent: json?.current?.apparent_temperature,
        visibility: json?.current?.visibility,
        weatherCode: json?.current?.weather_code,
        wind_gusts_10m: json?.current?.wind_gusts_10m,
        dew_point_2m: json?.current?.dew_point_2m,
        sunrise: json?.daily?.sunrise?.[0],
        sunset: json?.daily?.sunset?.[0],
        uvIndex: json?.daily?.uv_index_max?.[0],
        cloudCover: json?.hourly?.cloud_cover?.[0],
        precipitationProb: json?.hourly?.precipitation_probability?.[0]
      };

      localStorage.setItem(key, JSON.stringify(current));
      setData(current);
    } catch (error) {
      console.error("Wetter-API Fehler:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (currentLocation?.lat && currentLocation?.lon) {
      load(currentLocation.lat, currentLocation.lon);
    }
  }, [currentLocation, load]);

  const getWeatherIcon = (code) => {
    if (code === null || code === undefined) return <Activity className="w-5 h-5 text-gray-300" />;
    if ([0, 1].includes(code)) return <Sun className="w-5 h-5 text-yellow-400" />;
    if ([2, 3].includes(code)) return <Cloud className="w-5 h-5 text-gray-300" />;
    return <CloudRain className="w-5 h-5 text-blue-400" />;
  };

  const getWeatherDescription = (code) => {
    if ([0, 1].includes(code)) return "Sonnig";
    if ([2, 3].includes(code)) return "Bewölkt";
    if ([45, 48].includes(code)) return "Nebelig";
    if ([51, 53, 55].includes(code)) return "Nieselig";
    if ([61, 63, 65].includes(code)) return "Regnerisch";
    return "Wechselhaft";
  };

  const getFishingCondition = () => {
    if (!data) return { text: "Bewertung lädt...", color: "text-gray-400" };

    let score = 0;

    // Luftdruck bewerten
    if (data.pressure > 1020) {
      score += 2;
    } else if (data.pressure < 1000) {
      score -= 1;
    } else {
      score += 1;
    }

    // Wind bewerten
    if (data.wind > 25) {
      score -= 1;
    } else if (data.wind < 10) {
      score += 1;
    }

    // Bewölkung bewerten
    if (data.cloudCover && data.cloudCover > 70) {
      score += 1;
    }

    if (score >= 3) return { text: "Sehr gut", color: "text-green-400" };
    if (score >= 1) return { text: "Gut", color: "text-emerald-400" };
    if (score >= 0) return { text: "Mittel", color: "text-yellow-400" };
    return { text: "Schwierig", color: "text-red-400" };
  };

  if (loading || !data) {
    return (
      <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
        <div className="text-gray-400 text-center">Wetter wird geladen...</div>
      </div>
    );
  }

  const condition = getFishingCondition();
  const locationName = currentLocation?.name || "Unbekannt";

  return (
    <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-white">
          {getWeatherIcon(data.weatherCode)}
          <span className="font-semibold text-lg">{Math.round(data.temperature)}°C</span>
          <span className="text-gray-300 text-sm">{getWeatherDescription(data.weatherCode)}</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <MapPin className="w-3 h-3 text-gray-400" />
          <span className="text-gray-400">{String(locationName).slice(0, 15)}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center text-xs mb-3">
        <div>
          <Wind className="w-4 h-4 mx-auto mb-1 text-gray-400" />
          <div className="text-white font-medium">{Math.round(data.wind)}</div>
          <div className="text-gray-400">km/h</div>
        </div>
        <div>
          <Activity className="w-4 h-4 mx-auto mb-1 text-gray-400" />
          <div className="text-white font-medium">{Math.round(data.pressure)}</div>
          <div className="text-gray-400">hPa</div>
        </div>
        <div>
          <Droplets className="w-4 h-4 mx-auto mb-1 text-gray-400" />
          <div className="text-white font-medium">{data.humidity}%</div>
          <div className="text-gray-400">Feuchte</div>
        </div>
        <div>
          <Cloud className="w-4 h-4 mx-auto mb-1 text-gray-400" />
          <div className="text-white font-medium">{data.precipitationProb || 0}%</div>
          <div className="text-gray-400">Regen</div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-gray-700/50">
        <div className="text-xs text-gray-400">
          Gefühlte {Math.round(data.apparent)}°C • Sicht {(data.visibility/1000).toFixed(1)}km
        </div>
        <div className={`text-xs font-medium ${condition.color} drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]`}>
          Angel-Bedingungen: {condition.text}
        </div>
      </div>
    </div>
  );
}

export default React.memo(CompactWeatherDisplay, (prevProps, nextProps) => {
  return (
    Math.abs((prevProps.currentLocation?.lat || 0) - (nextProps.currentLocation?.lat || 0)) < 0.1 &&
    Math.abs((prevProps.currentLocation?.lon || 0) - (nextProps.currentLocation?.lon || 0)) < 0.1
  );
});
