import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import TideService from './TideService';

// Regressionstests fuer die in Meilenstein 2 benannten Tide-Probleme.
describe('TideService – NOAA-Zeitstempel', () => {
  it('liest "YYYY-MM-DD HH:mm" als UTC, nicht als Lokalzeit', () => {
    // NOAA liefert die Zeitstempel auf Anfrage in GMT und ohne Zonenangabe.
    // `new Date(...)` haette dieses Format als Lokalzeit gelesen und jeden
    // Vergleich mit `now` um den Geraete-Offset verschoben.
    const parsed = TideService.parseNoaaTime('2026-05-04 14:30');
    expect(parsed.toISOString()).toBe('2026-05-04T14:30:00.000Z');
  });

  it('kommt auch mit ISO-Schreibweise zurecht', () => {
    expect(TideService.parseNoaaTime('2026-05-04T06:00').toISOString())
      .toBe('2026-05-04T06:00:00.000Z');
  });

  it('liefert null statt Invalid Date bei unbrauchbaren Werten', () => {
    expect(TideService.parseNoaaTime('')).toBeNull();
    expect(TideService.parseNoaaTime(null)).toBeNull();
    expect(TideService.parseNoaaTime('kein Datum')).toBeNull();
  });

  it('formatiert das Anfragefenster in UTC passend zu time_zone=gmt', () => {
    expect(TideService.formatNOAADate(new Date('2026-05-04T23:30:00Z'))).toBe('20260504');
  });
});

describe('TideService – Extrema', () => {
  it('uebernimmt den von NOAA gelieferten Typ (H/L)', () => {
    // Mit `interval=hilo` markiert NOAA jedes Extremum selbst. Frueher wurde
    // dieses Feld ignoriert und aus Nachbarwerten geraten — bei der
    // 6-Minuten-Zeitreihe war damit fast jeder Punkt "neutral".
    const result = TideService.categorizeExtrema([
      { t: '2026-05-04 03:12', v: '0.42', type: 'L' },
      { t: '2026-05-04 09:24', v: '3.10', type: 'H' },
      { t: '2026-05-04 15:36', v: '0.38', type: 'L' },
    ]);

    expect(result.map(r => r.type)).toEqual(['low', 'high', 'low']);
    expect(result[1].v).toBe(3.1);
    expect(result[1].date.toISOString()).toBe('2026-05-04T09:24:00.000Z');
  });

  it('leitet den Typ nur ab, wenn NOAA keinen liefert', () => {
    const result = TideService.categorizeExtrema([
      { t: '2026-05-04 00:00', v: '1.0' },
      { t: '2026-05-04 06:00', v: '3.0' },
      { t: '2026-05-04 12:00', v: '1.0' },
    ]);
    expect(result[1].type).toBe('high');
  });
});

describe('TideService – aktueller Pegel', () => {
  const tides = [
    { t: '2026-05-04 06:00', date: new Date('2026-05-04T06:00:00Z'), v: 1.0, type: 'low' },
    { t: '2026-05-04 12:00', date: new Date('2026-05-04T12:00:00Z'), v: 3.0, type: 'high' },
  ];

  it('interpoliert zwischen den Extrema statt die Hoehe des naechsten zu melden', () => {
    // `height` war schlicht der Wert des NAECHSTEN Extremums — also nie der
    // aktuelle Stand, sondern einer, der erst Stunden spaeter erreicht wird.
    const state = TideService.getCurrentTideState(tides, new Date('2026-05-04T09:00:00Z'));
    expect(state.height).toBeCloseTo(2.0, 2);
    expect(state.height).not.toBe(3.0);
  });

  it('erreicht an den Extrema selbst deren Werte', () => {
    expect(TideService.interpolateHeight(tides[0], tides[1], new Date('2026-05-04T06:00:00Z')))
      .toBeCloseTo(1.0, 2);
    expect(TideService.interpolateHeight(tides[0], tides[1], new Date('2026-05-04T12:00:00Z')))
      .toBeCloseTo(3.0, 2);
  });

  it('meldet steigendes Wasser vor dem Hochwasser', () => {
    const state = TideService.getCurrentTideState(tides, new Date('2026-05-04T09:00:00Z'));
    expect(state.type).toBe('Steigend');
    expect(state.nextEvent).toBe('Hochwasser');
    expect(state.timeToNext.totalMinutes).toBe(180);
  });

  it('faellt ohne vorheriges Extremum auf den naechsten Wert zurueck', () => {
    expect(TideService.interpolateHeight(null, tides[1], new Date('2026-05-04T09:00:00Z')))
      .toBe(3.0);
  });
});

describe('TideService – Mondphase', () => {
  it('nutzt dieselbe Quelle wie der SolunarService', async () => {
    const { default: SolunarService } = await import('./SolunarService');
    const date = new Date('2026-05-04T12:00:00Z');
    expect(TideService.calculateMoonPhase(date)).toBe(SolunarService.getMoonPhase(date));
  });
});

describe('TideService – Stationswahl', () => {
  beforeEach(() => {
    TideService.stationsCache.clear();
  });

  it('waehlt die naechstgelegene Station', async () => {
    // Cuxhaven (53.87 / 8.72) liegt am naechsten an der Elbmuendung.
    const station = await TideService.findNearestStation(53.9, 8.7);
    expect(station.name).toBe('Cuxhaven');
  });

  it('waehlt fuer Sylt die dortige Station', async () => {
    const station = await TideService.findNearestStation(55.0, 8.4);
    expect(station.name).toBe('List auf Sylt');
  });
});

describe('TideService – Empfehlungstext', () => {
  it('bewertet nach der Gesamtzeit, nicht nach Stunden und Minuten getrennt', () => {
    // `0h45m` galt frueher als nicht optimal, `1h20m` dagegen als optimal.
    const optimal = TideService.getTideRecommendation({
      nextEvent: 'Hochwasser',
      timeToNext: { hours: 0, minutes: 45, totalMinutes: 45 },
    });
    expect(optimal).toMatch(/^Optimal/);

    const good = TideService.getTideRecommendation({
      nextEvent: 'Hochwasser',
      timeToNext: { hours: 2, minutes: 30, totalMinutes: 150 },
    });
    expect(good).toMatch(/^Gut/);
  });

  it('meldet fehlende Daten klar', () => {
    expect(TideService.getTideRecommendation(null)).toBe('Gezeitendaten nicht verfügbar');
  });
});

describe('TideService – NOAA-Abfrage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TideService.tideCache.clear();
    TideService.stationsCache.clear();
  });

  it('fordert die Extrema in GMT an und liefert nur kuenftige Events', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T08:00:00Z'));

    const fetchMock = vi.fn(async (/** @type {string} */ _url) => ({
      ok: true,
      json: async () => ({
        predictions: [
          { t: '2026-05-04 03:12', v: '0.42', type: 'L' },
          { t: '2026-05-04 09:24', v: '3.10', type: 'H' },
          { t: '2026-05-04 15:36', v: '0.38', type: 'L' },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await TideService.getCurrentAndForecastTides(53.9, 8.7);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('interval=hilo');
    expect(url).toContain('time_zone=gmt');
    expect(url).toContain('datum=mllw');

    // Nur die beiden Extrema nach 08:00 UTC.
    expect(data.upcoming).toHaveLength(2);
    expect(data.upcoming[0].type).toBe('high');
    expect(data.current.nextEvent).toBe('Hochwasser');

    vi.useRealTimers();
  });
});
