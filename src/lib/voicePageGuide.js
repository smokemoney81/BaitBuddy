// Sprach-Hinweise des Buddys: Beim ersten Öffnen einer Seite erklärt der Buddy
// kurz, was man dort machen kann; auf dem Dashboard erinnert er an offene
// Aufgaben (unvollständige Trip-Planung, nicht abgeschlossenes Onboarding).
//
// Reine Logik ohne React (testbar). Gesprochen wird in VoicePageGuide.jsx über
// die zentrale TTS-Utility — Plan-Stimme, Lautlos und Abbruch greifen dort.

import { computeTripJourney } from '@/lib/tripJourney';

export const PAGE_VOICE_INTROS = {
  Dashboard: 'Willkommen zurück. Hier siehst du Wetter, deine nächsten Trips und Schnellzugriffe. Halte das Logo unten gedrückt, um direkt mit mir zu sprechen.',
  Map: 'Hier ist die Karte. Du kannst Angelplätze finden, eigene Spots speichern und Gewässer erkunden.',
  Weather: 'Hier findest du Wetter, Luftdruck und Wind für deinen Angeltag. Daraus leite ich ab, wann die Fische beißen.',
  Logbook: 'Das ist dein Fangbuch. Trag hier deine Fänge ein, oder sag mir einfach: Karpfen ins Fangbuch.',
  CatchStats: 'Hier siehst du deine Statistiken: welche Köder, Zeiten und Plätze bei dir am besten laufen.',
  TripPlanner: 'Hier planst du deine Trips: Zielfisch, Ort, Zeit, Ausrüstung und Köder. Ich helfe dir bei jedem Schritt.',
  AnglerMode: 'Das ist der Anglermodus für unterwegs. Starte hier deinen Trip und halte Fänge direkt am Wasser fest.',
  Community: 'Hier ist die Community. Teile Fänge, stell Fragen und schau, was andere Angler erleben.',
  Events: 'Hier findest du Events und Wettbewerbe. Du kannst mitmachen oder selbst ein Event starten.',
  Rank: 'Hier siehst du die Ranglisten und wie du im Vergleich abschneidest.',
  Gear: 'Hier verwaltest du deine Ausrüstung. So weiß ich, welche Rute und Rolle du dabei hast.',
  AI: 'Hier bestimmst du Fische per Foto. Mach ein Bild, und ich sage dir, welche Art es ist.',
  WaterAnalysis: 'Hier analysierst du ein Gewässer: Tiefe, Struktur und wo sich die Fische aufhalten.',
  BaitMixer: 'Hier bekommst du Köderempfehlungen passend zu Fisch, Gewässer und Wetter.',
  Koeder3D: 'Hier siehst du Kunstköder in 3D und wie man sie richtig führt.',
  FishRecipes: 'Hier findest du Rezepte für deinen Fang.',
  AngelscheinPruefungSchonzeiten: 'Hier bereitest du dich auf die Fischerprüfung vor und findest Schonzeiten und Mindestmaße für dein Bundesland. Ich lese dir die Fragen vor, mit der Lautlos-Taste schaltest du das ab.',
  RuleAssistant: 'Hier beantworte ich deine Fragen zu Angelregeln, Schonzeiten und Mindestmaßen.',
  Quiz: 'Hier ist das Angel-Quiz. Wähl einen Schwierigkeitsgrad. Ich lese dir jede Frage vor, mit der Lautlos-Taste schaltest du das ab.',
  Profile: 'Das ist dein Profil mit deinen Angaben und Erfolgen.',
  Settings: 'Hier stellst du die App ein, auch meine Stimme und die Sprach-Hinweise.',
  PremiumPlans: 'Hier siehst du die Tarife. Mit Ultimate bekommst du meine Premium-Stimme und das Live-Gespräch.',
  LevelRewards: 'Hier siehst du dein Level, deine Punkte und Abzeichen.',
  Vereinsprofil: 'Hier findest du Angelvereine in deiner Nähe.',
};

const GUIDE_ENABLED_KEY = 'bb_voice_guide_enabled';
const SEEN_KEY = 'bb_voice_guide_seen';
const TASKS_KEY = 'bb_voice_tasks_last';
export const INTRO_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const TASKS_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function isVoiceGuideEnabled() {
  try { return localStorage.getItem(GUIDE_ENABLED_KEY) !== '0'; } catch { return true; }
}

export function setVoiceGuideEnabled(enabled) {
  try { localStorage.setItem(GUIDE_ENABLED_KEY, enabled ? '1' : '0'); } catch { /* Private Mode */ }
}

function readSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

// Einleitung der Seite, wenn sie in den letzten 7 Tagen nicht gesprochen wurde.
export function pageIntroToSpeak(pageName, now = Date.now()) {
  const text = PAGE_VOICE_INTROS[pageName];
  if (!text) return null;
  const last = Number(readSeen()[pageName]) || 0;
  return now - last >= INTRO_COOLDOWN_MS ? text : null;
}

export function markPageIntroSpoken(pageName, now = Date.now()) {
  try {
    const seen = readSeen();
    seen[pageName] = now;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* Private Mode */ }
}

export function tasksHintDue(now = Date.now()) {
  try { return now - (Number(localStorage.getItem(TASKS_KEY)) || 0) >= TASKS_COOLDOWN_MS; } catch { return true; }
}

export function markTasksHintSpoken(now = Date.now()) {
  try { localStorage.setItem(TASKS_KEY, String(now)); } catch { /* Private Mode */ }
}

function joinGerman(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/**
 * Sprach-Hinweis zu offenen Aufgaben aus echten Daten, oder null.
 * @param {{ nextTrip?: object|null, onboarding?: { completed?: boolean, skipped?: boolean } }} input
 */
export function buildOpenTasksHint({ nextTrip = null, onboarding = null } = {}) {
  const parts = [];
  if (nextTrip) {
    const journey = computeTripJourney(nextTrip);
    const open = journey.steps.filter((s) => !s.complete).map((s) => s.label);
    if (open.length > 0) {
      const name = nextTrip.target_fish ? `deinem ${nextTrip.target_fish}-Trip` : 'deinem nächsten Trip';
      parts.push(`Bei ${name} fehlt noch: ${joinGerman(open.slice(0, 3))}${open.length > 3 ? ' und mehr' : ''}.`);
    }
  }
  if (onboarding && !onboarding.completed && !onboarding.skipped) {
    parts.push('Deine Einrichtung ist noch nicht abgeschlossen. Wenn du sie beendest, kann ich dich besser beraten.');
  }
  if (parts.length === 0) return null;
  return `Kurzer Hinweis: ${parts.join(' ')}`;
}
