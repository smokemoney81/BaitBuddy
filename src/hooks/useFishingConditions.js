import { useQuery } from '@tanstack/react-query';
import { timeoutSignal, anySignal } from '@/lib/abortCompat';
import { forecastHours, bestWindow } from '@/lib/fishingConditions';
export function useFishingConditions(latitude, longitude) {
  const valid = latitude != null && longitude != null && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const query = useQuery({
    queryKey: ['fishing-conditions-v4', Number(latitude), Number(longitude)], enabled: valid, staleTime: 15 * 60 * 1000, retry: 1,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ latitude: String(Number(latitude)), longitude: String(Number(longitude)), current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,precipitation,cloud_cover,is_day', hourly: 'temperature_2m,wind_speed_10m,pressure_msl,precipitation,precipitation_probability,cloud_cover,weather_code', daily: 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', timeformat: 'unixtime', forecast_days: '7' });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: anySignal([signal, timeoutSignal(12000)]) });
      if (!response.ok) throw new Error('Wetterdaten konnten nicht geladen werden.');
      const data = await response.json();
      if (data.error || !data.hourly) throw new Error('Wetterdaten sind gerade unvollständig.');
      return data;
    },
  });
  const hours = forecastHours(query.data);
  return { ...query, hours, window: bestWindow(hours.filter(row => row.time <= Date.now() + 86400000)), hasLocation: valid };
}
