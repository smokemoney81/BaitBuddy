import { describe, it, expect } from 'vitest';
import { computeInsights, pickTopInsight } from './fishingInsights';

// Baut einen Fang mit lokaler Stunde.
const at = (hour, species = 'Barsch', bait = 'Gummifisch') => ({
  species, bait_used: bait, catch_time: new Date(2026, 8, 10, hour, 0, 0).toISOString(),
});

describe('computeInsights', () => {
  it('returns nothing for empty or thin data', () => {
    expect(computeInsights([])).toEqual([]);
    expect(computeInsights(null)).toEqual([]);
    expect(computeInsights([at(7)])).toEqual([]); // single catch: below all thresholds
  });

  it('surfaces the top bait when used at least twice', () => {
    const res = computeInsights([at(7, 'Barsch', 'Dropshot'), at(9, 'Zander', 'Dropshot')]);
    const bait = res.find((r) => r.id === 'bait');
    expect(bait).toBeTruthy();
    expect(bait.text).toContain('Dropshot');
    expect(bait.text).toContain('2');
  });

  it('surfaces the most frequent species', () => {
    const res = computeInsights([at(7, 'Hecht'), at(9, 'Hecht'), at(11, 'Barsch')]);
    const sp = res.find((r) => r.id === 'species');
    expect(sp.text).toContain('Hecht');
    expect(sp.text).toContain('2');
  });

  it('derives the best 3h window with enough catches', () => {
    const res = computeInsights([at(6), at(7), at(7), at(8), at(15)]);
    const time = res.find((r) => r.id === 'time');
    expect(time).toBeTruthy();
    // Window starting at 06:00 covers 6,7,7,8 = 4 catches
    expect(time.text).toContain('06:00');
    expect(time.text).toContain('09:00');
  });

  it('does not derive a time window below the minimum total', () => {
    const res = computeInsights([at(6), at(7), at(8)]); // only 3 catches (< minTotal 4)
    expect(res.find((r) => r.id === 'time')).toBeUndefined();
  });
});

describe('pickTopInsight', () => {
  it('returns the highest-priority insight (time > bait > species)', () => {
    const top = pickTopInsight([at(6), at(7), at(7), at(8)]);
    expect(top.id).toBe('time');
  });
  it('returns null when there is nothing to say', () => {
    expect(pickTopInsight([])).toBeNull();
  });
});
