import { describe, it, expect } from 'vitest';
import { rankSpots } from './spotRecommendation.js';

const spots = [
  { id: 's1', name: 'Rheinufer' },
  { id: 's2', name: 'Baggersee' },
];

describe('rankSpots', () => {
  it('bewertet ohne Zielfischart/Wetter alles neutral (0.5 je Faktor)', () => {
    const [top] = rankSpots({ spots: [spots[0]] });
    expect(top.breakdown).toEqual({ species: 0.5, season: 0.5, weather: 0.5 });
    expect(top.score).toBeCloseTo(0.5, 5);
  });

  it('bevorzugt den Spot mit mehr passenden Fängen der Zielfischart', () => {
    const catches = [
      { water_body: 'Rheinufer', species: 'Zander' },
      { water_body: 'Rheinufer', species: 'Zander' },
      { water_body: 'Baggersee', species: 'Karpfen' },
    ];
    const ranked = rankSpots({ spots, catches, targetSpecies: 'Zander' });
    expect(ranked[0].spot.name).toBe('Rheinufer');
    expect(ranked[0].breakdown.species).toBe(1);
    // Baggersee hat Fänge, aber keine passenden -> niedriger als neutral
    expect(ranked.find((r) => r.spot.name === 'Baggersee').breakdown.species).toBe(0);
  });

  it('setzt season_match auf 0 waehrend einer aktiven Schonzeit', () => {
    const farInFuture = new Date();
    const from = new Date(farInFuture);
    from.setDate(from.getDate() - 1);
    const to = new Date(farInFuture);
    to.setDate(to.getDate() + 1);
    const toIso = (d) => d.toISOString().slice(0, 10);

    const ruleEntries = [{ fish: 'Hecht', closed_from: toIso(from), closed_to: toIso(to) }];
    const [ranked] = rankSpots({ spots: [spots[0]], targetSpecies: 'Hecht', ruleEntries });
    expect(ranked.breakdown.season).toBe(0);
  });

  it('bewertet Wind unter 15 km/h als gut, ueber 25 km/h als schlecht', () => {
    const good = rankSpots({ spots: [spots[0]], weather: { windSpeed: 10 } })[0];
    const bad = rankSpots({ spots: [spots[0]], weather: { windSpeed: 30 } })[0];
    expect(good.breakdown.weather).toBe(1);
    expect(bad.breakdown.weather).toBe(0.3);
  });

  it('sortiert absteigend nach Gesamtscore', () => {
    const catches = [{ water_body: 'Rheinufer', species: 'Zander' }];
    const ranked = rankSpots({ spots, catches, targetSpecies: 'Zander' });
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});
