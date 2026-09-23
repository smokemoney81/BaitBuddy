
import React, { useEffect, useRef, useState, useCallback } from "react";

export default function WeatherTipsPanel() {
  const [_loc, setLoc] = useState(null); // {lat, lon, name, source}
  const [text, setText] = useState("Wetter wird geladen …");
  const trackRef = useRef(null);

  // define weather fetcher as stable callback
  const fetchWeatherAndBuild = useCallback(async (L) => {
    if (!L?.lat || !L?.lon) { setText("Standort wählen oder freigeben"); return; }
    const hourKey = `fm_ticker_weather_${L.lat.toFixed(2)}_${L.lon.toFixed(2)}_${new Date().toISOString().slice(0,13)}`;
    const cached = localStorage.getItem(hourKey);
    let w = null;

    if (cached) {
      try { w = JSON.parse(cached); } catch { /* ignore */ }
    }
    if (!w) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl&hourly=cloud_cover,precipitation&daily=sunrise,sunset&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: Weather API`);
        const json = await res.json();
        w = {
          temp: Math.round(json?.current?.temperature_2m ?? 0),
          windKmh: Math.round(json?.current?.wind_speed_10m ?? 0),
          windDir: degToDir(json?.current?.wind_direction_10m),
          pressure: Math.round(json?.current?.pressure_msl ?? 0),
          precip: json?.hourly?.precipitation?.[0] ?? 0,
          clouds: json?.hourly?.cloud_cover?.[0] ?? 0,
          sunrise: json?.daily?.sunrise?.[0],
          sunset: json?.daily?.sunset?.[0]
        };
        localStorage.setItem(hourKey, JSON.stringify(w));
      } catch {
        const fallback = localStorage.getItem("fm_ticker_weather_fallback");
        if (fallback) {
          try { w = JSON.parse(fallback); } catch {}
        }
      }
    }
    if (w) localStorage.setItem("fm_ticker_weather_fallback", JSON.stringify(w));

    if (!w) {
      setText(`${L.name} • Wetter derzeit nicht verfügbar`);
      return;
    }

    const tip = buildTip(L.name, w);
    setText(tip);
  }, []); // stable, no external deps

  // Subscribe to external spot selection
  useEffect(() => {
    const onLoc = (e) => {
      const L = e.detail;
      if (!L) return;
      const next = { lat: L.lat, lon: L.lon, name: L.name || "Spot", source: L.source || "spot" };
      setLoc(next);
      localStorage.setItem("fm_ticker_location", JSON.stringify({ ...next, updatedAt: new Date().toISOString() }));
      fetchWeatherAndBuild(next);
    };
    window.addEventListener("tickerLocationChanged", onLoc);
    return () => window.removeEventListener("tickerLocationChanged", onLoc);
  }, [fetchWeatherAndBuild]);

  // Initial location: GPS if available, else cache
  useEffect(() => {
    const cacheRaw = localStorage.getItem("fm_ticker_location");
    const cached = (() => {
      try { return cacheRaw ? JSON.parse(cacheRaw) : null; } catch { return null; }
    })();

    const loadCached = () => {
      if (cached) {
        const next = { lat: cached.lat, lon: cached.lon, name: cached.name || "Zuletzt", source: cached.source || "cache" };
        setLoc(next);
        fetchWeatherAndBuild(next);
      } else {
        setText("Standort wählen oder freigeben");
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const next = { lat: p.coords.latitude, lon: p.coords.longitude, name: "Aktueller Standort", source: "gps" };
          setLoc(next);
          localStorage.setItem("fm_ticker_location", JSON.stringify({ ...next, updatedAt: new Date().toISOString() }));
          fetchWeatherAndBuild(next);
        },
        () => loadCached(),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 600000 }
      );
    } else {
      loadCached();
    }
  }, [fetchWeatherAndBuild]);

  // Pause on hover/touch (optional convenience)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const pause = () => (el.style.animationPlayState = "paused");
    const play = () => (el.style.animationPlayState = "running");
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", play);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", play);
    return () => {
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", play);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", play);
    };
  }, []);

  return (
    <div
      className="w-full"
      style={{ height: 40 }}
      aria-label="Wetter-Tipp-Ticker"
      role="region"
      aria-live="polite"
    >
      <div
        className="w-full overflow-hidden border-t border-b"
        style={{
          height: 40,
          background: "rgba(17, 24, 39, 0.7)", // slate-900/70
          borderColor: "rgba(75, 85, 99, 0.5)"  // gray-600/50
        }}
      >
        <div
          ref={trackRef}
          className="whitespace-nowrap font-medium"
          style={{
            lineHeight: "40px",
            color: "#a7f3d0", // emerald-200 (neon-ish)
            animation: "fm-marquee 28s linear infinite",
            willChange: "transform",
          }}
        >
          <span style={{ paddingRight: 48 }}>{text}</span>
          <span style={{ paddingRight: 48 }}>{text}</span>
          <span style={{ paddingRight: 48 }}>{text}</span>
        </div>
      </div>

      <style>{`
        @keyframes fm-marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

// helpers
function degToDir(deg) {
  if (deg == null) return "-";
  const dirs = ["N","NO","O","SO","S","SW","W","NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function buildTip(name, w) {
  const windLabel = w.windKmh < 10 ? "leichter Wind" : w.windKmh < 20 ? "mäßiger Wind" : "starker Wind";
  const fish = suggestFish(w);
  return `Heute gute Bedingungen für ${fish} – ${name} • Temperatur ${w.temp}°C, ${windLabel}, Druck ${w.pressure} hPa.`;
}

function suggestFish(w) {
  if ((w.precip ?? 0) > 0.5) return "Hecht";
  if ((w.clouds ?? 0) > 60 && (w.windKmh ?? 0) <= 12) return "Zander";
  if (w.temp >= 18 && (w.windKmh ?? 0) < 15) return "Karpfen";
  return "Barsch";
}
