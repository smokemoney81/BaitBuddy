// Globaler KI-Aktivitätsstatus des Buddy-Icons.
// Vier Zustände: idle, listening, processing, speaking.
// Gesteuert aus KiBuddyBeta, VoiceChat, HandsFreeBuddy und elevenLabsTTS.
// Das Bottom-Nav-Icon passt Animation und Haptik an diesen Status an.

const HAPTIC_KEY = 'bb_buddy_haptic_enabled';

let activity = 'idle';
const listeners = new Set();

function emit(value) {
  if (activity === value) return;
  activity = value;
  for (const fn of listeners) fn(value);
}

export function setBuddyActivity(state) {
  if (!['idle', 'listening', 'processing', 'speaking'].includes(state)) return;
  emit(state);
}

export function getBuddyActivity() { return activity; }

export function subscribeBuddyActivity(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isBuddyHapticEnabled() {
  try { return localStorage.getItem(HAPTIC_KEY) !== '0'; } catch { return true; }
}

export function setBuddyHapticEnabled(enabled) {
  try { localStorage.setItem(HAPTIC_KEY, enabled ? '1' : '0'); } catch { /* Private Mode */ }
}
