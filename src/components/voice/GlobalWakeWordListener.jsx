import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { readPrivacyPrefs } from '@/lib/privacyPrefs';
import { detectConfiguredWakeWord } from '@/lib/wakeWord';
import { resolvePage } from '@/lib/voicePages';
import { createPageUrl } from '@/utils';

const VOICE_ROUTES = new Set(['/KiBuddyBeta', '/VoiceChat', '/HandsFreeBuddy']);
const NAVIGATION_PREFIX = /^(?:öffne|oeffne|zeige|geh(?:e)?(?: bitte)?(?: zu)?|wechsel(?:e)?(?: bitte)?(?: zu)?|navigiere(?: bitte)?(?: zu)?|bring mich(?: bitte)?(?: zu)?|starte)\s+/i;
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);
const RETRYABLE_ERRORS = new Set(['network', 'no-speech', 'aborted']);
const RESTART_DELAY_MS = 500;

export function extractWakeCommand(transcript, phrase) {
  const { detected, command } = detectConfiguredWakeWord(transcript, phrase);
  return detected ? command : null;
}

export function resolveNavigationCommand(command) {
  if (!command) return null;
  const stripped = command.replace(NAVIGATION_PREFIX, '').trim();
  return resolvePage(stripped) || resolvePage(command);
}

export default function GlobalWakeWordListener() {
  const navigate = useNavigate();
  const location = useLocation();
  const recognitionRef = useRef(null);
  const prefsRef = useRef(readPrivacyPrefs());
  const shouldRunRef = useRef(false);
  const restartTimerRef = useRef(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    let disposed = false;

    const clearRestart = () => {
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };

    const isVoiceRoute = () => VOICE_ROUTES.has(window.location.pathname);
    const mayListen = () => !disposed
      && shouldRunRef.current
      && prefsRef.current.wakeWord
      && document.visibilityState === 'visible'
      && !isVoiceRoute();

    const stopRecognition = ({ disable = true } = {}) => {
      if (disable) shouldRunRef.current = false;
      clearRestart();
      generationRef.current += 1;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        if (typeof recognition.abort === 'function') recognition.abort();
        else recognition.stop();
      } catch { /* bereits beendet */ }
    };

    const scheduleRestart = (startRecognition, delay = RESTART_DELAY_MS) => {
      clearRestart();
      if (!mayListen()) return;
      const generation = generationRef.current;
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        if (generation !== generationRef.current || !mayListen()) return;
        startRecognition();
      }, delay);
    };

    const startRecognition = () => {
      clearRestart();
      if (!mayListen() || recognitionRef.current) return;

      const generation = generationRef.current;
      const recognition = new SpeechRecognition();
      recognition.lang = 'de-DE';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        if (generation !== generationRef.current || recognitionRef.current !== recognition) return;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          const transcript = result[0]?.transcript || '';
          const command = extractWakeCommand(transcript, prefsRef.current.wakeWordPhrase);
          if (command === null) continue;

          window.dispatchEvent(new CustomEvent('wake-word-detected', {
            detail: { phrase: prefsRef.current.wakeWordPhrase, command, transcript },
          }));

          const targetPage = resolveNavigationCommand(command);
          stopRecognition();

          if (targetPage) {
            navigate(createPageUrl(targetPage));
            return;
          }

          const params = new URLSearchParams({ mode: 'text', wake: '1' });
          if (command) params.set('question', command);
          else params.set('listen', '1');
          navigate(`/KiBuddyBeta?${params.toString()}`);
          return;
        }
      };

      recognition.onerror = (event) => {
        if (generation !== generationRef.current || recognitionRef.current !== recognition) return;
        const error = event?.error || '';
        if (FATAL_ERRORS.has(error)) {
          shouldRunRef.current = false;
          clearRestart();
          return;
        }
        // `aborted` ist beim absichtlichen Stop normal. Nur bei weiterhin
        // gewünschtem Listener neu starten. Netzwerk/no-speech bekommen Backoff.
        if (!RETRYABLE_ERRORS.has(error)) {
          scheduleRestart(startRecognition, 1000);
        }
      };

      recognition.onend = () => {
        if (generation !== generationRef.current) return;
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        scheduleRestart(startRecognition);
      };

      try {
        recognition.start();
      } catch {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        scheduleRestart(startRecognition, 1000);
      }
    };

    const enableAndStart = () => {
      prefsRef.current = readPrivacyPrefs();
      shouldRunRef.current = Boolean(prefsRef.current.wakeWord);
      if (shouldRunRef.current) startRecognition();
      else stopRecognition();
    };

    const handlePrefsChanged = (event) => {
      prefsRef.current = event.detail || readPrivacyPrefs();
      stopRecognition();
      shouldRunRef.current = Boolean(prefsRef.current.wakeWord);
      if (shouldRunRef.current) startRecognition();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') enableAndStart();
      else stopRecognition();
    };

    // Andere Voice-Komponenten können vor dem Öffnen des Mikrofons den globalen
    // Listener explizit pausieren und danach wieder freigeben. Das verhindert
    // Audio-Capture-Rennen auch außerhalb der bekannten Voice-Routen.
    const handleVoiceSessionStart = () => stopRecognition();
    const handleVoiceSessionEnd = () => enableAndStart();

    window.addEventListener('privacy-prefs-changed', handlePrefsChanged);
    window.addEventListener('baitbuddy-voice-session-start', handleVoiceSessionStart);
    window.addEventListener('baitbuddy-voice-session-end', handleVoiceSessionEnd);
    document.addEventListener('visibilitychange', handleVisibility);
    enableAndStart();

    return () => {
      disposed = true;
      window.removeEventListener('privacy-prefs-changed', handlePrefsChanged);
      window.removeEventListener('baitbuddy-voice-session-start', handleVoiceSessionStart);
      window.removeEventListener('baitbuddy-voice-session-end', handleVoiceSessionEnd);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopRecognition();
    };
  }, [navigate, location.pathname]);

  return null;
}
