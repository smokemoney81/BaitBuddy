import { describe, it, expect } from 'vitest';
import SolunarService from './SolunarService';

// Regressionstests fuer die in Meilenstein 2 benannten Mondphasen-/Zeitzonen-
// Probleme.
describe('SolunarService – Mondphase', () => {
  it('liefert zum Referenz-Neumond Phase 0', () => {
    const phase = SolunarService.getMoonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)));
    expect(phase).toBeCloseTo(0, 5);
  });

  it('liefert einen halben Zyklus spaeter Vollmond', () => {
    const halfCycleMs = (29.530588861 / 2) * 24 * 60 * 60 * 1000;
    const phase = SolunarService.getMoonPhase(
      new Date(Date.UTC(2000, 0, 6, 18, 14) + halfCycleMs),
    );
    expect(phase).toBeCloseTo(0.5, 3);
    expect(SolunarService.getMoonPhaseName(phase)).toBe('Vollmond');
  });

  it('bricht Daten VOR dem Referenz-Neumond korrekt um statt sie auf 0 zu klemmen', () => {
    // Ein halber Zyklus vor der Referenz ist Vollmond, nicht Neumond. Die alte
    // Fassung klemmte den negativen Modulo auf 0 und meldete fuer jedes
    // historische Datum "Neumond".
    const halfCycleMs = (29.530588861 / 2) * 24 * 60 * 60 * 1000;
    const phase = SolunarService.getMoonPhase(
      new Date(Date.UTC(2000, 0, 6, 18, 14) - halfCycleMs),
    );
    expect(phase).toBeCloseTo(0.5, 3);
    expect(phase).toBeGreaterThan(0);
  });

  it('bleibt fuer beliebige Daten im gueltigen Bereich', () => {
    for (const iso of ['1970-03-01T00:00:00Z', '1999-12-31T23:59:00Z', '2031-07-04T12:00:00Z']) {
      const phase = SolunarService.getMoonPhase(new Date(iso));
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });

  it('haengt nicht von der Zeitzone der Maschine ab (absolute Zeitpunkte)', () => {
    const instant = new Date('2026-05-04T10:00:00Z');
    expect(SolunarService.getMoonPhase(instant)).toBe(
      SolunarService.getMoonPhase(new Date(instant.getTime())),
    );
  });
});

describe('SolunarService – Mond-Transit', () => {
  // Der Mond kulminiert zum Neumond zur wahren Ortsmittagszeit und zum Vollmond
  // um Mitternacht. Die alte Formel `(phase * sideralDay * 24) % 24` lag genau
  // zwoelf Stunden daneben und vertauschte so Major- und Minor-Periode.
  it('setzt den Neumond-Transit auf die Ortsmittagszeit', () => {
    expect(SolunarService.getMoonTransitUtcHour(0, 0)).toBeCloseTo(12, 5);
  });

  it('setzt den Vollmond-Transit auf Mitternacht', () => {
    expect(SolunarService.getMoonTransitUtcHour(0.5, 0)).toBeCloseTo(0, 5);
  });

  it('verschiebt den Transit mit der geographischen Laenge', () => {
    // 15 Grad Ost entsprechen einer Stunde frueher in UTC.
    expect(SolunarService.getMoonTransitUtcHour(0, 15)).toBeCloseTo(11, 5);
    expect(SolunarService.getMoonTransitUtcHour(0, -15)).toBeCloseTo(13, 5);
  });

  it('beruecksichtigt die Laenge ueberhaupt (sie wurde frueher ignoriert)', () => {
    const hamburg = SolunarService.getMoonTransitUtcHour(0.3, 10);
    const newYork = SolunarService.getMoonTransitUtcHour(0.3, -74);
    expect(hamburg).not.toBeCloseTo(newYork, 2);
  });

  it('bleibt immer innerhalb eines Tages', () => {
    for (let phase = 0; phase < 1; phase += 0.05) {
      for (const lon of [-180, -74, 0, 10, 179]) {
        const hour = SolunarService.getMoonTransitUtcHour(phase, lon);
        expect(hour).toBeGreaterThanOrEqual(0);
        expect(hour).toBeLessThan(24);
      }
    }
  });

  it('legt die Minor-Periode einen halben Mondtag nach der Major-Periode', () => {
    const { major, minor } = SolunarService.getSolunarTimes(53.5, 10, new Date('2026-05-04T08:00:00Z'));
    const diffHours = (minor.time.getTime() - major.time.getTime()) / 3600000;
    expect(diffHours).toBeCloseTo(24.8412 / 2, 3);
  });

  it('baut die Zeitpunkte aus der UTC-Stunde, nicht aus lokalen setHours', () => {
    const date = new Date('2026-05-04T08:00:00Z');
    const { major } = SolunarService.getSolunarTimes(53.5, 0, date);
    const expectedHour = SolunarService.getMoonTransitUtcHour(
      SolunarService.getMoonPhase(date),
      0,
    );
    const actualHour = major.time.getUTCHours() + major.time.getUTCMinutes() / 60;
    expect(actualHour).toBeCloseTo(expectedHour, 1);
  });
});

