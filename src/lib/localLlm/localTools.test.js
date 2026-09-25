import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { executeBuddyAction, entities } = vi.hoisted(() => ({
  executeBuddyAction: vi.fn(),
  entities: { Catch: { list: vi.fn() }, Spot: { list: vi.fn() }, RuleEntry: { list: vi.fn() } },
}));
vi.mock('@/utils/buddyActions', () => ({ executeBuddyAction }));
vi.mock('@/api/frontendClient', () => ({ entities }));

import { executeLocalTool, groundCatchArguments, LOCAL_TOOLS, ACTION_TOOLS } from './localTools';

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('groundCatchArguments', () => {
  it('verwirft Werte, die der Nutzer nie genannt hat', () => {
    expect(groundCatchArguments({ species: 'Hecht', length_cm: 80, weight_kg: 15 }, ['Hab einen Hecht mit 80 cm gefangen']))
      .toEqual({ species: 'Hecht', length_cm: 80 });
  });

  it('akzeptiert Komma-Schreibweise und Gramm-Angaben', () => {
    expect(groundCatchArguments({ species: 'Barsch', weight_kg: 1.2 }, ['Barsch, 1,2 kg'])).toEqual({ species: 'Barsch', weight_kg: 1.2 });
    expect(groundCatchArguments({ species: 'Barsch', weight_kg: 0.8 }, ['Barsch mit 800 g'])).toEqual({ species: 'Barsch', weight_kg: 0.8 });
  });

  it('prüft Köder und Zurücksetzen gegen den Text', () => {
    expect(groundCatchArguments({ species: 'Zander', bait_used: 'Gummifisch', is_released: true }, ['Zander auf Gummifisch, wieder zurückgesetzt']))
      .toEqual({ species: 'Zander', bait_used: 'Gummifisch', is_released: true });
    expect(groundCatchArguments({ species: 'Zander', bait_used: 'Wobbler', is_released: true }, ['Zander gefangen']))
      .toEqual({ species: 'Zander' });
  });

  it('sieht 180 nicht als Nennung von 80', () => {
    expect(groundCatchArguments({ species: 'Wels', length_cm: 80 }, ['Wels mit 180 cm'])).toEqual({ species: 'Wels' });
  });
});

describe('executeLocalTool', () => {
  it('sucht in der Wissensbasis', async () => {
    const out = await executeLocalTool({ name: 'search_knowledge', arguments: { query: 'Dropshot montieren' } });
    expect(JSON.parse(out.result)[0].frage).toMatch(/Drop-?Shot/i);
  });

  it('liefert Fänge gefiltert mit Auswertung', async () => {
    entities.Catch.list.mockResolvedValue([
      { species: 'Zander', length_cm: 58, bait_used: 'Gummifisch', catch_time: '2026-09-20T20:00:00Z' },
      { species: 'Zander', length_cm: 49, bait_used: 'Gummifisch', catch_time: '2026-09-12T20:00:00Z' },
      { species: 'Hecht', length_cm: 70, bait_used: 'Wobbler', catch_time: '2026-09-01T10:00:00Z' },
    ]);
    const out = JSON.parse((await executeLocalTool({ name: 'get_catches', arguments: { species: 'zander' } })).result);
    expect(out.anzahl_gesamt).toBe(2);
    expect(out.faenge[0]).toMatchObject({ art: 'Zander', laenge_cm: 58, koeder: 'Gummifisch' });
    expect(out.auswertung.join(' ')).toContain('Gummifisch');
  });

  it('meldet offline ehrlich, statt ein leeres Fangbuch zu behaupten', async () => {
    setOnline(false);
    entities.Catch.list.mockResolvedValue([]);
    const out = JSON.parse((await executeLocalTool({ name: 'get_catches', arguments: {} })).result);
    expect(out.fehler).toMatch(/Internet/);
  });

  it('fragt keinen Standort an, der nicht freigegeben ist', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { onLine: true, geolocation: { getCurrentPosition }, permissions: { query: async () => ({ state: 'prompt' }) } });
    const out = JSON.parse((await executeLocalTool({ name: 'get_weather', arguments: {} })).result);
    expect(out.fehler).toMatch(/Standort/);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('holt Wetter und bestes Fenster für einen bekannten Standort', async () => {
    const now = Math.floor(Date.now() / 3600000) * 3600 + 3600;
    const hours = [0, 1, 2].map(i => now + i * 3600);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 14, weather_code: 2, wind_speed_10m: 9, pressure_msl: 1016, precipitation: 0, cloud_cover: 50 },
        hourly: {
          time: hours,
          temperature_2m: [15, 15, 14], wind_speed_10m: [9, 9, 8], pressure_msl: [1015, 1015, 1015],
          precipitation: [0, 0, 0], precipitation_probability: [0, 0, 0], cloud_cover: [60, 60, 60], weather_code: [2, 2, 2],
        },
      }),
    })));
    const out = JSON.parse((await executeLocalTool({ name: 'get_weather', arguments: {} }, { userLocation: { latitude: 50.9, longitude: 6.6 } })).result);
    expect(out).toMatchObject({ wetter: 'Leicht bewölkt', temperatur_c: 14, wind_kmh: 9 });
    expect(out.bestes_fenster.bedingungs_index).toBeGreaterThan(0);
    expect(fetch.mock.calls[0][0]).toContain('latitude=50.9');
  });

  it('trägt Fänge nur mit belegten Angaben ein', async () => {
    executeBuddyAction.mockResolvedValue({ success: true, message: 'Fang Hecht wurde im Fangbuch eingetragen.' });
    const navigate = vi.fn();
    const out = await executeLocalTool(
      { name: 'log_catch', arguments: { species: 'Hecht', length_cm: 80, weight_kg: 15 } },
      { navigate, userTexts: ['Hecht mit 80 cm'] },
    );
    expect(executeBuddyAction).toHaveBeenCalledWith({ type: 'log_catch', params: { species: 'Hecht', length_cm: 80 } }, { navigate, userLocation: null });
    expect(out.notice).toBe('Fang Hecht wurde im Fangbuch eingetragen.');
  });

  it('speichert offline nichts', async () => {
    setOnline(false);
    const out = JSON.parse((await executeLocalTool({ name: 'log_catch', arguments: { species: 'Hecht' } }, { userTexts: ['Hecht'] })).result);
    expect(out.ok).toBe(false);
    expect(executeBuddyAction).not.toHaveBeenCalled();
  });

  it('verschiebt den Seitenwechsel und prüft die Seite', async () => {
    expect((await executeLocalTool({ name: 'open_page', arguments: { page: 'karte' } })).deferredAction)
      .toEqual({ type: 'navigate', params: { page: 'karte' } });
    expect(JSON.parse((await executeLocalTool({ name: 'open_page', arguments: { page: 'https://evil' } })).result).fehler).toBeTruthy();
  });

  it('meldet unbekannte Werkzeuge als Fehler statt zu werfen', async () => {
    expect(JSON.parse((await executeLocalTool({ name: 'post_community', arguments: { text: 'x' } })).result).fehler).toMatch(/Unbekannt/);
  });

  it('jedes Aktions-Werkzeug ist beschrieben', () => {
    const names = LOCAL_TOOLS.map(t => t.function.name);
    for (const tool of Object.keys(ACTION_TOOLS)) expect(names).toContain(tool);
  });
});
