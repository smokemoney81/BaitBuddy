import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { readPrivacyPrefs } from '@/lib/privacyPrefs';
import { normalizeTranscript } from '@/lib/wakeWord';
import { resolvePage } from '@/lib/voicePages';
import { createPageUrl } from '@/utils';

const VOICE_ROUTES = new Set(['/KiBuddyBeta', '/VoiceChat', '/HandsFreeBuddy']);
const NAVIGATION_PREFIX = /^(?:öffne|oeffne|zeige|geh(?:e)?(?: bitte)?(?: zu)?|wechsel(?:e)?(?: bitte)?(?: zu)?|navigiere(?: bitte)?(?: zu)?|bring mich(?: bitte)?(?: zu)?|starte)\s+/i;

export function extractWakeCommand(transcript, phrase) {
  const text = normalizeTranscript(transcript);
  const wake = normalizeTranscript(phrase);
  if (!text || !wake) return null;

  // Nur ganze Wortfolge akzeptieren. Damit löst z. B. das Wake-Word "Buddy"
  // nicht versehentlich bei "Buddys" aus.
  const paddedText = ` ${text} `;
  const token = ` ${wake} `;
  const index = paddedText.indexOf(token);
  if (index < 0) return null;
  return paddedText.slice(index + token.length).trim();
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
  const restartingRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    const isVoiceRoute = () => VOICE_ROUTES.has(window.location.pathname);

    const stopRecognition = () => {
      shouldRunRef.current = false;
      restartingRef.current = false;
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (!recognition) return;
      recognition.onend = null;
      try { recognition.stop(); } catch {}
    };

    const startRecognition = () => {
      const prefs = prefsRef.current;
      if (!prefs.wakeWord || document.visibilityState !== 'visible' || isVoiceRoute()) {
        stopRecognition();
        return;
      }
      if (recognitionRef.current) return;

      shouldRunRef.current = true;
      const recognition = new SpeechRecognition();
      recognition.lang = 'de-DE';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
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

          // Kein direkter Navigationsbefehl: an den Buddy übergeben. `question`
          // befüllt die Eingabe; `wake=1` markiert die Herkunft für die Buddy-UI.
          const params = new URLSearchParams({ mode: 'text', wake: '1' });
          if (command) params.set('question', command);
          else params.set('listen', '1');
          navigate(`/KiBuddyBeta?${params.toString()}`);
          return;
        }
      };

      recognition.onerror = (event) => {
        // Bei verweigerter Berechtigung oder nicht unterstütztem Dienst nicht in
        // eine Restart-Schleife geraten. Andere kurzzeitige Fehler dürfen beim
        // nächsten onend erneut versuchen.
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          shouldRunRef.current = false;
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (!shouldRunRef.current || restartingRef.current) return;
        if (document.visibilityState !== 'visible' || isVoiceRoute()) return;
        restartingRef.current = true;
        window.setTimeout(() => {
          restartingRef.current = false;
          startRecognition();
        }, 350);
      };

      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
      }
    };

    const handlePrefsChanged = (event) => {
      prefsRef.current = event.detail || readPrivacyPrefs();
      stopRecognition();
      if (prefsRef.current.wakeWord) startRecognition();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        prefsRef.current = readPrivacyPrefs();
        startRecognition();
      } else {
        stopRecognition();
      }
    };

    window.addEventListener('privacy-prefs-changed', handlePrefsChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    startRecognition();

    return () => {
      window.removeEventListener('privacy-prefs-changed', handlePrefsChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopRecognition();
    };
  }, [navigate, location.pathname]);

  return null;
}
