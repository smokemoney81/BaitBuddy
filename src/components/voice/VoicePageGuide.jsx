import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { FishingPlan } from '@/entities/FishingPlan';
import { selectNextTrip } from '@/lib/tripJourney';
import { runWhenAudioReady } from '@/lib/audioUnlock';
import { isVoiceMuted, isVoiceSpeaking } from '@/lib/voiceActivity';
import { getActiveAdContexts } from '@/lib/adActiveContext';
import { speakWithFallback } from '@/components/utils/elevenLabsTTS';
import {
  isVoiceGuideEnabled, pageIntroToSpeak, markPageIntroSpoken,
  tasksHintDue, markTasksHintSpoken, buildOpenTasksHint,
} from '@/lib/voicePageGuide';

// Lässt den Buddy von sich aus sprechen: kurze Seiten-Einleitung beim ersten
// Besuch (7 Tage Pause je Seite) und auf dem Dashboard ein Hinweis auf offene
// Aufgaben (6 h Pause). Rendert nichts. Wartet auf die erste Nutzer-Geste
// (Autoplay-Policy) und spricht nur, solange die Seite noch offen ist.
const START_DELAY_MS = 1200;

export default function VoicePageGuide({ pageName }) {
  const { user } = useAuth();
  const { buddy, onboarding } = useBuddyPreferences();
  const pageRef = useRef(pageName);
  pageRef.current = pageName;
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;
  const loggedIn = !!user;
  const voiceEnabled = buddy?.voiceEnabled !== false;

  useEffect(() => {
    if (!pageName || !voiceEnabled || !isVoiceGuideEnabled()) return undefined;
    let cancelled = false;
    // Nicht mitten in einen kritischen Moment reden: läuft schon eine
    // Sprachausgabe (der Buddy antwortet gerade, liest etwas vor …) oder eine
    // nicht unterbrechbare Session (Bisserkennung/Drill, siehe
    // adActiveContext.js), wartet der Hinweis einfach bis zum nächsten
    // natürlichen Seitenaufruf, statt dazwischenzureden.
    const stillHere = () => !cancelled && pageRef.current === pageName && !isVoiceMuted()
      && !isVoiceSpeaking() && getActiveAdContexts().length === 0;

    const timer = setTimeout(() => {
      runWhenAudioReady(async () => {
        if (!stillHere()) return;
        const intro = pageIntroToSpeak(pageName);
        if (intro) {
          markPageIntroSpoken(pageName);
          await speakWithFallback(intro);
        }
        if (pageName !== 'Dashboard' || !loggedIn || !tasksHintDue() || !stillHere()) return;
        let nextTrip = null;
        try {
          const list = await FishingPlan.list('-created_at');
          nextTrip = selectNextTrip(Array.isArray(list) ? list : []);
        } catch { /* ohne Trip-Daten nur Onboarding prüfen */ }
        const hint = buildOpenTasksHint({ nextTrip, onboarding: onboardingRef.current });
        if (!hint || !stillHere()) return;
        markTasksHintSpoken();
        await speakWithFallback(hint);
      });
    }, START_DELAY_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [pageName, loggedIn, voiceEnabled]);

  return null;
}
