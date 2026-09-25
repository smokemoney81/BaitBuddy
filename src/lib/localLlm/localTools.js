// Werkzeuge des lokalen KI-Buddys (Qwen3.5 auf dem Gerät).
//
// Das Modell muss nicht alles wissen: Es erkennt Absicht, Ort, Zeit und
// Zielfisch — die aktuellen Fakten holen diese Tools aus der App. Lese-Tools
// liefern Daten zurück ans Modell; Aktions-Tools führen dieselben Aktionen aus
// wie der Cloud-Buddy (`executeBuddyAction`, Katalog in
// backend/src/lib/buddyActionCatalog.js).
//
// Bewusst NICHT lokal: post_community, support_ticket und open_url. Ein
// öffentlicher Beitrag, ein Ticket an den Support oder ein externer Link wären
// Folgen eines Missverständnisses, die sich nicht zurücknehmen lassen — das
// bleibt der Cloud-KI und den jeweiligen Seiten vorbehalten.
// `buddyActionCatalog.sync.test.js` prüft, dass diese Liste vollständig ist.

import { getRelevantFaqEntries } from '@/lib/buddyFaq';
import { forecastHours, bestWindow, weatherDescription } from '@/lib/fishingConditions';
import { computeInsights } from '@/lib/fishingInsights';
import { isInClosedSeason } from '@/lib/closedSeason';
import { timeoutSignal } from '@/lib/abortCompat';
import { entities } from '@/api/frontendClient';
import { executeBuddyAction } from '@/utils/buddyActions';
import { NAVIGATE_PAGES } from '../../../backend/src/lib/buddyActionCatalog.js';

/** Aktionen des Cloud-Katalogs, die lokal absichtlich fehlen (siehe oben). */
export const CLOUD_ONLY_ACTIONS = ['post_community', 'support_ticket', 'open_url'];

const MAX_RESULT_CHARS = 1500;

