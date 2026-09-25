// Direkte Android-Installation (APK) für Nutzer im Browser.
//
// Die APK wird vom Workflow .github/workflows/build-android.yml als Asset
// `baitbuddy.apk` an ein GitHub-Release gehängt. Welche Version aktuell ist,
// liefert die öffentliche GitHub-API (CORS-freigegeben, ohne Token). Gibt es
// noch kein Release mit APK, liefert fetchLatestApk null und die Oberfläche
// zeigt keinen Button — kein Link ins Leere.

export const APK_REPO = 'smokemoney81/BaitBuddy';
export const APK_ASSET_NAME = 'baitbuddy.apk';
const CACHE_KEY = 'bb_latest_apk';
const CACHE_MS = 60 * 60 * 1000; // GitHub erlaubt ohne Token 60 Anfragen/Stunde pro IP

function readCache(now) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const { at, value } = JSON.parse(raw);
    return now - at < CACHE_MS ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(value, now) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, value }));
  } catch {
    // privater Modus o. Ä. — dann eben ohne Cache
  }
}

/** Neueste APK aus den GitHub-Releases oder null, wenn es (noch) keine gibt. */
export async function fetchLatestApk({ fetchImpl = fetch, now = Date.now(), signal } = {}) {
  const cached = readCache(now);
  if (cached !== undefined) return cached;

  const res = await fetchImpl(`https://api.github.com/repos/${APK_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  });
  // 404 = noch kein Release. Andere Fehler (Rate-Limit) nicht cachen.
  if (!res.ok) {
    if (res.status === 404) writeCache(null, now);
    return null;
  }
  const release = await res.json();
  const asset = (release?.assets || []).find((a) => a?.name === APK_ASSET_NAME);
  const value = asset?.browser_download_url
    ? {
        url: asset.browser_download_url,
        version: release.name || release.tag_name || '',
        sizeMb: typeof asset.size === 'number' ? Math.round((asset.size / 1048576) * 10) / 10 : null,
      }
    : null;
  writeCache(value, now);
  return value;
}

/**
 * Nur im Browser anbieten: nicht in der installierten App (Capacitor) und nicht
 * auf iPhone/iPad, die keine APK installieren können.
 */
export function shouldOfferApk(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return false;
  const cap = win.Capacitor;
  const isNative = typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : Boolean(cap?.isNativePlatform);
  if (isNative || win.AndroidBilling) return false;
  const ua = win.navigator?.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && win.navigator?.maxTouchPoints > 1);
  return !isIOS;
}

export function isAndroidBrowser(win = typeof window !== 'undefined' ? window : undefined) {
  return /Android/i.test(win?.navigator?.userAgent || '');
}
