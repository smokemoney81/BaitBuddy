import { useState, useRef, useCallback, useEffect } from 'react';
import { usePlan } from '@/components/premium/PlanContext';
import { speakWithElevenLabs, cancelElevenLabs } from '@/components/utils/elevenLabsTTS';

export function useAITTS() {
  const { hasFeature } = usePlan();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef(null);

  const isPremiumVoice = hasFeature('elite');

  const stop = useCallback(() => {
    cancelElevenLabs();
    audioRef.current = null;
    setIsSpeaking(false);
  }, []);

  // Einziger Sprach-Pfad ist die natürliche ElevenLabs-Stimme. Schlägt sie
  // fehl (offline, kein API-Key), bleibt die Ausgabe still — bewusst kein
  // Rückfall auf die Browser-Roboterstimme.
  const speak = useCallback(async (text) => {
    if (!text || typeof text !== 'string') return;
    stop();

    try {
      setIsSpeaking(true);
      const audio = await speakWithElevenLabs(text, {
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
      // null = von einem neueren speak/stop abgelöst — der steuert den State.
      if (audio) audioRef.current = audio;
    } catch (err) {
      console.warn('[useAITTS] ElevenLabs nicht verfügbar, Ausgabe bleibt still:', err?.message);
      setIsSpeaking(false);
    }
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { speak, stop, isSpeaking, isPremiumVoice };
}
