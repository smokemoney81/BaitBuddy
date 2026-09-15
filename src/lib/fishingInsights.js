// Reine Logik für persönliche Dashboard-Insights (BaitBuddy 2.0, Spec §21).
// Kein React/DOM → unit-testbar. Erzeugt Erkenntnisse AUSSCHLIESSLICH aus echten
// Fangdaten (catches). Reicht die Datenlage nicht, wird nichts erfunden — die
// jeweilige Erkenntnis entfällt.

function toMs(c) {
  const t = c?.catch_time || c?.created_at || c?.created_date;
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function normalize(catches) {
  if (!Array.isArray(catches)) return [];
  return catches.map((c) => ({
    species: typeof c?.species === 'string' ? c.species.trim() : '',
    bait: typeof c?.bait_used === 'string' ? c.bait_used.trim() : '',
    ms: toMs(c),
  }));
}

function topCount(items) {
  const counts = new Map();
  for (const it of items) {
    if (!it) continue;
    counts.set(it, (counts.get(it) || 0) + 1);
  }
  let best = null; let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return { value: best, count: bestN };
}

// Bestes 3-Stunden-Fenster nach lokaler Stunde. Gibt {startHour,count} zurück
// oder null, wenn zu wenig Daten.
function bestHourWindow(msList, minTotal = 4, minWindow = 3) {
  const hours = msList.filter((ms) => ms != null).map((ms) => new Date(ms).getHours());
  if (hours.length < minTotal) return null;
  const hist = new Array(24).fill(0);
  hours.forEach((h) => { hist[h] += 1; });
  let bestStart = 0; let bestCount = -1;
  for (let start = 0; start < 24; start++) {
    let c = 0;
    for (let k = 0; k < 3; k++) c += hist[(start + k) % 24];
    if (c > bestCount) { bestCount = c; bestStart = start; }
  }
  if (bestCount < minWindow) return null;
  return { startHour: bestStart, count: bestCount };
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Liefert eine nach Priorität sortierte Liste von Insight-Objekten
// { id, text, priority }. Höhere priority zuerst.
export function computeInsights(catches) {
  const items = normalize(catches);
  const out = [];

  const topBait = topCount(items.map((i) => i.bait).filter(Boolean));
  if (topBait.value && topBait.count >= 2) {
    out.push({ id: 'bait', priority: 2, text: `Mit "${topBait.value}" hast du zuletzt ${topBait.count} Fänge gelandet — ein verlässlicher Köder für dich.` });
  }

  const topSpecies = topCount(items.map((i) => i.species).filter(Boolean));
  if (topSpecies.value && topSpecies.count >= 2) {
    out.push({ id: 'species', priority: 1, text: `${topSpecies.value} ist aktuell dein häufigster Fang (${topSpecies.count}).` });
  }

  const window = bestHourWindow(items.map((i) => i.ms));
  if (window) {
    out.push({ id: 'time', priority: 3, text: `Deine erfolgreichste Angelzeit liegt aktuell zwischen ${pad2(window.startHour)}:00 und ${pad2((window.startHour + 3) % 24)}:00 Uhr (${window.count} Fänge).` });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

// Genau EINE wichtigste Erkenntnis (Spec §22, Bereich 4) — oder null.
export function pickTopInsight(catches) {
  const list = computeInsights(catches);
  return list.length ? list[0] : null;
}
