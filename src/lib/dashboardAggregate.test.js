import { describe, it, expect } from 'vitest';
import { aggregateDashboardData, shouldUseDashboardFallback } from './dashboardAggregate';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

describe('aggregateDashboardData', () => {
  const spots = [
    { id: 's1', name: 'Nordufer', latitude: 50.1, longitude: 7.2, water_type: 'See' },
    { id: 's2', name: 'Wehr', latitude: null, longitude: null },
  ];

  it('wählt den nächsten zukünftigen Trip', () => {
    const plans = [
      { id: 'old', title: 'Vorbei', planned_date: daysAgo(1) },
      { id: 'later', title: 'Später', planned_date: daysAgo(-10) },
      { id: 'soon', title: 'Bald', planned_date: daysAgo(-2), target_fish: 'Zander', is_active: true },
    ];
    const { next_trip } = aggregateDashboardData({ plans }, NOW);
    expect(next_trip).toMatchObject({ id: 'soon', name: 'Bald', target_species: ['Zander'], status: 'active' });
  });

  it('liefert null ohne geplanten Trip', () => {
    expect(aggregateDashboardData({}, NOW).next_trip).toBeNull();
  });

  it('gruppiert Top-Spots der letzten 30 Tage über spot_id und Altdaten-Namen', () => {
    const catches = [
      { id: 'a', catch_time: daysAgo(1), spot_id: 's1', is_released: false },
      { id: 'b', catch_time: daysAgo(3), spot_id: 's1', is_released: true },
      { id: 'c', catch_time: daysAgo(5), spot_name: 'Wehr' },
      { id: 'd', catch_time: daysAgo(45), spot_id: 's2' },
      { id: 'e', catch_time: daysAgo(2), spot_id: 'fremd' },
    ];
    const { top_spots } = aggregateDashboardData({ catches, spots }, NOW);
    expect(top_spots).toEqual([
      { id: 's1', name: 'Nordufer', location: '50.1, 7.2', water_type: 'See', usage_count: 2, avg_success: 0.5 },
      { id: 's2', name: 'Wehr', location: '', water_type: null, usage_count: 1, avg_success: 1 },
    ]);
  });

  it('listet Fänge der letzten 7 Tage absteigend mit aufgelöstem Ort', () => {
    const catches = [
      { id: 'alt', catch_time: daysAgo(8), spot_id: 's1' },
      { id: 'neu', catch_time: daysAgo(1), spot_id: 's1', weight_kg: 2.5, photo_url: 'https://x/y.jpg' },
      { id: 'mitte', catch_time: daysAgo(3), water_body: 'Rhein' },
    ];
    const { recent_catches } = aggregateDashboardData({ catches, spots }, NOW);
    expect(recent_catches.map((c) => c.id)).toEqual(['neu', 'mitte']);
    expect(recent_catches[0]).toMatchObject({ location: 'Nordufer', weight: 2.5, photo_urls: ['https://x/y.jpg'] });
    expect(recent_catches[1].location).toBe('Rhein');
  });

  it('gibt nur die planunabhängigen Kennzahlen der letzten 90 Tage aus', () => {
    const catches = [
      { id: 'a', catch_time: daysAgo(10), weight_kg: 1.234 },
      { id: 'b', catch_time: daysAgo(80), weight_kg: '2' },
      { id: 'c', catch_time: daysAgo(100), weight_kg: 9 },
      { id: 'd', catch_time: 'kein Datum', weight_kg: 5 },
    ];
    expect(aggregateDashboardData({ catches }, NOW).statistics).toEqual({ total_catches: 2, total_weight: 3.23 });
  });
});

describe('shouldUseDashboardFallback', () => {
  it.each([
    [404, true],
    [500, true],
    [503, true],
    [401, false],
    [403, false],
    [undefined, false],
  ])('Status %s -> %s', (status, expected) => {
    expect(shouldUseDashboardFallback({ status })).toBe(expected);
  });
});
