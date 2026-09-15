// Solunar Service - Mondphase & optimale Fresszeiten für Fische
// Basiert auf astronomischen Berechnungen der Mondposition

class SolunarService {
  constructor() {
    // Referenz-Neumond: 6. Januar 2000 18:14 UTC
    // Date.UTC statt lokalem Konstruktor: getMoonPhase() vergleicht absolute
    // getTime()-Differenzen — mit `new Date(2000, 0, 6, ...)` (Lokalzeit) hinge
    // der Referenz-Zeitpunkt sonst von der Zeitzone der Maschine ab und lieferte
    // je nach Gerät eine andere Mondphase.
    this.referenceNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
    this.lunarCycle = 29.530588861; // Tage
    // Mondtag: Zeit zwischen zwei Mond-Transits (24h 50min).
    this.lunarDayHours = 24.8412;
  }

  // Berechne aktuelle Mondphase (0-1)
  getMoonPhase(date = new Date()) {
    const daysSinceNewMoon = (date.getTime() - this.referenceNewMoon.getTime()) / (1000 * 60 * 60 * 24);
    // `%` liefert in JS bei negativen Werten ein negatives Ergebnis. Fuer Daten
    // vor dem Referenz-Neumond (6.1.2000) klemmte die alte Fassung die Phase auf
    // 0 — also faelschlich "Neumond" fuer jedes historische Datum. Positiv
    // umbrechen statt klemmen.
    const cyclePosition = ((daysSinceNewMoon % this.lunarCycle) + this.lunarCycle) % this.lunarCycle;
    return cyclePosition / this.lunarCycle;
  }

  // Die acht Mondphasen. Jede belegt ein Achtel des Zyklus und ist auf ihrem
  // Marker ZENTRIERT — Vollmond liegt also um 0.5 herum (0.4375–0.5625), nicht
  // erst dahinter. Die alte Staffelung war um ein halbes Band verschoben und
  // meldete beim exakten Vollmond noch "Zunehmend".
  moonPhaseIndex(phase) {
    const normalized = ((phase % 1) + 1) % 1;
    return Math.round(normalized * 8) % 8;
  }

  // Gebe Mondphase-Namen
  getMoonPhaseName(phase) {
    const names = [
      'Neumond',
      'Zunehmende Sichel',
      'Erstes Viertel',
      'Zunehmender Mond',
      'Vollmond',
      'Abnehmender Mond',
      'Letztes Viertel',
      'Abnehmende Sichel',
    ];
    return names[this.moonPhaseIndex(phase)];
  }

  // Symbol für Mondphase (Datenwert für die Anzeige, kein Schmuck)
  getMoonEmoji(phase) {
    const phases = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    // `Math.round(phase * 7)` ergab bei Phase 1 (= Neumond) den Index 7 und
    // damit eine abnehmende Sichel; ausserdem waren die Baender ungleich breit.
    return phases[this.moonPhaseIndex(phase)];
  }

  // Zeitpunkt des Mond-Transits (obere Kulmination) als UTC-Stunde.
  //
  // Der Mond kulminiert zum Neumond ungefaehr zur wahren Ortsmittagszeit (er
  // steht dann beim Sonnenstand) und zum Vollmond um Mitternacht; dazwischen
  // verschiebt sich der Transit linear mit der Mondphase. In wahrer Ortszeit
  // also `12 + Phase * 24` Stunden.
  //
  // Die fruehere Formel `(phase * sideralDay * 24) % 24` lag dadurch
  // systematisch zwoelf Stunden daneben — sie lieferte fuer den Neumond
  // Mitternacht statt Mittag und vertauschte damit Major- und Minor-Periode.
  // Zusaetzlich ging die Laenge gar nicht ein, obwohl sie als Parameter
  // uebergeben wurde: alle Standorte bekamen dieselbe Uhrzeit.
  getMoonTransitUtcHour(phase, longitude) {
    const localSolarHour = (12 + phase * 24) % 24;
    const lon = Number.isFinite(longitude) ? longitude : 0;
    // Wahre Ortszeit = UTC + Laenge/15h  →  UTC = Ortszeit - Laenge/15h
    return ((localSolarHour - lon / 15) % 24 + 24) % 24;
  }