function fn(name, description, properties = {}, required = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

export const LOCAL_TOOLS = [
  fn('search_knowledge',
    'Geprüfte Wissensbasis: Fischarten, Köder, Montagen, Knoten, Ausrüstung, Wetter, Jahreszeiten, Regeln, App-Funktionen.',
    { query: { type: 'string', description: 'Suchbegriffe' } },
    ['query']),
  fn('get_weather',
    'Wetter am Standort des Nutzers und bestes Angelfenster der nächsten 24 Stunden.'),
  fn('get_catches',
    'Fänge aus dem Fangbuch des Nutzers mit Auswertung (bester Köder, beste Uhrzeit).',
    {
      species: { type: 'string', description: 'Fischart' },
      limit: { type: 'integer', description: '1-20' },
    }),
  fn('get_spots', 'Gespeicherte Angelplätze des Nutzers.'),
  fn('get_closed_seasons',
    'Heute geltende Schonzeiten mit Region und Mindestmaß.',
    { species: { type: 'string', description: 'Fischart' } }),
  fn('log_catch',
    'Trägt einen Fang ins Fangbuch ein.',
    {
      species: { type: 'string' },
      length_cm: { type: 'number' },
      weight_kg: { type: 'number' },
      bait_used: { type: 'string' },
      notes: { type: 'string' },
      is_released: { type: 'boolean', description: 'zurückgesetzt' },
    },
    ['species']),
  fn('add_spot',
    'Speichert den aktuellen Standort als Angelplatz.',
    {
      name: { type: 'string', description: 'Name des Spots' },
      water_type: { type: 'string', enum: ['see', 'fluss', 'teich', 'kanal', 'bach'] },
      notes: { type: 'string' },
    },
    ['name']),
  fn('create_trip',
    'Legt eine Tour im Trip-Planer an.',
    {
      title: { type: 'string' },
      target_fish: { type: 'string' },
      spot_info: { type: 'string' },
      gear_summary: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
    },
    ['title', 'target_fish']),
  fn('open_page',
    'Öffnet eine Seite der App.',
    { page: { type: 'string', enum: NAVIGATE_PAGES } },
    ['page']),
];

/** Tool-Name → Aktionstyp in `executeBuddyAction`. */
export const ACTION_TOOLS = {
  log_catch: 'log_catch',
  add_spot: 'add_spot',
  create_trip: 'create_trip',
  open_page: 'navigate',
};

function clip(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)} …(gekürzt)` : text;
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function day(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('de-DE') : null;
}

function hourLabel(ms) {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Standort nur, wenn er schon vorliegt oder bereits erlaubt ist — der Buddy
 * löst keinen Berechtigungsdialog aus (CLAUDE.md: nie blind anfordern).
 */
async function currentLocation(ctx) {
  if (ctx.userLocation?.latitude != null && ctx.userLocation?.longitude != null) return ctx.userLocation;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  try {
    const perm = await navigator.permissions?.query?.({ name: 'geolocation' });
    if (perm && perm.state !== 'granted') return null;
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

async function searchKnowledge({ query }) {
  const entries = getRelevantFaqEntries(String(query || ''), { limit: 2 });
  if (!entries.length) return { treffer: 0, hinweis: 'Nichts in der Wissensbasis — antworte vorsichtig aus Allgemeinwissen.' };
  return entries.map(e => ({ frage: e.question, antwort: Array.isArray(e.answer) ? e.answer[0] : e.answer }));
}

async function getWeather(_args, ctx) {
  if (isOffline()) return { fehler: 'Keine Internetverbindung — Wetter nicht abrufbar.' };
  const loc = await currentLocation(ctx);
  if (!loc) return { fehler: 'Standort ist nicht freigegeben. Der Nutzer kann ihn in den Einstellungen unter Privatsphäre erlauben.' };
  const params = new URLSearchParams({
    latitude: String(Number(loc.latitude)),
    longitude: String(Number(loc.longitude)),
    current: 'temperature_2m,weather_code,wind_speed_10m,pressure_msl,precipitation,cloud_cover',
    hourly: 'temperature_2m,wind_speed_10m,pressure_msl,precipitation,precipitation_probability,cloud_cover,weather_code',
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '2',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: timeoutSignal(8000) });
  if (!res.ok) return { fehler: 'Wetterdienst gerade nicht erreichbar.' };
  const data = await res.json();
  const c = data?.current || {};
  const hours = forecastHours(data);
  const window = bestWindow(hours.filter(h => h.time <= Date.now() + 86400000));
  return {
    wetter: weatherDescription(c.weather_code),
    temperatur_c: c.temperature_2m,
    wind_kmh: c.wind_speed_10m,
    luftdruck_hpa: c.pressure_msl,
    niederschlag_mm: c.precipitation,
    bewoelkung_prozent: c.cloud_cover,
    bestes_fenster: window
      ? { von: hourLabel(window.start), bis: hourLabel(window.end), bedingungs_index: window.index }
      : null,
    hinweis: 'Der Bedingungs-Index (0-100) ist eine Planungshilfe aus Temperatur, Wind, Regen, Luftdruck und Bewölkung, keine Fangwahrscheinlichkeit.',
  };
}

async function getCatches({ species, limit }) {
  const catches = await entities.Catch.list('-catch_time', 50);
  if (!catches.length) {
    return isOffline()
      ? { fehler: 'Keine Internetverbindung — Fangbuch nicht abrufbar.' }
      : { faenge: [], hinweis: 'Das Fangbuch ist leer.' };
  }
  const wanted = String(species || '').trim().toLowerCase();
  const filtered = wanted ? catches.filter(c => String(c.species || '').toLowerCase().includes(wanted)) : catches;
  const n = Math.min(20, Math.max(1, Number(limit) || 10));
  return {
    anzahl_gesamt: filtered.length,
    faenge: filtered.slice(0, n).map(c => ({
      art: c.species,
      laenge_cm: c.length_cm ?? null,
      gewicht_kg: c.weight_kg ?? null,
      koeder: c.bait_used || null,
      datum: day(c.catch_time || c.created_at),
      zurueckgesetzt: c.is_released ?? null,
    })),
    auswertung: computeInsights(filtered).map(i => i.text),
  };
}

async function getSpots() {
  const spots = await entities.Spot.list('', 30);
  if (!spots.length) {
    return isOffline() ? { fehler: 'Keine Internetverbindung — Spots nicht abrufbar.' } : { spots: [], hinweis: 'Noch keine Spots gespeichert.' };
  }
  return { spots: spots.slice(0, 15).map(s => ({ name: s.name, gewaesser: s.water_type || null, favorit: !!s.is_favorite })) };
}

async function getClosedSeasons({ species }) {
  const rules = await entities.RuleEntry.list();
  if (!rules.length) return { fehler: isOffline() ? 'Keine Internetverbindung — Regeln nicht abrufbar.' : 'Keine Regeldaten vorhanden.' };
  const wanted = String(species || '').trim().toLowerCase();
  const active = rules
    .filter(r => isInClosedSeason(r.closed_from, r.closed_to))
    .filter(r => !wanted || String(r.fish || '').toLowerCase().includes(wanted));
  return {
    heute_schonzeit: active.slice(0, 25).map(r => ({
      fisch: r.fish,
      region: r.bundesland || r.region || null,
      bis: r.closed_to ? String(r.closed_to).slice(5) : null,
      mindestmass_cm: r.min_size_cm ?? null,
    })),
    hinweis: 'Regeln unterscheiden sich je Bundesland und Gewässer; verbindlich sind die örtlichen Vorschriften.',
  };
}

const READ_TOOLS = {
  search_knowledge: searchKnowledge,
  get_weather: getWeather,
  get_catches: getCatches,
  get_spots: getSpots,
  get_closed_seasons: getClosedSeasons,
};

function mentionsNumber(texts, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  const variants = new Set([String(n), String(n).replace('.', ',')]);
  if (Number.isInteger(n)) variants.add(`${n},0`);
  return texts.some(text => [...variants].some(v => new RegExp(`(^|[^\\d])${v.replace('.', '\\.')}([^\\d]|$)`).test(text)));
}

function mentionsWord(texts, value) {
  const words = String(value || '').toLowerCase().split(/[^a-zäöüß0-9]+/).filter(w => w.length >= 4);
  return words.length > 0 && words.some(w => texts.some(text => text.toLowerCase().includes(w)));
}

/**
 * Nimmt nur Angaben ins Fangbuch, die der Nutzer selbst genannt hat. Kleine
 * Modelle füllen optionale Felder gern mit plausiblen Werten auf (im Test ein
 * erfundenes Gewicht von 15 kg) — ein falscher Eintrag ist schlimmer als ein
 * leeres Feld.
 */
export function groundCatchArguments(args, userTexts = []) {
  const texts = userTexts.filter(t => typeof t === 'string');
  if (!texts.length) return args;
  const out = { species: args.species };
  if (args.length_cm != null && mentionsNumber(texts, args.length_cm)) out.length_cm = args.length_cm;
  if (args.weight_kg != null) {
    const kg = Number(args.weight_kg);
    if (mentionsNumber(texts, kg) || mentionsNumber(texts, Math.round(kg * 1000))) out.weight_kg = kg;
  }
  if (args.bait_used && mentionsWord(texts, args.bait_used)) out.bait_used = args.bait_used;
  if (args.notes && mentionsWord(texts, args.notes)) out.notes = args.notes;
  if (typeof args.is_released === 'boolean' && texts.some(t => /zur(ü|ue)ck|released|releas|schwimmen lassen|freigelassen/i.test(t))) {
    out.is_released = args.is_released;
  }
  return out;
}

/**
 * Führt einen Tool-Call aus.
 * @returns {Promise<{ result: string, notice?: string, deferredAction?: object }>}
 *   result = Text für <tool_response>; notice = Systemhinweis im Chat;
 *   deferredAction = Seitenwechsel, erst nach der Antwort auszuführen.
 */
export async function executeLocalTool(call, ctx = {}) {
  const name = call?.name;
  const args = call?.arguments || {};
  try {
    if (READ_TOOLS[name]) {
      return { result: clip(await READ_TOOLS[name](args, ctx)) };
    }
    const actionType = ACTION_TOOLS[name];
    if (!actionType) return { result: clip({ fehler: `Unbekanntes Werkzeug: ${name}` }) };

    if (actionType === 'navigate') {
      if (!NAVIGATE_PAGES.includes(args.page)) return { result: clip({ fehler: 'Unbekannte Seite.' }) };
      // Ein sofortiger Seitenwechsel würde den Chat mitten in der Antwort schließen.
      return {
        result: clip({ ok: true, hinweis: 'Die Seite öffnet sich, sobald du geantwortet hast.' }),
        deferredAction: { type: 'navigate', params: { page: args.page } },
      };
    }
    if (isOffline()) {
      return { result: clip({ ok: false, fehler: 'Ohne Internetverbindung kann ich gerade nichts speichern.' }) };
    }
    const userLocation = actionType === 'add_spot' ? await currentLocation(ctx) : ctx.userLocation || null;
    const params = actionType === 'log_catch' ? groundCatchArguments(args, ctx.userTexts) : args;
    const outcome = await executeBuddyAction({ type: actionType, params }, { navigate: ctx.navigate, userLocation });
    return {
      result: clip({ ok: !!outcome?.success, meldung: outcome?.message || null }),
      notice: outcome?.success ? outcome?.message : undefined,
    };
  } catch (err) {
    return { result: clip({ fehler: `Werkzeug fehlgeschlagen: ${err?.message || 'unbekannt'}` }) };
  }
}
