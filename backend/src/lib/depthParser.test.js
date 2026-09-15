import { describe, it, expect } from 'vitest';
import { parseDepthFile } from './depthParser.js';

// Der Parser verarbeitet ungepruefte Nutzer-Uploads (Bathymetrie-Crowdsourcing),
// war aber ungetestet. Er ist die einzige Stelle, die entscheidet, welche
// Fremddaten in die Tiefenkarte gelangen.
describe('parseDepthFile – CSV', () => {
  it('liest Kommaspalten ohne Kopfzeile in der Reihenfolge lat,lon,tiefe', () => {
    expect(parseDepthFile('53.5,9.9,12.5\n53.6,10.0,8')).toEqual([
      { lat: 53.5, lon: 9.9, depth: 12.5 },
      { lat: 53.6, lon: 10.0, depth: 8 },
    ]);
  });

  it('erkennt eine Kopfzeile und beliebige Spaltenreihenfolge', () => {
    const csv = 'tiefe;laenge;breite\n12.5;9.9;53.5';
    expect(parseDepthFile(csv)).toEqual([{ lat: 53.5, lon: 9.9, depth: 12.5 }]);
  });

  it('kommt mit Semikolon, Tab und Leerzeichen als Trennzeichen zurecht', () => {
    expect(parseDepthFile('53.5;9.9;12.5')).toEqual([{ lat: 53.5, lon: 9.9, depth: 12.5 }]);
    expect(parseDepthFile('53.5\t9.9\t12.5')).toEqual([{ lat: 53.5, lon: 9.9, depth: 12.5 }]);
    expect(parseDepthFile('53.5 9.9 12.5')).toEqual([{ lat: 53.5, lon: 9.9, depth: 12.5 }]);
  });

  it('normalisiert als negative Werte kodierte Tiefen', () => {
    expect(parseDepthFile('53.5,9.9,-12.5')).toEqual([{ lat: 53.5, lon: 9.9, depth: 12.5 }]);
  });

  it('verwirft Zeilen mit unmoeglichen Koordinaten', () => {
    const csv = [
      '53.5,9.9,12.5',
      '999,9.9,12.5',     // Breite ausserhalb -90..90
      '53.5,999,12.5',    // Laenge ausserhalb -180..180
      '53.5,9.9,99999',   // tiefer als der tiefste Punkt der Erde
      'abc,def,ghi',      // keine Zahlen
      '53.5,9.9',         // Tiefe fehlt
    ].join('\n');
    expect(parseDepthFile(csv)).toEqual([{ lat: 53.5, lon: 9.9, depth: 12.5 }]);
  });

  it('liefert fuer leere oder unbrauchbare Eingaben eine leere Liste', () => {
    expect(parseDepthFile('')).toEqual([]);
    expect(parseDepthFile('\n\n   \n')).toEqual([]);
    expect(parseDepthFile('nur, unsinn, hier')).toEqual([]);
  });

  it('akzeptiert die Bereichsgrenzen', () => {
    expect(parseDepthFile('-90,-180,0')).toEqual([{ lat: -90, lon: -180, depth: 0 }]);
    expect(parseDepthFile('90,180,12000')).toEqual([{ lat: 90, lon: 180, depth: 12000 }]);
  });
});

describe('parseDepthFile – GPX', () => {
  const gpx = (inner) => `<?xml version="1.0"?><gpx version="1.1">${inner}</gpx>`;

  it('liest trkpt, wpt und rtept gleichermassen', () => {
    const text = gpx(`
      <trkpt lat="53.5" lon="9.9"><depth>12.5</depth></trkpt>
      <wpt lat="53.6" lon="10.0"><depth>8</depth></wpt>
      <rtept lat="53.7" lon="10.1"><depth>4</depth></rtept>
    `);
    expect(parseDepthFile(text, 'messung.gpx')).toEqual([
      { lat: 53.5, lon: 9.9, depth: 12.5 },
      { lat: 53.6, lon: 10.0, depth: 8 },
      { lat: 53.7, lon: 10.1, depth: 4 },
    ]);
  });

  it('akzeptiert lon vor lat und einfache Anfuehrungszeichen', () => {
    // XML garantiert keine Attribut-Reihenfolge.
    const text = gpx(`<trkpt lon='9.9' lat='53.5'><depth>12.5</depth></trkpt>`);
    expect(parseDepthFile(text, 'messung.gpx')).toEqual([{ lat: 53.5, lon: 9.9, depth: 12.5 }]);
  });

  it('ignoriert Punkte ohne Tiefenangabe — <ele> ist GPS-Hoehe, keine Tiefe', () => {
    const text = gpx(`
      <trkpt lat="53.5" lon="9.9"><ele>32</ele></trkpt>
      <trkpt lat="53.6" lon="10.0"><ele>30</ele><depth>8</depth></trkpt>
    `);
    expect(parseDepthFile(text, 'messung.gpx')).toEqual([{ lat: 53.6, lon: 10.0, depth: 8 }]);
  });

  it('erkennt GPX auch ohne passende Dateiendung am Inhalt', () => {
    const text = gpx(`<trkpt lat="53.5" lon="9.9"><depth>12.5</depth></trkpt>`);
    expect(parseDepthFile(text, 'upload.txt')).toHaveLength(1);
  });

  it('verwirft auch in GPX unmoegliche Werte', () => {
    const text = gpx(`
      <trkpt lat="999" lon="9.9"><depth>12.5</depth></trkpt>
      <trkpt lat="53.5" lon="9.9"><depth>99999</depth></trkpt>
    `);
    expect(parseDepthFile(text, 'messung.gpx')).toEqual([]);
  });

  it('liefert bei GPX ohne Punkte eine leere Liste statt zu werfen', () => {
    expect(parseDepthFile(gpx('<metadata/>'), 'leer.gpx')).toEqual([]);
  });
});
