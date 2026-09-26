import { useEffect, useState } from 'react';
import {
  isVoiceSpeaking, subscribeVoiceSpeaking, isVoiceMuted, subscribeVoiceMuted, setVoiceMuted,
} from '@/lib/voiceActivity';

// true, solange der Buddy spricht (Premium- oder Gerätestimme).
export function useVoiceSpeaking() {
  const [speaking, setSpeaking] = useState(isVoiceSpeaking);
  useEffect(() => subscribeVoiceSpeaking(setSpeaking), []);
  return speaking;
}

// [muted, setMuted] — globaler Lautlos-Schalter der Buddy-Stimme.
export function useVoiceMuted() {
  const [muted, setMutedState] = useState(isVoiceMuted);
  useEffect(() => subscribeVoiceMuted(setMutedState), []);
  return [muted, setVoiceMuted];
}
