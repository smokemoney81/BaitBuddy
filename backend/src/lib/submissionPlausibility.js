// Plausibilitätsprüfung für Wettbewerbs-Einreichungen.
//
// Harte Verstöße ("block") lehnen die Einreichung ab: Fang außerhalb des
// Wettbewerbszeitraums oder eine Fischart, die in diesem Wettbewerb nicht
// gewertet wird. Auffälligkeiten ("review") lassen die Einreichung zu, schicken
// sie aber in die Prüfung durch den Veranstalter, bevor sie in der Rangliste
// zählt: Länge über dem bekannten Maximum der Art, unstimmiges
// Längen-Gewichts-Verhältnis, fehlendes Foto oder eine mögliche Doppelmeldung.

// Realistische Höchstlängen (cm) heimischer Arten. Darüber ist ein Fang nicht
// unmöglich, aber ein Fall für den Veranstalter.
const MAX_LENGTH_CM = {
  hecht: 150, zander: 130, barsch: 60, flussbarsch: 60, karpfen: 130, spiegelkarpfen: 130,
  schuppenkarpfen: 130, graskarpfen: 150, wels: 280, waller: 280, bachforelle: 100,
  regenbogenforelle: 100, forelle: 100, seeforelle: 130, meerforelle: 130, lachs: 150,
  saibling: 90, äsche: 60, aesche: 60, huchen: 180, aal: 150, schleie: 70, brasse: 85,
  brachse: 85, blei: 85, rotauge: 50, plötze: 50, rotfeder: 50, döbel: 80, doebel: 80,
  aland: 80, barbe: 100, rapfen: 120, karausche: 60, giebel: 50, stör: 300, stoer: 300,
  dorsch: 150, quappe: 100, rutte: 100,
};

// Fulton-Konditionsfaktor K = 100 · Gewicht(g) / Länge(cm)³. Heimische Arten
// liegen etwa zwischen 0,5 (Aal, Hecht) und 2,5 (Karpfen); weit außerhalb
// deutet auf einen Tippfehler bei Länge oder Gewicht.
const K_MIN = 0.25;
const K_MAX = 3.2;

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

export function targetSpeciesList(targetSpecies) {
  return String(targetSpecies || '')
    .split(/[,;/·•]|\bund\b/i)
    .map(s => s.trim())
    .filter(Boolean);
}

export function maxLengthFor(species) {
  const key = normalize(species);
  if (MAX_LENGTH_CM[key]) return MAX_LENGTH_CM[key];
  const hit = Object.keys(MAX_LENGTH_CM).find(name => key.includes(name));
  return hit ? MAX_LENGTH_CM[hit] : null;
}

/**
 * @param {{ species: string, length_cm?: number|null, weight_kg?: number|null, photo_url?: string|null, catch_time: string }} submission
 * @param {{ start_date?: string, end_date?: string, target_species?: string|null, requires_approval?: boolean }} event
 * @param {{ now?: number, recent?: Array<{ species: string, length_cm: number|null, catch_time: string }> }} [options]
 */
export function checkSubmission(submission, event, { now = Date.now(), recent = [] } = {}) {
  const checks = [];
  const add = (id, label, ok, severity, message) => checks.push({ id, label, ok, severity, message: ok ? null : message });

  const caught = new Date(submission.catch_time).getTime();
  const start = event?.start_date ? new Date(event.start_date).getTime() : null;
  const end = event?.end_date ? new Date(event.end_date).getTime() : null;
  const inWindow = Number.isFinite(caught)
    && caught <= now + FUTURE_TOLERANCE_MS
    && (start === null || caught >= start)
    && (end === null || caught <= end);
  add('time', 'Fangzeit im Wettbewerbszeitraum', inWindow, 'block',
    'Der Fang liegt außerhalb des Wettbewerbszeitraums oder in der Zukunft.');

  const targets = targetSpeciesList(event?.target_species);
  const species = normalize(submission.species);
  const speciesOk = targets.length === 0 || targets.some(t => species.includes(normalize(t)) || normalize(t).includes(species));
  add('species', 'Zielart des Wettbewerbs', speciesOk, 'block',
    `Gewertet werden nur: ${targets.join(', ')}.`);

  const length = Number(submission.length_cm);
  const max = maxLengthFor(submission.species);
  const lengthOk = !Number.isFinite(length) || length <= 0 || max === null || length <= max;
  add('length', 'Länge realistisch für die Art', lengthOk, 'review',
    `Über ${max} cm ist für ${submission.species} außergewöhnlich und wird geprüft.`);

  const weight = Number(submission.weight_kg);
  let conditionOk = true;
  if (Number.isFinite(length) && length > 0 && Number.isFinite(weight) && weight > 0) {
    const k = (100 * weight * 1000) / (length ** 3);
    conditionOk = k >= K_MIN && k <= K_MAX;
  }
  add('condition', 'Länge und Gewicht passen zusammen', conditionOk, 'review',
    'Länge und Gewicht passen nicht zusammen – bitte Angaben prüfen.');

  add('photo', 'Foto vorhanden', Boolean(submission.photo_url), 'review',
    'Ohne Foto prüft der Veranstalter den Fang, bevor er zählt.');

  const duplicate = recent.some(r => normalize(r.species) === species
    && Number(r.length_cm) === length
    && Math.abs(new Date(r.catch_time).getTime() - caught) < 10 * 60 * 1000);
  add('duplicate', 'Keine Doppelmeldung', !duplicate, 'review',
    'Gleicher Fisch mit gleicher Länge wurde gerade schon eingereicht.');

  const blocked = checks.some(c => !c.ok && c.severity === 'block');
  const flagged = checks.some(c => !c.ok && c.severity === 'review');
  const needsReview = !blocked && (flagged || event?.requires_approval === true);
  return { checks, blocked, needsReview };
}

// Deterministische Priorität für die Prüf-Warteschlange des Veranstalters
// (`GET /events/:id/review`) — mehr fehlgeschlagene Auffälligkeits-Checks
// heißt dringlicher zu prüfen. Ändert NIE, ob eine Einreichung zählt
// (`blocked`/`needsReview` bleiben allein maßgeblich) — nur die
// Sichtungs-Reihenfolge für den Veranstalter. Phase-6-Erweiterung (Jev, siehe
// `jevReviewPriority.js`) darf diese Stufe verfeinern, niemals eine
// Einreichung selbst be- oder entwerten.
export function classifyReviewPriority(checks = []) {
  const failedReview = checks.filter((c) => !c.ok && c.severity === 'review').length;
  if (failedReview >= 2) return 'high';
  if (failedReview === 1) return 'medium';
  return 'low';
}
