// A transparent planning heuristic, not a measured catch probability.
// Missing measurements must never produce an apparently precise index.
export function conditionIndex(hour) {
  if (![hour.temperature, hour.wind, hour.rain, hour.pressure, hour.cloud].every(Number.isFinite)) return null;
  const temperature = Math.max(0, 1 - Math.abs(hour.temperature - 16) / 22);
  const wind = Math.max(0, 1 - Math.abs(hour.wind - 10) / 30);
  const rain = Math.max(0, 1 - hour.rain / 5);
  const pressure = Math.max(0, 1 - Math.abs(hour.pressure - 1015) / 35);
  const clouds = Math.min(1, Math.max(0, hour.cloud / 100));
  return Math.round(100 * (.25 * temperature + .25 * wind + .2 * rain + .2 * pressure + .1 * clouds));
}
export function forecastHours(data) {
  const hourly = data?.hourly;
  if (!Array.isArray(hourly?.time)) return [];
  return hourly.time.map((time, i) => {
    const row = { time: time * 1000, temperature: hourly.temperature_2m?.[i], wind: hourly.wind_speed_10m?.[i], rain: hourly.precipitation?.[i], pressure: hourly.pressure_msl?.[i], cloud: hourly.cloud_cover?.[i], code: hourly.weather_code?.[i], rainChance: hourly.precipitation_probability?.[i] };
    return { ...row, index: conditionIndex(row) };
  });
}
export function bestWindow(hours, now = Date.now()) {
  let best = null;
  for (let i = 0; i < hours.length - 1; i++) {
    const first = hours[i], next = hours[i + 1];
    if (first.time < now || next.time - first.time !== 3600000 || first.index == null || next.index == null) continue;
    if ([first, next].some(row => row.wind >= 40 || row.rain >= 5 || row.code >= 95)) continue;
    const score = Math.round((first.index + next.index) / 2);
    if (!best || score > best.index) best = { start: first.time, end: next.time + 3600000, index: score };
  }
  return best;
}
export function formatForecastTime(time, timezone, withDate = false) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: timezone || undefined, ...(withDate ? { day: '2-digit', month: '2-digit' } : {}), hour: '2-digit', minute: '2-digit' }).format(new Date(time));
}
export function weatherDescription(code) {
  if (code === 0) return 'Klar';
  if (code <= 2) return 'Leicht bewölkt';
  if (code === 3) return 'Bewölkt';
  if (code === 45 || code === 48) return 'Nebel';
  if (code >= 95) return 'Gewitter';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Schnee';
  return Number.isFinite(code) ? 'Regen' : 'Wetterdaten fehlen';
}

/** Bissindex der laufenden Stunde samt Tendenz (steigt/fällt) oder null. */
export function currentBiteIndex(hours, now = Date.now()) {
  if (!Array.isArray(hours)) return null;
  const row = hours.find(entry => entry.time <= now && now < entry.time + 3600000);
  if (!row || row.index == null) return null;
  const next = hours.find(entry => entry.time === row.time + 3600000);
  return { value: row.index, rising: next?.index != null ? next.index > row.index : null };
}

export function biteLabel(value) {
  if (value >= 70) return 'Sehr gut';
  if (value >= 55) return 'Gut';
  if (value >= 40) return 'Mittel';
  return 'Schwach';
}
