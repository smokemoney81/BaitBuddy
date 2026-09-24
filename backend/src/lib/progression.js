// Level & Rewards: XP, Level und Abzeichen werden bei jedem Abruf aus den
// echten Daten des Nutzers berechnet (Fänge, Spots, Trips, Events). Es gibt
// keinen separat gespeicherten XP-Zähler, der auseinanderlaufen oder von
// außen hochgesetzt werden könnte — wer einen Fang löscht, verliert auch
// dessen XP.

// XP je Aktivität. Fang und Foto entsprechen ACTIVITY_POINTS
// (catch_logged / photo_shared) aus pointsCalculator.js.
export const XP_RULES = {
  catch: 30,
  catchPhoto: 10,
  spot: 15,
  trip: 25,
  eventJoined: 100,
  eventWon: 500,
};

// Gegen XP-Farming: pro Kalendertag zählen höchstens so viele Fänge.
export const MAX_CATCHES_PER_DAY = 20;

// Level L beginnt bei 50·L·(L−1) XP: 0, 100, 300, 600, 1000, …
export function levelStartXp(level) {
  const l = Math.max(1, Math.floor(level));
  return 50 * l * (l - 1);
}

export function levelForXp(xp) {
  const value = Math.max(0, Number(xp) || 0);
  // Umkehrung von 50·L·(L−1) ≤ xp
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + value / 12.5)) / 2));
  while (levelStartXp(level + 1) <= value) level += 1;
  while (level > 1 && levelStartXp(level) > value) level -= 1;
  return level;
}

function dayKey(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'unknown';
}

function countedCatches(catches) {
  const perDay = new Map();
  const counted = [];
  for (const entry of catches) {
    const key = dayKey(entry.catch_time || entry.created_at);
    const n = perDay.get(key) || 0;
    if (n >= MAX_CATCHES_PER_DAY) continue;
    perDay.set(key, n + 1);
    counted.push(entry);
  }
  return counted;
}

function normalizeSpecies(name) {
  return String(name || '').trim().toLowerCase();
}

const BADGES = [
  { id: 'first_catch', title: 'Erster Fang', text: 'Deinen ersten Fang eingetragen', metric: 'catches', target: 1 },
  { id: 'catches_10', title: 'Fänger', text: '10 Fänge im Fangbuch', metric: 'catches', target: 10 },
  { id: 'catches_50', title: 'Routinier', text: '50 Fänge im Fangbuch', metric: 'catches', target: 50 },
  { id: 'species_5', title: 'Artenkenner', text: '5 verschiedene Fischarten', metric: 'species', target: 5 },
  { id: 'big_fish', title: 'Kapitaler Fisch', text: 'Ein Fisch ab 80 cm', metric: 'biggest', target: 80 },
  { id: 'spot_scout', title: 'Spot-Scout', text: '10 Angelplätze gespeichert', metric: 'spots', target: 10 },
  { id: 'planner', title: 'Tourenplaner', text: '5 Trips geplant', metric: 'trips', target: 5 },
  { id: 'event_rookie', title: 'Event-Starter', text: 'An einem Event teilgenommen', metric: 'events', target: 1 },
  { id: 'event_winner', title: 'Event-Sieger', text: 'Ein Event gewonnen', metric: 'wins', target: 1 },
];

/**
 * @param {{ catches?: any[], spotCount?: number, tripCount?: number, participations?: any[] }} data
 */
export function computeProgress({ catches = [], spotCount = 0, tripCount = 0, participations = [] } = {}) {
  const counted = countedCatches(Array.isArray(catches) ? catches : []);
  const photos = counted.filter(c => c.photo_url).length;
  const events = participations.length;
  const wins = participations.filter(p => p.is_winner === true).length;

  const breakdown = [
    { id: 'catches', label: 'Fänge', count: counted.length, xp: counted.length * XP_RULES.catch },
    { id: 'photos', label: 'Fangfotos', count: photos, xp: photos * XP_RULES.catchPhoto },
    { id: 'spots', label: 'Spots', count: spotCount, xp: spotCount * XP_RULES.spot },
    { id: 'trips', label: 'Trips', count: tripCount, xp: tripCount * XP_RULES.trip },
    { id: 'events', label: 'Event-Teilnahmen', count: events, xp: events * XP_RULES.eventJoined },
    { id: 'wins', label: 'Event-Siege', count: wins, xp: wins * XP_RULES.eventWon },
  ];
  const xp = breakdown.reduce((sum, row) => sum + row.xp, 0);
  const level = levelForXp(xp);

  const allCatches = Array.isArray(catches) ? catches : [];
  const metrics = {
    catches: allCatches.length,
    species: new Set(allCatches.map(c => normalizeSpecies(c.species)).filter(Boolean)).size,
    biggest: allCatches.reduce((max, c) => Math.max(max, Number(c.length_cm) || 0), 0),
    spots: spotCount,
    trips: tripCount,
    events,
    wins,
  };

  const badges = BADGES.map(badge => {
    const current = metrics[badge.metric];
    return {
      id: badge.id,
      title: badge.title,
      text: badge.text,
      current: Math.min(current, badge.target),
      target: badge.target,
      unlocked: current >= badge.target,
    };
  });

  return {
    xp,
    level,
    level_start_xp: levelStartXp(level),
    next_level_xp: levelStartXp(level + 1),
    breakdown,
    badges,
  };
}
