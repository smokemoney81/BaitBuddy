import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAiMode, setAiMode, pickReadyModel, resolveBuddyEngine, formatBytes, AI_MODE_EVENT } from './localModel';

const STATUS = {
  models: [
    { id: 'a', state: 'ready', fitsDevice: true },
    { id: 'b', state: 'ready', fitsDevice: true },
    { id: 'c', state: 'absent', fitsDevice: true },
  ],
};

beforeEach(() => localStorage.clear());

describe('KI-Modus', () => {
  it('ist standardmäßig automatisch und ignoriert ungültige Werte', () => {
    expect(getAiMode()).toBe('auto');
    localStorage.setItem('bb_ai_mode', 'quatsch');
    expect(getAiMode()).toBe('auto');
  });

  it('speichert und meldet Änderungen', () => {
    const listener = vi.fn();
    window.addEventListener(AI_MODE_EVENT, listener);
    setAiMode('device');
    expect(getAiMode()).toBe('device');
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(AI_MODE_EVENT, listener);
  });
});

describe('pickReadyModel', () => {
  it('nimmt das gewählte fertige Modell, sonst das erste', () => {
    expect(pickReadyModel(STATUS, 'b').id).toBe('b');
    expect(pickReadyModel(STATUS, 'c').id).toBe('a');
    expect(pickReadyModel(null)).toBeNull();
  });
});

describe('resolveBuddyEngine', () => {
  const ready = { id: 'a' };
  it('Automatik: Cloud online, Gerät offline', () => {
    expect(resolveBuddyEngine({ mode: 'auto', online: true, readyModel: ready })).toBe('cloud');
    expect(resolveBuddyEngine({ mode: 'auto', online: false, readyModel: ready })).toBe('local');
    expect(resolveBuddyEngine({ mode: 'auto', online: false, readyModel: null })).toBe('cloud');
  });
  it('Gerät: nie Cloud', () => {
    expect(resolveBuddyEngine({ mode: 'device', online: true, readyModel: ready })).toBe('local');
    expect(resolveBuddyEngine({ mode: 'device', online: true, readyModel: null })).toBe('none');
  });
  it('Cloud: immer Cloud', () => {
    expect(resolveBuddyEngine({ mode: 'cloud', online: false, readyModel: ready })).toBe('cloud');
  });
});

describe('formatBytes', () => {
  it('zeigt GB und MB deutsch', () => {
    expect(formatBytes(2_740_937_888)).toBe('2,6 GB');
    expect(formatBytes(300 * 1024 * 1024)).toBe('300 MB');
    expect(formatBytes(0)).toBe('0 MB');
  });
});