  // Baut aus einer UTC-Stunde einen Zeitpunkt am Kalendertag von `baseDate`.
  // Bewusst ueber Date.UTC: `setHours` haette die Stunde als LOKALzeit gesetzt,
  // obwohl sie aus einer UTC-Rechnung stammt — die Solunar-Zeiten waren damit um
  // den Geraete-Offset verschoben.
  buildUtcTime(baseDate, utcHour) {
    const time = new Date(Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
      0, 0, 0, 0,
    ));
    time.setUTCMinutes(Math.round(utcHour * 60));
    return time;
  }

  // Lokale Uhrzeit eines Zeitpunkts als Dezimalstunde (fuer Anzeige und
  // Restzeit-Berechnung, die beide in der Geraetezeitzone rechnen).
  localDecimalHour(date) {
    return date.getHours() + date.getMinutes() / 60;
  }

  // Solunar-Perioden: Hauptevent um den Mond-Transit, Nebenevent um die
  // Gegenkulmination (eine halbe Mondtag-Laenge = 12h25m spaeter).
  getSolunarTimes(latitude, longitude, date = new Date()) {
    const moonPhase = this.getMoonPhase(date);

    const transitUtcHour = this.getMoonTransitUtcHour(moonPhase, longitude);
    const majorTime = this.buildUtcTime(date, transitUtcHour);
    // Halber Mondtag (24h50m) statt glatter 12h — die Gegenkulmination liegt
    // nicht exakt zwoelf Stunden nach dem Transit.
    const minorTime = new Date(majorTime.getTime() + (this.lunarDayHours / 2) * 60 * 60 * 1000);

    // Berechne Quality Score (0-100) basierend auf Mondphase
    const quality = this.calculateQualityScore(moonPhase);

    return {
      major: {
        time: majorTime,
        hour: this.localDecimalHour(majorTime),
        label: 'Major Period',
        description: 'Höchste Fisch-Aktivität - Mond-Transit',
        quality: quality,
      },
      minor: {
        time: minorTime,
        hour: this.localDecimalHour(minorTime),
        label: 'Minor Period',
        description: 'Erhöhte Fisch-Aktivität - Mond-Opposition',
        quality: Math.max(30, quality - 10),
      },
    };
  }

  // Qualitäts-Score basierend auf Mondphase (0-100)
  // Beste Zeiten: Vollmond & Neumond
  calculateQualityScore(phase) {
    // Vollmond (0.5) und Neumond (0) sind optimal
    const distToFullMoon = Math.abs(phase - 0.5);
    const distToNewMoon = Math.min(phase, 1 - phase);
    const minDist = Math.min(distToFullMoon, distToNewMoon);

    // 0 (perfekt) bis 0.5 (schlecht) normalisieren
    return Math.round(100 * (1 - minDist / 0.5));
  }

  // Tages-Vorhersage: Beste Zeiten für heute
  getDayForecast(latitude, longitude, date = new Date(), now = new Date()) {
    const solunarTimes = this.getSolunarTimes(latitude, longitude, date);
    const moonPhase = this.getMoonPhase(date);
    const phaseName = this.getMoonPhaseName(moonPhase);

    // Restzeit aus den echten Zeitpunkten statt aus Stunden-Arithmetik: die
    // alte Fassung rechnete jede Restzeit modulo 24h gegen die aktuelle Uhr —
    // in der 7-Tage-Vorhersage lieferte damit jeder Tag eine Restzeit, als
    // laege sein Event noch heute.
    const nextMajor = this.getTimeUntil(solunarTimes.major.time, now);
    const nextMinor = this.getTimeUntil(solunarTimes.minor.time, now);

    return {
      date: date.toLocaleDateString('de-DE'),
      moonPhase: {
        phase: moonPhase,
        name: phaseName,
        emoji: this.getMoonEmoji(moonPhase),
        quality: this.calculateQualityScore(moonPhase),
      },
      major: solunarTimes.major,
      minor: solunarTimes.minor,
      nextMajor,
      nextMinor,
      overallQuality: Math.round((solunarTimes.major.quality + solunarTimes.minor.quality) / 2),
    };
  }

  // 7-Tage Vorhersage
  getWeekForecast(latitude, longitude, startDate = new Date()) {
    const forecast = [];
    const now = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      date.setHours(12, 0, 0, 0);
      forecast.push(this.getDayForecast(latitude, longitude, date, now));
    }
    return forecast;
  }

  // Restzeit bis zu einem Zeitpunkt. Liegt er bereits in der Vergangenheit,
  // zaehlt die naechste Wiederkehr — der Mond kulminiert alle 24h50m erneut.
  getTimeUntil(eventTime, now = new Date()) {
    const lunarDayMs = this.lunarDayHours * 60 * 60 * 1000;
    let diff = eventTime.getTime() - now.getTime();
    while (diff < 0) diff += lunarDayMs;

    const totalMinutes = Math.round(diff / 60000);
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      totalMinutes,
    };
  }

  // Berechne Zeit bis nächstes Event
  getNextEvent(event, currentHour) {
    let eventHour = event.hour;

    // Wenn Event-Zeit in der Vergangenheit liegt, morgen
    if (eventHour < currentHour) {
      eventHour += 24;
    }

    const hours = Math.floor(eventHour - currentHour);
    const minutes = Math.round((eventHour - currentHour - hours) * 60);

    return {
      hours,
      minutes,
      totalMinutes: hours * 60 + minutes,
    };
  }

  // Julian Date Berechnung
  getJulianDate(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const second = date.getUTCSeconds();

    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;

    const JDN = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

    const JD = JDN + (hour - 12) / 24 + minute / 1440 + second / 86400;
    return JD;
  }

  // Greenwich Mean Sidereal Time
  getGMST(date) {
    const JD = this.getJulianDate(date);
    const T = (JD - 2451545.0) / 36525;
    const GMST = 280.46061837 + 360.98564724 * (JD - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000;
    return GMST % 360;
  }

  // Gebe Empfehlung basierend auf Solunar-Qualität
  getRecommendation(quality) {
    if (quality >= 80) return 'Exzellent! Beste Fangzeit';
    if (quality >= 60) return 'Gut. Sehr gute Bedingungen';
    if (quality >= 40) return 'Moderat. Passable Bedingungen';
    return 'Schwach. Ungünstige Bedingungen';
  }
}

export default new SolunarService();
