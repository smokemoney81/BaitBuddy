export const DEFAULT_NAVIGATION = ['Dashboard', 'Map', 'Community', 'Profile'];
export const NAVIGATION_OPTIONS = ['Dashboard', 'Map', 'KiBuddyBeta', 'Weather', 'Logbook', 'TripPlanner', 'Community', 'Gear', 'Profile', 'PremiumPlans'];
export const BUDDIES = {
  female_default: { gender: 'female', name: 'Marina', avatar: '/assets/buddy/marina-avatar.png', portrait: '/assets/buddy/marina.png', description: 'Freundlich, modern und aufmerksam.' },
  male_default: { gender: 'male', name: 'Finn', avatar: '/assets/buddy/finn.png', portrait: '/assets/buddy/finn.png', description: 'Ruhig, direkt und erfahren.' },
};
export const DEFAULT_BUDDY = { gender: 'female', avatarId: 'female_default', voiceId: 'male', tone: 'friendly', speed: 1, voiceEnabled: true };
export function normalizeBuddy(value = {}) {
  const gender = value.gender === 'male' ? 'male' : 'female';
  return { gender, avatarId: `${gender}_default`, voiceId: value.voiceId === 'female' ? 'female' : 'male',
    tone: ['friendly', 'direct', 'casual', 'professional', 'motivating'].includes(value.tone) ? value.tone : 'friendly',
    speed: Number.isFinite(value.speed) ? Math.min(1.2, Math.max(0.8, value.speed)) : 1,
    voiceEnabled: value.voiceEnabled !== false, chosen: value.chosen === true };
}
export function normalizeNavigation(value) {
  if (!Array.isArray(value)) return [...DEFAULT_NAVIGATION];
  const valid = [...new Set(value)].filter(key => NAVIGATION_OPTIONS.includes(key)).slice(0, 4);
  return valid.length ? valid : [...DEFAULT_NAVIGATION];
}

// Persönliche Angel-Präferenzen (BaitBuddy 2.0). Bewusst KEINE eigene Tabelle:
// wie Buddy/Navigation liegen sie in user_metadata.settings.fishing und werden
// über denselben savePreferences-Pfad (PATCH /auth/me, section-merge) gespeichert.
// Speisen Trip-Planer-Defaults und persönliche Dashboard-Insights.
export const FISHING_SPECIES_OPTIONS = ['Hecht', 'Zander', 'Barsch', 'Forelle', 'Karpfen', 'Aal', 'Wels', 'Rapfen', 'Döbel', 'Schleie', 'Brasse', 'Rotauge'];
export const FISHING_METHOD_OPTIONS = ['Spinnfischen', 'Dropshot', 'Vertikalangeln', 'Grundangeln', 'Posenangeln', 'Feedern', 'Karpfenangeln', 'Fliegenfischen'];
export const FISHING_WATER_TYPE_OPTIONS = ['See', 'Fluss', 'Kanal', 'Teich', 'Hafen', 'Küste', 'Talsperre'];
export const DEFAULT_FISHING_PREFERENCES = { targetSpecies: [], methods: [], waterTypes: [], favoriteLures: [], preferredTime: null };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanStringList(value, max = 12) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const s = item.trim().slice(0, 40);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeTimeWindow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const start = typeof value.start === 'string' && TIME_RE.test(value.start) ? value.start : null;
  const end = typeof value.end === 'string' && TIME_RE.test(value.end) ? value.end : null;
  return start && end ? { start, end } : null;
}

export function normalizeFishing(value = {}) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    targetSpecies: cleanStringList(v.targetSpecies),
    methods: cleanStringList(v.methods),
    waterTypes: cleanStringList(v.waterTypes),
    favoriteLures: cleanStringList(v.favoriteLures),
    preferredTime: normalizeTimeWindow(v.preferredTime),
  };
}

// Angler-Profil (BaitBuddy 2.0): Erfahrung, Region und persönliche Ziele.
// Liegt wie buddy/navigation/fishing in user_metadata.settings und geht über
// denselben savePreferences-Pfad. Die Region referenziert `FEDERAL_STATES`
// (src/components/rules/rule-utils.jsx) — dieselbe Kennung nutzen Regelwerk und
// Schonzeiten, damit Angaben aus dem Onboarding dort direkt greifen.
export const EXPERIENCE_OPTIONS = [
  { id: 'beginner', label: 'Anfänger', description: 'Erste Schritte, Grundlagen stehen noch an.' },
  { id: 'advanced', label: 'Fortgeschritten', description: 'Regelmäßig unterwegs, Technik sitzt weitgehend.' },
  { id: 'expert', label: 'Erfahren', description: 'Langjährige Praxis, gezielte Taktik.' },
];

export const GOAL_OPTIONS = [
  'Mehr Fänge',
  'Neue Gewässer entdecken',
  'Technik verbessern',
  'Zielfisch gezielt fangen',
  'Entspannung',
  'Wettbewerbe',
];

export const DEFAULT_ANGLER = { experience: null, region: null, goals: [] };

export function normalizeAngler(value = {}) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const experience = EXPERIENCE_OPTIONS.some((o) => o.id === v.experience) ? v.experience : null;
  const region = typeof v.region === 'string' && /^[a-z]{2}$/.test(v.region) ? v.region : null;
  return { experience, region, goals: cleanStringList(v.goals, 6) };
}
