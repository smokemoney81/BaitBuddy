import { describe, it, expect } from 'vitest';
import { computeProgress, levelForXp, levelStartXp, MAX_CATCHES_PER_DAY, XP_RULES } from './progression.js';

describe('Level-Kurve', () => {
  it.each([
    [0, 1], [99, 1], [100, 2], [299, 2], [300, 3], [6600, 12], [7799, 12], [7800, 13],
  ])('%i XP → Level %i', (xp, level) => {
    expect(levelForXp(xp)).toBe(level);
  });

  it('Level-Start ist monoton', () => {
    for (let l = 1; l < 60; l += 1) expect(levelStartXp(l + 1)).toBeGreaterThan(levelStartXp(l));
  });
});

describe('computeProgress', () => {
  it('startet ohne Daten bei Level 1', () => {
    const p = computeProgress();
    expect(p).toMatchObject({ xp: 0, level: 1, level_start_xp: 0, next_level_xp: 100 });
    expect(p.badges.every(b => !b.unlocked)).toBe(true);
  });

  it('rechnet XP aus Fängen, Fotos, Spots, Trips und Events', () => {
    const p = computeProgress({
      catches: [
        { species: 'Zander', length_cm: 62, photo_url: 'x', catch_time: '2026-09-01T10:00:00Z' },
        { species: 'Hecht', length_cm: 85, catch_time: '2026-09-02T10:00:00Z' },
      ],
      spotCount: 2,
      tripCount: 1,
      participations: [{ is_winner: true }, { is_winner: false }],
    });
    const expected = 2 * XP_RULES.catch + XP_RULES.catchPhoto + 2 * XP_RULES.spot + XP_RULES.trip
      + 2 * XP_RULES.eventJoined + XP_RULES.eventWon;
    expect(p.xp).toBe(expected);
    const unlocked = p.badges.filter(b => b.unlocked).map(b => b.id);
    expect(unlocked).toEqual(expect.arrayContaining(['first_catch', 'big_fish', 'event_rookie', 'event_winner']));
    expect(unlocked).not.toContain('species_5');
  });

  it('zählt pro Tag höchstens MAX_CATCHES_PER_DAY Fänge für XP', () => {
    const catches = Array.from({ length: MAX_CATCHES_PER_DAY + 15 }, () => ({ species: 'Rotauge', catch_time: '2026-09-01T10:00:00Z' }));
    const p = computeProgress({ catches });
    expect(p.breakdown.find(r => r.id === 'catches').count).toBe(MAX_CATCHES_PER_DAY);
    // Abzeichen zählen weiterhin alle Fänge.
    expect(p.badges.find(b => b.id === 'catches_10').unlocked).toBe(true);
  });

  it('kappt den Fortschritt eines Abzeichens beim Ziel', () => {
    const p = computeProgress({ spotCount: 25 });
    expect(p.badges.find(b => b.id === 'spot_scout')).toMatchObject({ current: 10, target: 10, unlocked: true });
  });
});
