// Validierung der Vereinsprofil-Felder. Alles, was hier durchgeht, ist
// öffentlich sichtbar (fishing_clubs hat eine öffentliche Lese-Policy) —
// deshalb strikte Längen und nur http(s)-Links.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s/()-]{3,30}$/;
export const EXTERNAL_REF = /^[A-Za-z0-9_-]{3,64}$/;

function text(value, max) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return { error: 'muss Text sein' };
  const trimmed = value.trim();
  if (trimmed.length > max) return { error: `darf höchstens ${max} Zeichen haben` };
  return trimmed || null;
}

function url(value) {
  const t = text(value, 300);
  if (t === undefined || t === null || typeof t === 'object') return t;
  try {
    const parsed = new URL(t.startsWith('http') ? t : `https://${t}`);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'muss ein http(s)-Link sein' };
    return parsed.toString();
  } catch {
    return { error: 'ist kein gültiger Link' };
  }
}

function integer(value, min, max) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return { error: `muss eine ganze Zahl zwischen ${min} und ${max} sein` };
  return n;
}

function stringList(value, maxItems, maxLength) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return { error: 'muss eine Liste sein' };
  const items = value.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  if (items.length > maxItems) return { error: `darf höchstens ${maxItems} Einträge haben` };
  if (items.some(v => v.length > maxLength)) return { error: `Einträge dürfen höchstens ${maxLength} Zeichen haben` };
  return items;
}

function waters(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) return { error: 'muss eine Liste mit höchstens 12 Gewässern sein' };
  const out = [];
  for (const entry of value) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) continue;
    if (name.length > 80) return { error: 'Gewässernamen dürfen höchstens 80 Zeichen haben' };
    const region = typeof entry.region === 'string' ? entry.region.trim().slice(0, 80) : '';
    const species = stringList(entry.species ?? [], 10, 40);
    if (species?.error) return species;
    out.push({ name, region: region || null, species });
  }
  return out;
}

const FIELDS = {
  name: v => text(v, 120),
  description: v => text(v, 1500),
  motto: v => text(v, 200),
  region: v => text(v, 80),
  home_water: v => text(v, 120),
  street: v => text(v, 120),
  postal_code: v => text(v, 10),
  city: v => text(v, 80),
  contact: v => text(v, 200),
  website: url,
  logo_url: url,
  founded_year: v => integer(v, 1800, new Date().getFullYear()),
  member_count: v => integer(v, 0, 1000000),
  latitude: v => (v === undefined || v === null ? v : (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 90 ? Number(v) : { error: 'ist ungültig' })),
  longitude: v => (v === undefined || v === null ? v : (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180 ? Number(v) : { error: 'ist ungültig' })),
  rules: v => stringList(v, 12, 160),
  waters,
  phone: v => {
    const t = text(v, 40);
    return typeof t === 'string' && !PHONE.test(t) ? { error: 'ist keine gültige Telefonnummer' } : t;
  },
  email: v => {
    const t = text(v, 120);
    return typeof t === 'string' && !EMAIL.test(t) ? { error: 'ist keine gültige E-Mail-Adresse' } : t;
  },
};

const LABELS = {
  name: 'Name', description: 'Beschreibung', motto: 'Leitsatz', region: 'Region', home_water: 'Hauptgewässer',
  street: 'Straße', postal_code: 'PLZ', city: 'Ort', contact: 'Kontakt', website: 'Website', logo_url: 'Logo',
  founded_year: 'Gründungsjahr', member_count: 'Mitgliederzahl', latitude: 'Breitengrad', longitude: 'Längengrad',
  rules: 'Regeln', waters: 'Gewässer', phone: 'Telefon', email: 'E-Mail',
};

/**
 * @returns {{ ok: true, value: Record<string, any> } | { ok: false, error: string }}
 */
export function validateClubProfile(body, { requireName = false } = {}) {
  const value = {};
  for (const [key, check] of Object.entries(FIELDS)) {
    const result = check(body?.[key]);
    if (result === undefined) continue;
    if (result && typeof result === 'object' && !Array.isArray(result) && result.error) {
      return { ok: false, error: `${LABELS[key]} ${result.error}` };
    }
    value[key] = result;
  }
  if (requireName && (!value.name || value.name.length < 2)) {
    return { ok: false, error: 'Name des Vereins erforderlich (mindestens 2 Zeichen)' };
  }
  if ('name' in value && (!value.name || value.name.length < 2)) {
    return { ok: false, error: 'Name des Vereins erforderlich (mindestens 2 Zeichen)' };
  }
  return { ok: true, value };
}
