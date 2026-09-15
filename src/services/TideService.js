// NOAA Tide API Integration für Echtzeit-Gezeitendaten
// Quelle: https://api.noaa.gov/

import SolunarService from './SolunarService';

class TideService {
  constructor() {
    this.baseUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
    this.stationsCache = new Map();
    this.tideCache = new Map();
    this.cacheExpiration = 30 * 60 * 1000; // 30 Minuten für Tide-Daten
  }

  // Finde nächste NOAA Tide-Station basierend auf Koordinaten
  async findNearestStation(latitude, longitude) {
    const cacheKey = `${latitude.toFixed(4)}_${longitude.toFixed(4)}`;

    if (this.stationsCache.has(cacheKey)) {
      const cached = this.stationsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiration) {
        return cached.station;
      }
    }

    try {
      // NOAA bietet keine direkten Stations-Suche, daher verwenden wir hardcodierte deutsche Küstenstationen
      const germanStations = [
        { id: '8508689', name: 'Cuxhaven', lat: 53.87, lon: 8.72 },
        { id: '8507330', name: 'Helgoland', lat: 54.18, lon: 7.88 },
        { id: '8507723', name: 'List auf Sylt', lat: 55.02, lon: 8.41 },
        { id: '8506694', name: 'Norderney', lat: 53.71, lon: 7.15 },
        { id: '8509725', name: 'Husum', lat: 54.48, lon: 8.97 },
      ];

      // Finde nächste Station nach Distanz (Haversine)
      let nearest = germanStations[0];
      let minDistance = this.haversineDistance(latitude, longitude, nearest.lat, nearest.lon);

      for (const station of germanStations) {
        const distance = this.haversineDistance(latitude, longitude, station.lat, station.lon);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = station;
        }
      }

      this.stationsCache.set(cacheKey, {
        station: nearest,
        timestamp: Date.now(),
      });

