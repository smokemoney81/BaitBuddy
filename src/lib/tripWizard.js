// Reine Logik für den geführten Trip-Planer-Wizard (BaitBuddy 2.0, Spec §5-14).
// Kein React/DOM → unit-testbar. Baut auf dem bestehenden FishingPlan-Modell auf
// (title, target_fish, spot_info, planned_date, steps[], details{}) und erzeugt
// exakt dessen Payload — es wird KEIN neues Trip-Schema eingeführt.

import { readPlanSpot } from './tripJourney';

// Reihenfolge der Wizard-Schritte (Spec §5-14) plus abschließende Zusammenfassung.
export const WIZARD_STEPS = [
  { id: 'target', label: 'Zielfisch' },
  { id: 'spot', label: 'Ort' },
  { id: 'time', label: 'Zeitpunkt' },
  { id: 'conditions', label: 'Bedingungen' },
  { id: 'gear', label: 'Ausrüstung' },
  { id: 'bait', label: 'Köder' },
  { id: 'rules', label: 'Vorschriften' },
  { id: 'checklist', label: 'Checkliste' },
  { id: 'summary', label: 'Zusammenfassung' },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function pad(n) { return String(n).padStart(2, '0'); }

// Lokales Datum als YYYY-MM-DD (kein UTC-Versatz durch toISOString).
export function formatLocalDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Schnellauswahl Heute/Morgen/Wochenende (Spec §7) -> YYYY-MM-DD.
export function resolveQuickDate(kind, now = new Date()) {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  if (kind === 'today') return formatLocalDate(base);
  if (kind === 'tomorrow') {
    base.setDate(base.getDate() + 1);
    return formatLocalDate(base);
  }
  if (kind === 'weekend') {
    // Nächster Samstag; ist heute schon Sa/So, nimm den kommenden Samstag.
    const day = base.getDay(); // 0=So .. 6=Sa
    const add = day === 6 ? 0 : (6 - day + 7) % 7;
    base.setDate(base.getDate() + (add === 0 && day !== 6 ? 7 : add));
    return formatLocalDate(base);
  }
  return '';
}

// Intelligente Standard-Checkliste (Spec §13). Basis-Items immer, plus
// zielfisch-/methodenabhängige Ergänzungen. Rückgabe: string[] (passt zu
// FishingPlan.steps).
export function defaultChecklist(state = {}) {
  const items = ['Angelschein', 'Gewässerkarte', 'Kescher', 'Abhakmatte', 'Zange', 'Maßband', 'Getränke', 'Powerbank', 'Regenjacke'];
  const fish = (state.target_fish || '').toLowerCase();
  const method = (state.method || '').toLowerCase();
  if (fish.includes('karpfen') || fish.includes('wels') || method.includes('grund') || method.includes('ansitz')) {
    items.push('Rutenauflage / Rod Pod', 'Bissanzeiger', 'Futter');
  }
  if (fish.includes('hecht') || fish.includes('zander') || fish.includes('barsch') || method.includes('spinn') || method.includes('dropshot')) {
    items.push('Stahl-/Hardmono-Vorfach', 'Ködersortiment', 'Lösezange');
  }
  if (state.start_time && Number(state.start_time.slice(0, 2)) >= 19) {
    items.push('Kopflampe');
  }
  return [...new Set(items)];
}

// Wizard-State aus einem bestehenden Plan (Bearbeiten) oder leer (neu).
export function createInitialWizardState(plan = null) {
  if (!plan) {
    return {
      title: '', target_fish: '', spot: { name: '', water_type: '', lat: null, lon: null, spot_id: null },
      date: '', start_time: '', end_time: '', weather_snapshot: null,
      gear_items: [], gear_note: '', bait: '', method: '',
      rules: [], rules_ack: false, checklist: [], companions: '', notes: '',
    };
  }
  const details = plan.details && typeof plan.details === 'object' && !Array.isArray(plan.details) ? plan.details : {};
  const spot = readPlanSpot(plan.spot_info);
  const d = plan.planned_date ? new Date(plan.planned_date) : null;
  return {
    title: plan.title || '',
    target_fish: plan.target_fish || '',
    spot: { name: spot.name, water_type: spot.water_type, lat: spot.lat, lon: spot.lon, spot_id: details.spot_id || null },
    date: d && !Number.isNaN(d.getTime()) ? formatLocalDate(d) : '',
    start_time: details.start_time && TIME_RE.test(details.start_time) ? details.start_time : (d && !Number.isNaN(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''),
    end_time: details.end_time && TIME_RE.test(details.end_time) ? details.end_time : '',
    weather_snapshot: details.weather_snapshot || null,
    gear_items: Array.isArray(details.gear_items) ? details.gear_items : [],
    gear_note: typeof details.gear === 'string' ? details.gear : '',
    bait: details.bait || '',
    method: details.method || '',
    rules: Array.isArray(details.rules) ? details.rules : [],
    rules_ack: details.rules_ack === true,
    checklist: Array.isArray(plan.steps) ? plan.steps.filter((s) => typeof s === 'string') : [],
    companions: details.companions || '',
    notes: details.notes || '',
  };
}

function durationHours(start, end) {
  if (!TIME_RE.test(start || '') || !TIME_RE.test(end || '')) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // über Mitternacht
  return Math.round((mins / 60) * 10) / 10;
}

// Baut den FishingPlan-Payload aus dem Wizard-State.
export function buildPlanPayload(state = {}) {
  const spot = state.spot || {};
  const packedNames = (state.gear_items || []).filter((g) => g && g.packed).map((g) => g.name).filter(Boolean);
  const gearText = [state.gear_note, packedNames.join(', ')].filter((s) => s && s.trim()).join(state.gear_note && packedNames.length ? ' — ' : '');

  let plannedDate = null;
  if (state.date) {
    const time = TIME_RE.test(state.start_time || '') ? state.start_time : '00:00';
    const dt = new Date(`${state.date}T${time}`);
    if (!Number.isNaN(dt.getTime())) plannedDate = dt.toISOString();
  }

  const title = (state.title && state.title.trim())
    || [state.target_fish, spot.name].filter(Boolean).join(' · ')
    || 'Angelausflug';

  return {
    title,
    target_fish: state.target_fish || '',
    spot_info: {
      name: spot.name || '',
      water_type: spot.water_type || '',
      lat: spot.lat != null ? Number(spot.lat) : null,
      lon: spot.lon != null ? Number(spot.lon) : null,
    },
    planned_date: plannedDate,
    steps: Array.isArray(state.checklist) ? state.checklist.filter((s) => typeof s === 'string' && s.trim()) : [],
    details: {
      method: state.method || '',
      bait: state.bait || '',
      gear: gearText,
      gear_items: state.gear_items || [],
      rules: state.rules || [],
      rules_ack: state.rules_ack === true,
      weather_snapshot: state.weather_snapshot || null,
      start_time: TIME_RE.test(state.start_time || '') ? state.start_time : '',
      end_time: TIME_RE.test(state.end_time || '') ? state.end_time : '',
      duration_hours: durationHours(state.start_time, state.end_time),
      companions: state.companions || '',
      notes: state.notes || '',
      spot_id: spot.spot_id || null,
    },
  };
}

// Ist ein Schritt sinnvoll abgeschlossen? Spiegelt die Journey-Regeln.
export function stepComplete(state, stepId) {
  const s = state || {};
  const spot = s.spot || {};
  switch (stepId) {
    case 'target': return !!(s.target_fish && s.target_fish.trim());
    case 'spot': return !!(spot.name && spot.name.trim());
    case 'time': return !!s.date;
    case 'conditions':
      return !!(s.weather_snapshot && typeof s.weather_snapshot === 'object' && Object.keys(s.weather_snapshot).length)
        || (spot.lat != null && spot.lon != null && !!s.date);
    case 'gear': return (s.gear_items || []).some((g) => g && g.packed) || !!(s.gear_note && s.gear_note.trim());
    case 'bait': return !!(s.bait && s.bait.trim());
    case 'rules': return s.rules_ack === true || (Array.isArray(s.rules) && s.rules.length > 0);
    case 'checklist': return Array.isArray(s.checklist) && s.checklist.length > 0;
    case 'summary': return true;
    default: return false;
  }
}
