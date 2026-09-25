// Globale App-Schalter, die der Superuser im Admin-Bereich setzt:
//   ads_enabled     — Werbung für alle an/aus (Standard: an)
//   all_tools_free  — alle Tools für alle freigeschaltet (Standard: aus)
//
// Gespeichert als eine Zeile in `app_config` (key = 'app_settings', Migration
// 20260916220654_create_ad_tables.sql). Lesen dürfen alle (die Werte sind
// öffentlich), schreiben nur das Backend über die Service-Role.
//
// Fehlt die Tabelle oder scheitert das Lesen, gelten die Standardwerte — ein
// DB-Problem darf weder die Werbung abschalten noch alle Tools verschenken.
import { supabase } from './supabase.js';

export const APP_SETTINGS_KEY = 'app_settings';
export const DEFAULT_APP_SETTINGS = Object.freeze({ ads_enabled: true, all_tools_free: false });

// Kurz genug, dass ein Umschalten auf allen Instanzen binnen einer halben
// Minute greift; lang genug, dass nicht jede Anfrage die DB fragt.
const CACHE_MS = 30 * 1000;
let cache = null;
let cachedAt = 0;

function normalize(value, updatedAt = null) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    ads_enabled: v.ads_enabled !== false,
    all_tools_free: v.all_tools_free === true,
    updated_at: updatedAt,
    updated_by: typeof v.updated_by === 'string' ? v.updated_by : null,
  };
}

export async function getAppSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value, updated_at')
      .eq('key', APP_SETTINGS_KEY)
      .maybeSingle();
    if (error) throw error;
    cache = normalize(data?.value, data?.updated_at || null);
  } catch (e) {
    console.warn('[appSettings] Lesen fehlgeschlagen, nutze Standardwerte:', e?.message || e);
    cache = normalize(DEFAULT_APP_SETTINGS);
  }
  cachedAt = Date.now();
  return cache;
}

export async function isAllToolsFree() {
  return (await getAppSettings()).all_tools_free;
}

// Übernimmt nur echte Booleans; alles andere bleibt, wie es ist.
export async function updateAppSettings(patch, updatedBy) {
  const current = await getAppSettings({ fresh: true });
  const value = {
    ads_enabled: typeof patch?.ads_enabled === 'boolean' ? patch.ads_enabled : current.ads_enabled,
    all_tools_free: typeof patch?.all_tools_free === 'boolean' ? patch.all_tools_free : current.all_tools_free,
    updated_by: updatedBy || null,
  };
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: APP_SETTINGS_KEY, value, updated_at: updatedAt }, { onConflict: 'key' });
  if (error) return { error };
  cache = normalize(value, updatedAt);
  cachedAt = Date.now();
  return { settings: cache };
}

// Nur für Tests.
export function _resetAppSettingsCache() {
  cache = null;
  cachedAt = 0;
}
