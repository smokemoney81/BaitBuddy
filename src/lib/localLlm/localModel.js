// Einstellungen und Auswahl-Logik für den lokalen KI-Buddy (ohne React).
//
// KI-Modus:
//   auto   — Cloud (Anthropic), solange sie erreichbar ist; ohne Netz oder bei
//            Cloud-Ausfall übernimmt das Modell auf dem Gerät.
//   device — nur auf dem Gerät: Fragen und Daten verlassen das Handy nicht
//            (Wetter/Fangbuch holen die Tools weiterhin von den BaitBuddy-Diensten).
//   cloud  — nur Cloud (bisheriges Verhalten).
//
// Warum Cloud im Automatik-Modus vorne liegt: Ein 4B-Modell auf der Handy-CPU
// braucht für eine Antwort mehrere Sekunden und weiß weniger als die Cloud-KI.
// Offline ist es dagegen ein echter Gewinn gegenüber reinen FAQ-Antworten.

import { callNative, hasNativeLocalLlm } from './nativeBridge';

export const AI_MODES = ['auto', 'device', 'cloud'];
export const AI_MODE_KEY = 'bb_ai_mode';
export const LOCAL_MODEL_KEY = 'bb_local_llm_model';
export const AI_MODE_EVENT = 'bb-ai-mode-changed';

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* privater Modus: bleibt für diese Sitzung beim Standard */ }
}

export function getAiMode() {
  const stored = readStorage(AI_MODE_KEY);
  return AI_MODES.includes(stored) ? stored : 'auto';
}

export function setAiMode(mode) {
  if (!AI_MODES.includes(mode)) return;
  writeStorage(AI_MODE_KEY, mode);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AI_MODE_EVENT, { detail: mode }));
}

export function getPreferredModelId() {
  return readStorage(LOCAL_MODEL_KEY);
}

export function setPreferredModelId(id) {
  if (id) writeStorage(LOCAL_MODEL_KEY, id);
}

/** Status der nativen Engine oder null (Browser, alte App-Version, Fehler). */
export async function getLocalLlmStatus() {
  if (!hasNativeLocalLlm()) return null;
  try {
    return await callNative('status');
  } catch {
    return null;
  }
}

/** Das Modell, mit dem gerechnet wird: das gewählte, sonst das erste fertige. */
export function pickReadyModel(status, preferredId = getPreferredModelId()) {
  const models = (status?.models || []).filter(m => m.state === 'ready' && m.fitsDevice);
  return models.find(m => m.id === preferredId) || models[0] || null;
}

/**
 * Welche KI beantwortet die nächste Frage?
 * @returns {'local'|'cloud'|'none'}  none = Modus "Gerät", aber kein Modell bereit
 */
export function resolveBuddyEngine({ mode = getAiMode(), online = true, readyModel = null } = {}) {
  if (mode === 'cloud') return 'cloud';
  if (mode === 'device') return readyModel ? 'local' : 'none';
  if (!online && readyModel) return 'local';
  return 'cloud';
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(bytes / (1024 ** 2)).toLocaleString('de-DE')} MB`;
}
