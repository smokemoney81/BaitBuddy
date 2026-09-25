import { describe, it, expect, beforeEach } from 'vitest';
import { fetchLatestApk, shouldOfferApk, APK_ASSET_NAME } from './androidApk';

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

describe('fetchLatestApk', () => {
  beforeEach(() => sessionStorage.clear());

  it('liefert Download-URL, Version und Größe der APK', async () => {
    const fetchImpl = async () => okResponse({
      name: '2.4.0',
      assets: [
        { name: 'other.zip', browser_download_url: 'https://x/other.zip', size: 1 },
        { name: APK_ASSET_NAME, browser_download_url: 'https://x/baitbuddy.apk', size: 7340032 },
      ],
    });
    await expect(fetchLatestApk({ fetchImpl })).resolves.toEqual({ url: 'https://x/baitbuddy.apk', version: '2.4.0', sizeMb: 7 });
  });

  it('ohne Release oder ohne APK-Asset: null', async () => {
    await expect(fetchLatestApk({ fetchImpl: async () => ({ ok: false, status: 404 }) })).resolves.toBeNull();
    sessionStorage.clear();
    await expect(fetchLatestApk({ fetchImpl: async () => okResponse({ assets: [] }) })).resolves.toBeNull();
  });

  it('cacht das Ergebnis, aber keine Rate-Limit-Fehler', async () => {
    let calls = 0;
    const limited = async () => { calls += 1; return { ok: false, status: 403 }; };
    await fetchLatestApk({ fetchImpl: limited });
    await fetchLatestApk({ fetchImpl: limited });
    expect(calls).toBe(2);

    const ok = async () => { calls += 1; return okResponse({ tag_name: 'v1', assets: [{ name: APK_ASSET_NAME, browser_download_url: 'u', size: 0 }] }); };
    await fetchLatestApk({ fetchImpl: ok });
    await fetchLatestApk({ fetchImpl: ok });
    expect(calls).toBe(3);
  });
});

describe('shouldOfferApk', () => {
  const win = (ua, extra = {}) => ({ navigator: { userAgent: ua, maxTouchPoints: 0 }, ...extra });

  it('bietet die APK im Android-Browser und am Desktop an', () => {
    expect(shouldOfferApk(win('Mozilla/5.0 (Linux; Android 14) Chrome/128'))).toBe(true);
    expect(shouldOfferApk(win('Mozilla/5.0 (Windows NT 10.0) Chrome/128'))).toBe(true);
  });

  it('nicht in der installierten App und nicht auf iOS', () => {
    expect(shouldOfferApk(win('Android', { Capacitor: { isNativePlatform: () => true } }))).toBe(false);
    expect(shouldOfferApk(win('Android', { AndroidBilling: {} }))).toBe(false);
    expect(shouldOfferApk(win('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'))).toBe(false);
  });
});
