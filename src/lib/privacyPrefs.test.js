import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readPrivacyPrefs, writePrivacyPrefs, clearLocalCaches, DEFAULT_PRIVACY_PREFS } from './privacyPrefs';
import { queryPermission, requestPermission } from './devicePermissions';

describe('privacyPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('liefert Standardwerte ohne gespeicherte Auswahl', () => {
    expect(readPrivacyPrefs()).toEqual(DEFAULT_PRIVACY_PREFS);
  });

  it('hat das Aktivierungswort standardmäßig aus', () => {
    expect(readPrivacyPrefs().wakeWord).toBe(false);
  });

  it('merkt einzelne Schalter und behält die übrigen', () => {
    writePrivacyPrefs({ wakeWord: true });
    expect(readPrivacyPrefs()).toEqual({ handsFree: true, wakeWord: true, wakeWordPhrase: 'Hey Buddy' });
    writePrivacyPrefs({ handsFree: false });
    expect(readPrivacyPrefs()).toEqual({ handsFree: false, wakeWord: true, wakeWordPhrase: 'Hey Buddy' });
  });

  // Bis Version 1 war das Aktivierungswort an und wurde bei jeder Änderung
  // eines anderen Schalters mitgeschrieben. Solche Altwerte gelten nicht als
  // bewusste Wahl — das Mikrofon soll nach dem Update nicht weiter lauschen.
  it('setzt ein altes gespeichertes Aktivierungswort (ohne Version) auf aus', () => {
    localStorage.setItem('bb_privacy_prefs', JSON.stringify({ handsFree: false, wakeWord: true, wakeWordPhrase: 'Hallo Angelbuddy' }));
    expect(readPrivacyPrefs()).toEqual({ handsFree: false, wakeWord: false, wakeWordPhrase: 'Hallo Angelbuddy' });
  });

  it('behält ein eigenes Aktivierungswort beim Ändern anderer Schalter', () => {
    writePrivacyPrefs({ wakeWordPhrase: 'Hallo Angelbuddy' });
    writePrivacyPrefs({ wakeWord: false, handsFree: false });
    expect(readPrivacyPrefs()).toEqual({
      handsFree: false,
      wakeWord: false,
      wakeWordPhrase: 'Hallo Angelbuddy',
    });
  });

  it('ignoriert beschädigte Werte', () => {
    localStorage.setItem('bb_privacy_prefs', '{"handsFree":"ja"}');
    expect(readPrivacyPrefs().handsFree).toBe(true);
  });

  it('löscht Zwischenspeicher, aber nicht Anmeldung und Gastdaten', async () => {
    localStorage.setItem('bb_offline_pack_meta', '{}');
    localStorage.setItem('bb_token', 'tok');
    localStorage.setItem('bb_guest_entity_Catch', '[]');
    await clearLocalCaches();
    expect(localStorage.getItem('bb_offline_pack_meta')).toBeNull();
    expect(localStorage.getItem('bb_token')).toBe('tok');
    expect(localStorage.getItem('bb_guest_entity_Catch')).toBe('[]');
  });
});

describe('devicePermissions', () => {
  it('meldet unknown ohne Permissions API', async () => {
    const original = navigator.permissions;
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
    await expect(queryPermission('camera')).resolves.toBe('unknown');
    Object.defineProperty(navigator, 'permissions', { value: original, configurable: true });
  });

  it('beendet den Stream nach erteilter Mikrofon-Freigabe', async () => {
    const stop = vi.fn();
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
      configurable: true,
    });
    await expect(requestPermission('microphone')).resolves.toBe('granted');
    expect(stop).toHaveBeenCalled();
    Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
  });

  it('meldet denied bei abgelehnter Freigabe', async () => {
    const original = navigator.mediaDevices;
    const error = Object.assign(new Error('nein'), { name: 'NotAllowedError' });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(error) },
      configurable: true,
    });
    await expect(requestPermission('camera')).resolves.toBe('denied');
    Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
  });
});
