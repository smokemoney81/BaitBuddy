import { describe, it, expect } from 'vitest';
import { formatElapsed, elapsedSeconds, timeOfDayTheme } from './anglerMode';

describe('formatElapsed', () => {
  it('formats seconds as HH:MM:SS', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(65)).toBe('00:01:05');
    expect(formatElapsed(3661)).toBe('01:01:01');
    expect(formatElapsed(36000)).toBe('10:00:00');
  });
  it('clamps negatives and non-numbers to zero', () => {
    expect(formatElapsed(-5)).toBe('00:00:00');
    expect(formatElapsed(NaN)).toBe('00:00:00');
    expect(formatElapsed(undefined)).toBe('00:00:00');
  });
});

describe('elapsedSeconds', () => {
  it('computes whole seconds since start', () => {
    const start = 1_000_000;
    expect(elapsedSeconds(start, start + 5000)).toBe(5);
    expect(elapsedSeconds(start, start - 5000)).toBe(0);
    expect(elapsedSeconds(0)).toBe(0);
  });
});

describe('timeOfDayTheme', () => {
  const at = (h) => new Date(2026, 8, 15, h, 0, 0);
  it('maps hours to the four themes', () => {
    expect(timeOfDayTheme(at(6)).key).toBe('dawn');
    expect(timeOfDayTheme(at(12)).key).toBe('day');
    expect(timeOfDayTheme(at(19)).key).toBe('dusk');
    expect(timeOfDayTheme(at(23)).key).toBe('night');
    expect(timeOfDayTheme(at(3)).key).toBe('night');
  });
  it('always returns a gradient and label', () => {
    const t = timeOfDayTheme(at(12));
    expect(t.gradient).toContain('linear-gradient');
    expect(typeof t.label).toBe('string');
  });
});
