// Schnelle Geräte-Stimme (Web Speech API, speechSynthesis) für Free/Basic/Pro.
//
// Die natürliche Premium-Stimme (/api/ai/tts) gibt es ab Ultimate. Die kleinen
// Pläne sprechen über die Stimme des Geräts: kein Netz-Roundtrip, kein
// KI-Volumen, sofort hörbar. Aufgerufen wird dieses Modul ausschließlich über
// src/components/utils/elevenLabsTTS.js, damit Abbruch (Generation-Token) und
// Plan-Auswahl an einer Stelle bleiben.

const PREFERRED_LANG = 'de-DE';

// Namens-Hinweise auf eine weibliche Stimme — die Web-Speech-API hat kein
// verlässliches `voice.gender`-Feld über alle Plattformen hinweg, deshalb
// heuristisch über bekannte Stimmennamen (Android/Chrome, iOS/Safari,
// Windows/Edge). "google deutsch" ist auf Android/Chrome die weibliche
// Standardstimme.
const FEMALE_NAME_HINTS = [
  'female', 'weiblich', 'google deutsch',
  'anna', 'petra', 'katja', 'helena', 'martha', 'monika', 'sandy', 'susanne', 'vicki', 'marlene',
];

function isLikelyFemaleVoice(voice) {
  const name = (voice?.name || '').toLowerCase();
  return FEMALE_NAME_HINTS.some((hint) => name.includes(hint));
}

export function isBrowserTTSAvailable() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance === 'function';
}

// Einmal pro Session aufgelöst und danach fest gepinnt (Punkt 3: "kein
// Wechsel innerhalb einer Session"). Absichtlich KEIN `voiceschanged`-Reset
// mehr, nachdem einmal echt aufgelöst wurde — vorher konnte ein späteres
// voiceschanged-Event (oder dessen Ausbleiben in manchen WebViews) die
// gepinnte Stimme wieder verwerfen bzw. dauerhaft auf einer zu früh (vor
// vollständig geladener Stimmenliste) getroffenen Fehlwahl festnageln.
let cachedVoice = null;

// Deutsche, bevorzugt weibliche Stimme wählen; lokale (offline nutzbare)
// Stimmen bevorzugt. Liefert die Stimmenliste noch nichts (asynchrones Laden
// in Chrome/WebView), wird NICHTS gecacht — der nächste Aufruf versucht es
// erneut, statt eine leere/zufällige Erst-Auswahl für die Session festzuschreiben.
function pickGermanVoice() {
  if (cachedVoice) return cachedVoice;
  let voices = [];
  try { voices = window.speechSynthesis.getVoices() || []; } catch { voices = []; }
  const german = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('de'));
  if (german.length === 0) return null;

  cachedVoice = german.find((v) => v.localService && v.lang === PREFERRED_LANG && isLikelyFemaleVoice(v))
    || german.find((v) => isLikelyFemaleVoice(v))
    || german.find((v) => v.localService && v.lang === PREFERRED_LANG)
    || german.find((v) => v.lang === PREFERRED_LANG)
    || german[0];
  return cachedVoice;
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