describe('SolunarService – Restzeiten', () => {
  it('zaehlt bis zu einem kuenftigen Zeitpunkt', () => {
    const now = new Date('2026-05-04T08:00:00Z');
    const event = new Date('2026-05-04T10:30:00Z');
    expect(SolunarService.getTimeUntil(event, now)).toEqual({
      hours: 2,
      minutes: 30,
      totalMinutes: 150,
    });
  });

  it('rechnet einen vergangenen Zeitpunkt auf die naechste Kulmination hoch', () => {
    const now = new Date('2026-05-04T12:00:00Z');
    const event = new Date('2026-05-04T10:00:00Z');
    const result = SolunarService.getTimeUntil(event, now);
    // 2h vergangen → naechster Transit in 24h50m - 2h.
    expect(result.totalMinutes).toBeGreaterThan(0);
    expect(result.totalMinutes).toBeCloseTo(24.8412 * 60 - 120, 0);
  });

  it('meldet fuer spaetere Tage der Wochenvorhersage keine Restzeit von heute', () => {
    // Frueher wurde jede Restzeit modulo 24h gegen die aktuelle Uhr gerechnet —
    // Tag 6 der Vorhersage sah damit aus, als laege sein Event noch heute.
    const start = new Date('2026-05-04T08:00:00Z');
    const week = SolunarService.getWeekForecast(53.5, 10, start);
    expect(week).toHaveLength(7);
    const lastDay = week[6];
    expect(lastDay.nextMajor.totalMinutes).toBeGreaterThan(4 * 24 * 60);
  });
});

describe('SolunarService – Phasen-Benennung', () => {
  // Die Baender waren um ein halbes Band verschoben: beim exakten Vollmond
  // meldete die App noch "Zunehmend", und Phase 1 (= Neumond) bekam das Symbol
  // der abnehmenden Sichel.
  it('zentriert jede Phase auf ihrem Marker', () => {
    expect(SolunarService.getMoonPhaseName(0)).toBe('Neumond');
    expect(SolunarService.getMoonPhaseName(0.25)).toBe('Erstes Viertel');
    expect(SolunarService.getMoonPhaseName(0.5)).toBe('Vollmond');
    expect(SolunarService.getMoonPhaseName(0.75)).toBe('Letztes Viertel');
  });

  it('waehlt das passende Symbol und bricht bei Phase 1 auf Neumond um', () => {
    expect(SolunarService.getMoonEmoji(0)).toBe('🌑');
    expect(SolunarService.getMoonEmoji(0.5)).toBe('🌕');
    expect(SolunarService.getMoonEmoji(1)).toBe('🌑');
  });

  it('liefert fuer jede Phase im Zyklus einen Namen und ein Symbol', () => {
    for (let phase = 0; phase < 1; phase += 0.01) {
      expect(SolunarService.getMoonPhaseName(phase)).toBeTruthy();
      expect(SolunarService.getMoonEmoji(phase)).toBeTruthy();
    }
  });
});

describe('SolunarService – Qualitaet', () => {
  it('bewertet Voll- und Neumond am hoechsten', () => {
    expect(SolunarService.calculateQualityScore(0)).toBe(100);
    expect(SolunarService.calculateQualityScore(0.5)).toBe(100);
  });

  it('bewertet die Viertel am niedrigsten', () => {
    expect(SolunarService.calculateQualityScore(0.25)).toBe(50);
    expect(SolunarService.calculateQualityScore(0.75)).toBe(50);
  });
});
