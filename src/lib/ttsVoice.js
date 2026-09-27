// KI-Buddy-Stimme für die Sprachausgabe: eine einzige, weibliche Stimme für
// alle — je nach Tarif entweder die schnelle Gerätestimme (Free/Basic) oder
// die natürliche Premium-Stimme (Pro/Ultimate, /api/ai/tts). Keine
// nutzerseitige Männlich/Weiblich-Wahl mehr (früher "Daniel"/"Matilda") —
// das verbindliche Plan-Gate sitzt serverseitig.

let activeAudio = { voiceEnabled: true, speed: 1 };
export function setActiveBuddyAudio(settings) { activeAudio = { voiceEnabled: settings.voiceEnabled !== false, speed: settings.speed || 1 }; }
export function getActiveBuddyAudio() { return activeAudio; }

// Stimmen-Stufe nach Plan: 'premium' = natürliche Server-Stimme (/api/ai/tts,
// ab Pro), 'browser' = schnelle Gerätestimme (Free/Basic). Gesetzt vom
// PlanProvider; das verbindliche Gate sitzt serverseitig (403
// premium_voice_required), der Client fällt dann selbst auf 'browser' zurück.
let voiceTier = 'browser';
export function setVoiceTier(tier) { voiceTier = tier === 'premium' ? 'premium' : 'browser'; }
export function getVoiceTier() { return voiceTier; }
