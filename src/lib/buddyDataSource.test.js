import { describe, it, expect, beforeEach } from 'vitest';
import { getBuddyDataSource, setBuddyDataSource, BUDDY_DATA_SOURCE_KEY } from './buddyDataSource';

describe('buddyDataSource', () => {
  beforeEach(() => localStorage.clear());

  it('liefert "auto" ohne gespeicherten Wert', () => {
    expect(getBuddyDataSource()).toBe('auto');
  });

  it('speichert und liest "database" bzw. "model"', () => {
    setBuddyDataSource('database');
    expect(getBuddyDataSource()).toBe('database');
    setBuddyDataSource('model');
    expect(getBuddyDataSource()).toBe('model');
  });

  it('fällt bei einem ungültigen gespeicherten Wert auf "auto" zurück', () => {
    localStorage.setItem(BUDDY_DATA_SOURCE_KEY, 'irgendwas');
    expect(getBuddyDataSource()).toBe('auto');
  });

  it('normalisiert ein ungültiges Argument beim Speichern auf "auto"', () => {
    setBuddyDataSource('nonsense');
    expect(getBuddyDataSource()).toBe('auto');
  });
});
