import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isGuestEntity,
  guestList,
  guestGet,
  guestFilter,
  guestCreate,
  guestUpdate,
  guestDelete,
  clearGuestData,
  hasGuestData,
  migrateGuestData,
} from './guestStore';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('guestStore — lokale Ablage', () => {
  it('führt nur Catch und Spot lokal', () => {
    expect(isGuestEntity('Catch')).toBe(true);
    expect(isGuestEntity('Spot')).toBe(true);
    expect(isGuestEntity('Post')).toBe(false);
  });

  it('legt einen Fang an und gibt ihn mit ID und Zeitstempel zurück', () => {
    const record = guestCreate('Catch', { species: 'Hecht', length_cm: 78 });

    expect(record.id).toMatch(/^guest_/);
    expect(record.species).toBe('Hecht');
    expect(record.created_date).toBeTruthy();
    expect(guestList('Catch')).toHaveLength(1);
  });

  it('liefert den neuesten Eintrag zuerst', () => {
    guestCreate('Catch', { species: 'Barsch' });
    guestCreate('Catch', { species: 'Zander' });

    expect(guestList('Catch').map((c) => c.species)).toEqual(['Zander', 'Barsch']);
  });

  it('trennt die Entities voneinander', () => {
    guestCreate('Catch', { species: 'Hecht' });
    guestCreate('Spot', { name: 'Buhne 12' });

    expect(guestList('Catch')).toHaveLength(1);
    expect(guestList('Spot')).toHaveLength(1);
  });

  it('findet, filtert, ändert und löscht Einträge', () => {
    const hecht = guestCreate('Catch', { species: 'Hecht', water: 'Rhein' });
    guestCreate('Catch', { species: 'Zander', water: 'Main' });

    expect(guestGet('Catch', hecht.id).species).toBe('Hecht');
    expect(guestFilter('Catch', { water: 'Rhein' })).toHaveLength(1);
    expect(guestFilter('Catch', { water: null })).toHaveLength(2);

    expect(guestUpdate('Catch', hecht.id, { length_cm: 90 }).length_cm).toBe(90);
    expect(guestUpdate('Catch', 'gibt-es-nicht', { length_cm: 1 })).toBeNull();

    guestDelete('Catch', hecht.id);
    expect(guestList('Catch')).toHaveLength(1);
  });

  it('meldet vorhandene Gastdaten und räumt sie auf', () => {
    expect(hasGuestData()).toBe(false);
    guestCreate('Spot', { name: 'Steg' });
    expect(hasGuestData()).toBe(true);

    clearGuestData();
    expect(hasGuestData()).toBe(false);
  });

  it('überlebt beschädigten localStorage-Inhalt', () => {
    localStorage.setItem('bb_guest_entity_Catch', '{kein json');
    expect(guestList('Catch')).toEqual([]);
  });

  it('meldet einen vollen Gerätespeicher, statt Erfolg vorzutäuschen', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    expect(() => guestCreate('Catch', { species: 'Hecht' })).toThrow(/Gerätespeicher voll/);
    setItem.mockRestore();
  });
});

describe('migrateGuestData', () => {
  it('überträgt alle Datensätze ins Konto und leert den lokalen Speicher', async () => {
    guestCreate('Catch', { species: 'Hecht' });
    guestCreate('Spot', { name: 'Buhne 12' });
    const create = vi.fn().mockResolvedValue({ id: 'server-1' });

    const result = await migrateGuestData({ Catch: { create }, Spot: { create } });

    expect(result).toEqual({ migrated: 2, failed: 0 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(hasGuestData()).toBe(false);
  });

  it('sendet die lokale ID und updated_date nicht mit — die vergibt der Server', async () => {
    guestCreate('Catch', { species: 'Hecht' });
    const create = vi.fn().mockResolvedValue({ id: 'server-1' });

    await migrateGuestData({ Catch: { create } });

    const payload = create.mock.calls[0][0];
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('updated_date');
    expect(payload.species).toBe('Hecht');
    expect(payload.created_date).toBeTruthy();
  });

  it('behält nicht übertragene Datensätze für den nächsten Versuch', async () => {
    guestCreate('Catch', { species: 'Hecht' });
    guestCreate('Catch', { species: 'Zander' });
    const create = vi.fn()
      .mockResolvedValueOnce({ id: 'server-1' })
      .mockRejectedValueOnce(new Error('Netzwerkfehler'));

    const result = await migrateGuestData({ Catch: { create } });

    expect(result).toEqual({ migrated: 1, failed: 1 });
    // Zuerst angelegt wird zuletzt übertragen: der erfolgreiche ist 'Zander'.
    expect(guestList('Catch').map((c) => c.species)).toEqual(['Hecht']);
  });

  it('läuft nicht doppelt, solange eine Migration aktiv ist', async () => {
    guestCreate('Catch', { species: 'Hecht' });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const create = vi.fn().mockImplementation(() => gate.then(() => ({ id: 'server-1' })));

    const first = migrateGuestData({ Catch: { create } });
    const second = await migrateGuestData({ Catch: { create } });
    release();
    await first;

    expect(second).toEqual({ migrated: 0, failed: 0 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lässt Datensätze liegen, wenn es für die Entity keinen Client gibt', async () => {
    guestCreate('Catch', { species: 'Hecht' });

    const result = await migrateGuestData({});

    expect(result).toEqual({ migrated: 0, failed: 1 });
    expect(hasGuestData()).toBe(true);
  });
});
