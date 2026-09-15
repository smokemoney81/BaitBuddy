import { describe, it, expect } from 'vitest';
import { computeTripJourney, selectNextTrip, readPlanSpot } from './tripJourney';

describe('readPlanSpot', () => {
  it('reads the object form', () => {
    expect(readPlanSpot({ name: 'Bleibtreusee', water_type: 'See', lat: 52.5, lon: 13.2 }))
      .toEqual({ name: 'Bleibtreusee', water_type: 'See', lat: 52.5, lon: 13.2 });
  });
  it('parses the legacy string form with coordinates', () => {
    const s = readPlanSpot('Mein Spot\nKoordinaten: 52.5, 13.2');
    expect(s.name).toBe('Mein Spot');
    expect(s.lat).toBeCloseTo(52.5);
    expect(s.lon).toBeCloseTo(13.2);
  });
  it('is empty for missing input', () => {
    expect(readPlanSpot(null)).toEqual({ name: '', water_type: '', lat: null, lon: null });
  });
});

describe('computeTripJourney', () => {
  it('reports 0% for an empty plan and the first step as current', () => {
    const j = computeTripJourney({});
    expect(j.total).toBe(8);
    expect(j.completed).toBe(0);
    expect(j.percent).toBe(0);
    expect(j.currentIndex).toBe(0);
  });

  it('marks target/spot/time and derives conditions from coords + date', () => {
    const j = computeTripJourney({
      target_fish: 'Hecht',
      spot_info: { name: 'Bleibtreusee', lat: 52.5, lon: 13.2 },
      planned_date: '2026-09-20T06:30:00.000Z',
    });
    const by = Object.fromEntries(j.steps.map((s) => [s.id, s.complete]));
    expect(by.target).toBe(true);
    expect(by.spot).toBe(true);
    expect(by.time).toBe(true);
    expect(by.conditions).toBe(true); // coords + date
    expect(by.gear).toBe(false);
    expect(j.completed).toBe(4);
    expect(j.percent).toBe(50);
    expect(j.currentIndex).toBe(4); // gear is first open
  });

  it('does not derive conditions without coordinates', () => {
    const j = computeTripJourney({ spot_info: { name: 'Irgendwo' }, planned_date: '2026-09-20' });
    const conditions = j.steps.find((s) => s.id === 'conditions');
    expect(conditions.complete).toBe(false);
  });

  it('counts gear/bait/rules/checklist from details and steps', () => {
    const j = computeTripJourney({
      target_fish: 'Zander',
      spot_info: { name: 'Rhein', lat: 50, lon: 7 },
      planned_date: '2026-09-20',
      details: { gear: 'Spinnrute, Rolle', bait: 'Gummifisch', rules_ack: true },
      steps: ['Angelschein', 'Kescher'],
    });
    expect(j.completed).toBe(8);
    expect(j.percent).toBe(100);
    expect(j.currentIndex).toBe(-1);
  });
});

describe('selectNextTrip', () => {
  const base = { id: '1' };
  it('returns null for empty input', () => {
    expect(selectNextTrip([])).toBeNull();
    expect(selectNextTrip(null)).toBeNull();
  });

  it('prefers an active trip over an earlier-dated inactive one', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const plans = [
      { id: 'up', planned_date: '2026-09-16', is_active: false },
      { id: 'act', planned_date: '2026-09-20', is_active: true },
    ];
    expect(selectNextTrip(plans, now).id).toBe('act');
  });

  it('picks the soonest upcoming trip when none active', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const plans = [
      { id: 'later', planned_date: '2026-09-25' },
      { id: 'past', planned_date: '2026-09-01' },
      { id: 'soon', planned_date: '2026-09-16' },
    ];
    expect(selectNextTrip(plans, now).id).toBe('soon');
  });

  it('falls back to the most recent undated draft when nothing upcoming', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const plans = [
      { id: 'past', planned_date: '2026-09-01' },
      { id: 'draftOld', created_at: '2026-08-01' },
      { id: 'draftNew', created_at: '2026-09-10' },
    ];
    expect(selectNextTrip(plans, now).id).toBe('draftNew');
  });

  it('returns null when only past dated trips exist', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    expect(selectNextTrip([{ id: 'past', planned_date: '2026-09-01' }], now)).toBeNull();
  });

  void base;
});