      return nearest;
    } catch (error) {
      console.error('Fehler beim Suchen der Tide-Station:', error);
      // Fallback: Cuxhaven als default
      return { id: '8508689', name: 'Cuxhaven', lat: 53.87, lon: 8.72 };
    }
  }

  // Haversine-Formel für Distanzberechnung
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Erd-Radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Hole aktuelles Hochwasser/Niedrigwasser und vorhersage
  async getCurrentAndForecastTides(latitude, longitude) {
    try {
      const station = await this.findNearestStation(latitude, longitude);
      const cacheKey = station.id;

      // Prüfe Cache
      if (this.tideCache.has(cacheKey)) {
        const cached = this.tideCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiration) {
          return {
            station,
            ...cached.data,
          };
        }
      }

      // Heute: Predictions für aktuelle Zeit
      const today = new Date();
      const startDate = this.formatNOAADate(today);
      const endDate = this.formatNOAADate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)); // +7 Tage

      // NOAA Predictions API.
      // `interval=hilo` liefert ausschliesslich die Extrema (Hoch-/Niedrigwasser)
      // mit einem `type`-Feld (H/L). Ohne diesen Parameter kommt die
      // 6-Minuten-Zeitreihe zurueck — deren Punkte sind fast alle weder Hoch-
      // noch Niedrigwasser, sodass die Anzeige drei "Niedrigwasser" im
      // 6-Minuten-Abstand zeigte und `timeToNext` immer bei ~0 lag.
      // `time_zone=gmt` macht die Zeitstempel eindeutig (siehe parseNoaaTime).
      // `datum=mllw` ist die uebliche Bezugsgroesse fuer Gezeitenvorhersagen;
      // mit `mhhw` waren praktisch alle Werte negativ.
      const url = `${this.baseUrl}?station=${station.id}&begin_date=${startDate}&end_date=${endDate}&product=predictions&interval=hilo&datum=mllw&time_zone=gmt&units=metric&application=BaitBuddy&format=json`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`NOAA API error: ${response.status}`);

      const data = await response.json();

      // Verarbeite Vorhersagen
      const predictions = data.predictions || [];
      const now = new Date();

      // Finde nächstes Hoch- und Niedrigwasser
      const tidesWithType = this.categorizeExtrema(predictions);
      const upcomingTides = tidesWithType.filter(t => t.date && t.date >= now);

      const result = {
        current: this.getCurrentTideState(tidesWithType, now),
        upcoming: upcomingTides.slice(0, 6), // Nächste 6 Extreme
        forecast7days: predictions,
        lastUpdated: new Date().toISOString(),
      };

      this.tideCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return { station, ...result };
    } catch (error) {
      console.error('Fehler beim Abrufen der Gezeitendaten:', error);
      // Fallback: Berechnete Scheindaten
      return this.generateFallbackTideData();
    }
  }

  // Kategorisiere Extrema als Hoch/Niedrig
  // NOAA liefert Zeitstempel als "YYYY-MM-DD HH:mm" ohne Zonenangabe. `new Date()`
  // interpretiert dieses Format als LOKALzeit, angefordert ist es aber in GMT —
  // jeder Vergleich mit `now` lag dadurch um den UTC-Offset des Geraets daneben
  // (in Deutschland ein bis zwei Stunden). Deshalb explizit als UTC parsen.
  parseNoaaTime(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) {
      const fallback = new Date(value);
      return Number.isNaN(fallback.getTime()) ? null : fallback;
    }
    const [, y, mo, d, h, mi] = match;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, 0));
  }

  categorizeExtrema(predictions) {
    const tideLevels = predictions.map(p => parseFloat(p.v));

    return predictions.map((pred, i) => {
      let type = 'neutral';

      // Mit `interval=hilo` markiert NOAA jedes Extremum selbst (H/L). Nur wenn
      // dieses Feld fehlt (aeltere Antworten, Zeitreihe), aus den Nachbarwerten
      // ableiten.
      const noaaType = typeof pred.type === 'string' ? pred.type.trim().toUpperCase() : '';
      if (noaaType === 'H') {
        type = 'high';
      } else if (noaaType === 'L') {
        type = 'low';
      } else if (i > 0 && i < tideLevels.length - 1) {
        const prev = tideLevels[i - 1];
        const curr = tideLevels[i];
        const next = tideLevels[i + 1];

        if (curr > prev && curr > next) type = 'high';
        else if (curr < prev && curr < next) type = 'low';
      }

      return {
        t: pred.t,
        // Aufgeloester Zeitstempel, damit Anzeige und Vergleiche nicht erneut
        // das mehrdeutige NOAA-Format parsen muessen.
        date: this.parseNoaaTime(pred.t),
        v: parseFloat(pred.v),
        type,
      };
    });
  }

  // Bestimme aktuellen Gezeitenzustand
  getCurrentTideState(tidesWithType, now) {
    if (!tidesWithType.length) return null;

    // Finde Extrema vor und nach jetzt
    let prevExtreme = null;
    let nextExtreme = null;

    for (const tide of tidesWithType) {
      const tideTime = tide.date || this.parseNoaaTime(tide.t);
      if (!tideTime) continue;
      if (tideTime <= now) {
        prevExtreme = tide;
      } else if (!nextExtreme) {
        nextExtreme = tide;
      }
    }

    if (!nextExtreme) nextExtreme = tidesWithType[tidesWithType.length - 1];

    const state = {
      height: this.interpolateHeight(prevExtreme, nextExtreme, now),
      type: nextExtreme.type === 'high' ? 'Steigend' : nextExtreme.type === 'low' ? 'Fallend' : 'Neutral',
      typeEmoji: nextExtreme.type === 'high' ? '🌊' : nextExtreme.type === 'low' ? '⬇️' : '➡️',
      timeToNext: this.timeUntilEvent(now, new Date(nextExtreme.t)),
      nextEvent: nextExtreme.type === 'high' ? 'Hochwasser' : nextExtreme.type === 'low' ? 'Niedrigwasser' : 'Umkehr',
      nextTime: nextExtreme.t,
    };

    return state;
  }

  // Aktueller Pegel zwischen zwei Extrema. `height` war bisher schlicht die
  // Hoehe des NAECHSTEN Extremums — also nie der aktuelle Stand, sondern der
  // Wert, der erst in bis zu sechs Stunden erreicht wird. Zwischen Hoch- und
  // Niedrigwasser verlaeuft der Pegel naeherungsweise cosinusfoermig; ohne
  // vorheriges Extremum bleibt nur der naechste Wert.
  interpolateHeight(prevExtreme, nextExtreme, now) {
    if (!nextExtreme) return null;
    const nextTime = nextExtreme.date || this.parseNoaaTime(nextExtreme.t);
    const prevTime = prevExtreme ? (prevExtreme.date || this.parseNoaaTime(prevExtreme.t)) : null;
    if (!prevExtreme || !prevTime || !nextTime) return nextExtreme.v;

    const span = nextTime.getTime() - prevTime.getTime();
    if (span <= 0) return nextExtreme.v;

    const elapsed = Math.min(Math.max((now.getTime() - prevTime.getTime()) / span, 0), 1);
    const eased = (1 - Math.cos(Math.PI * elapsed)) / 2;
    const height = prevExtreme.v + (nextExtreme.v - prevExtreme.v) * eased;
    return parseFloat(height.toFixed(2));
  }

  // Berechne Zeit bis Event
  timeUntilEvent(now, eventTime) {
    const diff = eventTime.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    // totalMinutes wird von FishPredictionService (Tide-Boost) und
    // NotificationService (Gezeiten-Alarm) erwartet — ohne dieses Feld
    // griffen deren Schwellenwert-Vergleiche (undefined < 60) nie.
    const totalMinutes = Math.floor(diff / (1000 * 60));
    return { hours, minutes, totalMinutes, diff };
  }

  // Formatiere Datum für NOAA API (YYYYMMDD)
  // UTC-Datumsteile, passend zum `time_zone=gmt` der Anfrage — mit lokalen
  // Teilen faellt das Fenster je nach Zeitzone um einen Tag daneben.
  formatNOAADate(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  // Fallback: Berechnete Scheindaten basierend auf Mondphase
  generateFallbackTideData() {
    const now = new Date();
    const moonPhase = this.calculateMoonPhase(now);

    // Vereinfachte Gezeiten basierend auf Mondphase (~12.42h Zyklus)
    const tideHeight = Math.sin((now.getTime() / (12.42 * 60 * 60 * 1000)) * Math.PI) * (0.5 + moonPhase * 0.3) + 1.5;

    return {
      station: { id: 'fallback', name: 'Standort-Berechnung', lat: 0, lon: 0 },
      current: {
        height: parseFloat(tideHeight.toFixed(2)),
        type: tideHeight > 1.5 ? 'Steigend' : 'Fallend',
        typeEmoji: tideHeight > 1.5 ? '🌊' : '⬇️',
        timeToNext: { hours: 6, minutes: 12, totalMinutes: 372, diff: 6 * 60 * 60 * 1000 },
        nextEvent: tideHeight > 1.5 ? 'Hochwasser' : 'Niedrigwasser',
        nextTime: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      },
      upcoming: [],
      forecast7days: [],
      lastUpdated: now.toISOString(),
    };
  }

  // Berechne Mondphase (0-1, 0=Neumond, 0.5=Vollmond).
  // Delegiert an den SolunarService statt die Rechnung zu duplizieren: die
  // hiesige Kopie nutzte `new Date(2000, 0, 6)` (LOKALzeit-Konstruktor und ohne
  // Uhrzeit) — der Referenzpunkt haing damit von der Zeitzone des Geraets ab und
  // lieferte je nach Standort eine andere Mondphase.
  calculateMoonPhase(date) {
    return SolunarService.getMoonPhase(date);
  }

  // Gebe Empfehlungs-Text basierend auf Gezeiten
  getTideRecommendation(tideState) {
    if (!tideState) return 'Gezeitendaten nicht verfügbar';

    const hoursToNext = tideState.timeToNext.hours;
    const minutesToNext = tideState.timeToNext.minutes;
    // Gesamtzeit statt separatem Stunden-/Minuten-Vergleich: `hoursToNext <= 1 &&
    // minutesToNext <= 30` stufte sonst 0h45m als "nicht optimal", 1h20m aber als
    // "optimal" ein (die Minuten-Komponente wird unabhängig von den Stunden geprüft).
    const totalMinutes = tideState.timeToNext.totalMinutes ??
      (hoursToNext * 60 + minutesToNext);

    if (totalMinutes <= 90) {
      return `Optimal! ${tideState.nextEvent} in ${hoursToNext}h ${minutesToNext}m - beste Fangzeit`;
    } else if (totalMinutes <= 180) {
      return `Gut. ${tideState.nextEvent} in ${hoursToNext}h ${minutesToNext}m`;
    } else {
      return `Noch ${hoursToNext}h ${minutesToNext}m bis ${tideState.nextEvent}`;
    }
  }
}

export default new TideService();
