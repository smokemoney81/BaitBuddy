// Ad Remote Config — wird von /api/ads/config geladen und 5 Min. gecacht.
// Änderungen am Werbemodell ohne App-Update möglich. `ads_enabled` ist der
// Hauptschalter aus dem Admin-Bereich (Werbung für alle aus).
import { timeoutSignal } from '@/lib/abortCompat';

const CACHE_KEY = 'bb_ad_config';
// Kurz, damit „Werbung aus“ im Admin-Bereich zügig bei allen ankommt.
const CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_AD_CONFIG = {
  ads_enabled: true,

  guest_interstitial_enabled: true,
  guest_interstitial_cooldown_s: 120,
  guest_interstitial_duration_s: 30,
  guest_interstitial_skip_after_s: 30,

  basic_native_enabled: true,
  basic_native_interval: 4,   // jede N-te Listenposition

  basic_banner_enabled: true,

  basic_rewarded_enabled: true,
  basic_rewarded_rewards: ['ki_analyse', 'ki_voice_30min', 'satellite', 'premium_tool_1h'],

  pro_ads_enabled: false,
  ultimate_ads_enabled: false,
  day_pass_ads_enabled: false,
  trial_ads_enabled: false,
};

let _config = null;
let _fetchedAt = 0;
let _fetchPromise = null;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL_MS) return data;
  } catch {
    // ignorieren
  }
  return null;
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignorieren
  }
}

export async function loadAdConfig() {
  if (_config && Date.now() - _fetchedAt < CACHE_TTL_MS) return _config;

  const cached = readCache();
  if (cached) {
    _config = cached;
    _fetchedAt = Date.now();
    return _config;
  }

  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const res = await fetch('/api/ads/config', {
        signal: timeoutSignal(4000),
      });
      if (res.ok) {
        const data = await res.json();
        _config = { ...DEFAULT_AD_CONFIG, ...data };
      } else {
        _config = { ...DEFAULT_AD_CONFIG };
      }
    } catch {
      _config = { ...DEFAULT_AD_CONFIG };
    }
    _fetchedAt = Date.now();
    writeCache(_config);
    _fetchPromise = null;
    return _config;
  })();

  return _fetchPromise;
}

export function getAdConfig() {
  return _config ?? DEFAULT_AD_CONFIG;
}
