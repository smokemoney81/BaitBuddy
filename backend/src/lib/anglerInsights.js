// Ableitung erkannter Muster aus der echten Fanghistorie ("BaitBuddy kennt
// dich", §6). Reine Funktionen ohne Datenbankzugriff — die Zeilen kommen vom
// Aufrufer, damit die Ableitung ohne Mocks testbar bleibt.
//
// Grundregel: Es wird nur behauptet, was die Daten hergeben. Jede Aussage trägt
// ihre Stichprobe mit (`count` von `total`), und unterhalb einer Mindestanzahl
// entsteht gar keine Aussage. Lieber "noch zu wenig Daten" als ein Muster, das
// aus zwei Fängen hochgerechnet wurde — der Nutzer soll die Angaben auf dieser
// Seite korrigieren können, nicht raten müssen, woher sie stammen.

// Unter dieser Anzahl Fänge wird kein Muster abgeleitet.
export const MIN_SAMPLE = 3;

// Tagesabschnitte für die Beißzeit-Auswertung. Grenzen bewusst grob — feiner
// wäre bei den üblichen Datenmengen Scheingenauigkeit.
const DAY_PARTS = [
  { id: 'night', label: 'Nacht', from: 0, to: 5 },
  { id: 'morning', label: 'Morgen', from: 5, to: 11 },
  { id: 'midday', label: 'Mittag', from: 11, to: 16 },
  { id: 'evening', label: 'Abend', from: 16, to: 22 },
  { id: 'late', label: 'Späte Stunden', from: 22, to: 24 },
];

function dayPart(date) {
  const hour = date.getHours();
  return DAY_PARTS.find((part) => hour >= part.from && hour < part.to) || DAY_PARTS[0];
}

function tally(rows, pick) {
  const counts = new Map();
  for (const row of rows) {
    const key = pick(row);
    if (key == null) continue;
    const value = String(key).trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

// Häufigster Wert mit Stichprobe. `null`, wenn es keinen gibt oder die Spalte
// insgesamt zu dünn befüllt ist.
function leader(counts, total) {
  let best = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  if (!best || best.count < MIN_SAMPLE) return null;
  return { ...best, total, share: Math.round((best.count / total) * 100) };
}

/**
 * Leitet die Muster ab, die der Buddy aus den Fängen zu kennen glaubt.
 *
 * @param {Array<object>} catches Zeilen aus `catches` (species, bait_used,
 *   water_body, catch_time, weight_kg, length_cm)
 * @returns {{ enoughData: boolean, total: number, patterns: Array<object> }}
 */
export function deriveCatchPatterns(catches = []) {
  const rows = Array.isArray(catches) ? catches : [];
  const total = rows.length;

  if (total < MIN_SAMPLE) {
    return { enoughData: false, total, patterns: [] };
  }

  const patterns = [];

  const species = leader(tally(rows, (r) => r.species), total);
  if (species) {
    patterns.push({
      id: 'top_species',
      label: 'Meistgefangene Art',
      value: species.value,
      detail: `${species.count} von ${species.total} Fängen (${species.share} %)`,
    });
  }

  const bait = leader(tally(rows, (r) => r.bait_used), total);
  if (bait) {
    patterns.push({
      id: 'top_bait',
      label: 'Erfolgreichster Köder',
      value: bait.value,
      detail: `${bait.count} von ${bait.total} Fängen (${bait.share} %)`,
    });
  }

  const water = leader(tally(rows, (r) => r.water_body || r.spot_name), total);
  if (water) {
    patterns.push({
      id: 'top_water',
      label: 'Häufigstes Gewässer',
      value: water.value,
      detail: `${water.count} von ${water.total} Fängen (${water.share} %)`,
    });
  }

  const timed = rows.filter((r) => {
    const t = r.catch_time ? new Date(r.catch_time) : null;
    return t && !Number.isNaN(t.getTime());
  });
  if (timed.length >= MIN_SAMPLE) {
    const part = leader(tally(timed, (r) => dayPart(new Date(r.catch_time)).label), timed.length);
    if (part) {
      patterns.push({
        id: 'top_daypart',
        label: 'Erfolgreichste Tageszeit',
        value: part.value,
        detail: `${part.count} von ${part.total} Fängen mit Zeitangabe (${part.share} %)`,
      });
    }
  }

  const weights = rows.map((r) => Number(r.weight_kg)).filter((n) => Number.isFinite(n) && n > 0);
  if (weights.length >= MIN_SAMPLE) {
    const best = Math.max(...weights);
    patterns.push({
      id: 'personal_best',
      label: 'Schwerster Fang',
      value: `${best.toFixed(2)} kg`,
      detail: `aus ${weights.length} Fängen mit Gewichtsangabe`,
    });
  }

  return { enoughData: patterns.length > 0, total, patterns };
}
