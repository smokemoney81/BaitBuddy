import { describe, it, expect } from 'vitest';
import { estimateTravel, haversineKm } from './travelEstimate';

describe('travelEstimate', () => {
  it('berechnet die Luftlinie Berlin–Hamburg plausibel', () => {
    expect(haversineKm(52.52, 13.405, 53.551, 9.994)).toBeGreaterThan(250);
    expect(haversineKm(52.52, 13.405, 53.551, 9.994)).toBeLessThan(260);
  });

  it('schätzt Fahrzeit aus Umwegfaktor und Durchschnittstempo', () => {
    const r = estimateTravel({ fromLat: 52.52, fromLon: 13.405, toLat: 53.551, toLon: 9.994 });
    expect(r.estimated).toBe(true);
    expect(r.road_km).toBeCloseTo(r.distance_km * 1.3, 0);
    expect(r.duration_minutes).toBe(Math.round((r.road_km / 60) * 60));
  });

  it('liefert mindestens eine Minute und null bei ungültigen Koordinaten', () => {
    expect(estimateTravel({ fromLat: 52, fromLon: 13, toLat: 52, toLon: 13 }).duration_minutes).toBe(1);
    expect(estimateTravel({ fromLat: 'x', fromLon: 13, toLat: 52, toLon: 13 })).toBeNull();
    expect(estimateTravel({ fromLat: 95, fromLon: 13, toLat: 52, toLon: 13 })).toBeNull();
  });
});
