// Gewählte KI-Buddy-Stimme für die ElevenLabs-Sprachausgabe.
//
// 'male'   = Standardstimme "Daniel" (alle Pläne)
// 'female' = weibliche Stimme — Ultimate-Feature. Die Auswahl hier ist nur
//            Komfort im Client: Das verbindliche Plan-Gate sitzt serverseitig
//            in POST /api/ai/tts und fällt ohne Ultimate still auf die
//            Standardstimme zurück.
//
// Gespeichert in localStorage, damit die Wahl App-Starts überlebt und alle
// TTS-Aufrufer (Widget, Stub, KiBuddyBeta, AIAssistant) sie automatisch nutzen.

export const TTS_VOICE_KEY = 'buddy-tts-voice';
let activeAudio = { voiceEnabled: true, speed: 1 };
export function setActiveBuddyAudio(settings) { activeAudio = { voiceEnabled: settings.voiceEnabled !== false, speed: settings.speed || 1 }; }
export function getActiveBuddyAudio() { return activeAudio; }

export function getPreferredTtsVoice() {
  try {
    return localStorage.getItem(TTS_VOICE_KEY) === 'female' ? 'female' : 'male';
  } catch {
    return 'male';
  }
}

export function setPreferredTtsVoice(voice) {
  try {
    localStorage.setItem(TTS_VOICE_KEY, voice === 'female' ? 'female' : 'male');
  } catch {
    /* localStorage optional (Private Mode) */
  }
}

// Stimmen-Stufe nach Plan: 'premium' = natürliche Server-Stimme (/api/ai/tts,
// ab Ultimate), 'browser' = schnelle Gerätestimme (Free/Basic/Pro). Gesetzt
// vom PlanProvider; das verbindliche Gate sitzt serverseitig (403
// premium_voice_required), der Client fällt dann selbst auf 'browser' zurück.
let voiceTier = 'browser';
export function setVoiceTier(tier) { voiceTier = tier === 'premium' ? 'premium' : 'browser'; }
export function getVoiceTier() { return voiceTier; }
