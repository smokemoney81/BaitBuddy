// Globaler Sprech-Status und Lautlos-Schalter der Buddy-Stimme.
//
// - Sprech-Status: elevenLabsTTS.js meldet Start/Ende jeder Wiedergabe; die
//   Bottom-Nav lässt das BaitBuddy-Logo leuchten, solange der Buddy spricht.
//   Das Ende wird kurz verzögert gemeldet, damit das Logo zwischen zwei Sätzen
//   der Satz-Queue nicht flackert.
// - Lautlos: schaltet jede Sprachausgabe der App stumm (localStorage
//   `bb_voice_muted`, überlebt App-Starts). Umschaltbar über VoiceMuteButton.

const MUTE_KEY = 'bb_voice_muted';
const END_DELAY_MS = 350;

let speaking = false;
let endTimer = null;
const speakingListeners = new Set();
const muteListeners = new Set();

function emitSpeaking(value) {
  if (speaking === value) return;
  speaking = value;
  for (const fn of speakingListeners) fn(value);
}

export function setVoiceSpeaking(value) {
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  if (value) emitSpeaking(true);
  else endTimer = setTimeout(() => { endTimer = null; emitSpeaking(false); }, END_DELAY_MS);
}

export function isVoiceSpeaking() { return speaking; }

export function subscribeVoiceSpeaking(fn) {
  speakingListeners.add(fn);
  return () => speakingListeners.delete(fn);
}

export function isVoiceMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function setVoiceMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* Private Mode */ }
  for (const fn of muteListeners) fn(!!muted);
}

export function subscribeVoiceMuted(fn) {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}
