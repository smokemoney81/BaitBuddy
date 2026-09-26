// Schnelle Geräte-Stimme (Web Speech API, speechSynthesis) für Free/Basic/Pro.
//
// Die natürliche Premium-Stimme (/api/ai/tts) gibt es ab Ultimate. Die kleinen
// Pläne sprechen über die Stimme des Geräts: kein Netz-Roundtrip, kein
// KI-Volumen, sofort hörbar. Aufgerufen wird dieses Modul ausschließlich über
// src/components/utils/elevenLabsTTS.js, damit Abbruch (Generation-Token) und
// Plan-Auswahl an einer Stelle bleiben.

const PREFERRED_LANG = 'de-DE';

export function isBrowserTTSAvailable() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
}

let cachedVoice = null;

// Deutsche Stimme wählen; lokale (offline nutzbare) Stimmen bevorzugt.
function pickGermanVoice() {
  if (cachedVoice) return cachedVoice;
  let voices = [];
  try { voices = window.speechSynthesis.getVoices() || []; } catch { voices = []; }
  const german = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('de'));
  cachedVoice = german.find((v) => v.localService && v.lang === PREFERRED_LANG)
    || german.find((v) => v.lang === PREFERRED_LANG)
    || german[0]
    || null;
  return cachedVoice;
}

if (isBrowserTTSAvailable()) {
  try {
    // Stimmen laden in Chrome/WebView asynchron nach.
    window.speechSynthesis.addEventListener?.('voiceschanged', () => { cachedVoice = null; });
  } catch { /* ignore */ }
}

export function cancelBrowserTTS() {
  if (!isBrowserTTSAvailable()) return;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

/**
 * Spricht den Text mit der Gerätestimme. Liefert ein Handle mit derselben
 * Form wie ein HTMLAudioElement, soweit die Aufrufer es nutzen
 * (onended/onerror/pause), damit bestehende Wrapper unverändert bleiben.
 *
 * @param {string} text
 * @param {{ rate?: number }} [options]
 */
export function speakBrowser(text, options = {}) {
  if (!isBrowserTTSAvailable()) throw new Error('Geräte-Sprachausgabe nicht verfügbar');
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = PREFERRED_LANG;
  const voice = pickGermanVoice();
  if (voice) utterance.voice = voice;
  const rate = Number(options.rate);
  if (Number.isFinite(rate) && rate >= 0.5 && rate <= 2.0) utterance.rate = rate;

  let finished = false;
  const handle = {
    onended: null,
    onerror: null,
    pause() { cancelBrowserTTS(); },
  };
  const finish = (kind, event) => {
    if (finished) return;
    finished = true;
    const fn = kind === 'end' ? handle.onended : handle.onerror;
    fn?.call(handle, event);
  };
  utterance.onend = (e) => finish('end', e);
  // cancel() meldet in Chrome einen "interrupted"/"canceled"-Fehler — das ist
  // ein gewolltes Ende, kein Fehler.
  utterance.onerror = (e) => finish(e?.error === 'interrupted' || e?.error === 'canceled' ? 'end' : 'error', e);

  window.speechSynthesis.speak(utterance);
  return handle;
}
