import { describe, it, expect } from 'vitest';
import { formatRemaining } from './EventTimer';

describe('formatRemaining', () => {
  it('zeigt unter einem Tag nur die Uhrzeit', () => {
    expect(formatRemaining((4 * 3600 + 5 * 60 + 9) * 1000)).toBe('04:05:09');
  });

  it('zeigt Tage vor der Uhrzeit', () => {
    expect(formatRemaining((2 * 86400 + 3600) * 1000)).toBe('2T 01:00:00');
  });

  it('fällt nie unter null', () => {
    expect(formatRemaining(-5000)).toBe('00:00:00');
  });
});
