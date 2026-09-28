// src/components/utils/elevenLabsTTS.js
// Zentrale ElevenLabs Text-to-Speech Utility.
// Das Backend (/api/ai/tts) liefert JSON { audioBase64, contentType }.
// Diese Helfer dekodieren das Base64-Audio und spielen es ab.
//
// Zwei Stimmen-Stufen nach Plan (getVoiceTier, gesetzt vom PlanProvider):
// - 'premium' (ab Ultimate): natürliche Server-Stimme über /api/ai/tts.
// - 'browser' (Free/Basic/Pro): schnelle Gerätestimme (src/lib/browserTTS.js),
//   ohne Netz und ohne KI-Volumen.
// Lehnt der Server die Premium-Stimme ab (403 premium_voice_required), wechselt
// der Client auf die Gerätestimme. Schlägt die Premium-Stimme sonst fehl
// (offline, kein Provider), springt ebenfalls die Gerätestimme ein, damit der
// Buddy überall hörbar bleibt.

import { functions } from "@/api/frontendClient";
import { getActiveBuddyAudio, getVoiceTier, setVoiceTier } from "@/lib/ttsVoice";
import { speakBrowser, cancelBrowserTTS, isBrowserTTSAvailable } from "@/lib/browserTTS";
import { setVoiceSpeaking, isVoiceMuted, subscribeVoiceMuted } from "@/lib/voiceActivity";
import { setBuddyActivity } from "@/lib/buddyActivity";

// Lautlos mitten im Satz: laufende Ausgabe sofort beenden.
subscribeVoiceMuted((muted) => { if (muted) cancelElevenLabs(); });

function isPremiumVoiceDenied(err) {
  return err?.status === 403 || err?.data?.code === 'premium_voice_required' || err?.code === 'premium_voice_required';
}

// Premium-Audio holen; bei Plan-Ablehnung dauerhaft auf die Gerätestimme gehen.
// `preferredProvider` pinnt den Cloud-TTS-Provider (OpenAI/ElevenLabs/Google/
// Gemini) innerhalb einer Antwort auf den, der den ersten Satz geliefert hat —
// verhindert einen Stimmwechsel mitten in einer mehrsätzigen Antwort, wenn ein
// späterer Satz sonst bei einem anderen Provider (= andere Stimme) landen würde.
async function fetchPremiumAudio(text, preferredProvider) {
  try {
    return await functions.invoke("textToSpeech", { text, preferred_provider: preferredProvider || undefined });
  } catch (err) {
    if (isPremiumVoiceDenied(err)) setVoiceTier('browser');
    throw err;
  }
}

function prefersBrowserVoice() {
  return getVoiceTier() !== 'premium' && isBrowserTTSAvailable();
}

// Modul-globaler Singleton: Es spielt bewusst immer nur EINE Stimme gleichzeitig.
// Konsequenz: Gleichzeitiges TTS aus dem KI-Buddy (KiBuddyBeta) und dem schwebenden Widget
// teilt sich diese eine Wiedergabe – ein neuer speak-Aufruf bricht den vorherigen ab
// (cancelElevenLabs). Das ist gewolltes Verhalten und kein Bug bei paralleler Nutzung.
let currentAudio = null;
let currentUrl = null;

// Generation-Token gegen überlappende Aufrufe: Startet während des laufenden
// TTS-Requests ein neuer speak-/cancel-Aufruf, würde die ältere Antwort nach
// ihrem await trotzdem abgespielt und zwei Stimmen sprächen gleichzeitig.
// Jeder Aufruf merkt sich seine Generation; nur die neueste darf abspielen.
let generation = 0;

/**
 * Bricht eine laufende ElevenLabs-Wiedergabe ab — auch eine, deren
 * TTS-Request gerade noch läuft (via Generation-Token).
 */
export function cancelElevenLabs() {
  generation += 1;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = "";
    } catch { /* ignore */ }
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  cancelBrowserTTS();
  setVoiceSpeaking(false);
  setBuddyActivity('idle');
}

// Spricht über die Gerätestimme im Modul-Singleton (für cancelElevenLabs).
function speakBrowserTracked(text, callbacks, rate) {
  const handle = speakBrowser(text, { rate });
  currentAudio = handle;
  setVoiceSpeaking(true);
  setBuddyActivity('speaking');
  handle.onended = () => {
    if (currentAudio === handle) currentAudio = null;
    setVoiceSpeaking(false);
    setBuddyActivity('idle');
    callbacks.onEnd?.();
  };
  handle.onerror = (e) => {
    if (currentAudio === handle) currentAudio = null;
    setVoiceSpeaking(false);
    setBuddyActivity('idle');
    callbacks.onError?.(e);
  };
  return handle;
}

// Dekodiert Base64-Audio in einen Blob (zentral, damit Einzel-Aufruf und
// Satz-Queue dieselbe Logik teilen).
function base64ToBlob(audioBase64, contentType) {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType || "audio/mpeg" });
}

/**
 * Holt ElevenLabs-Audio fürs übergebene Text und spielt es ab.
 * Wirft einen Fehler, wenn kein Audio geliefert wird (z. B. API-Key fehlt 501)
 * oder die Wiedergabe blockiert ist (Autoplay-Policy).
 *
 * @param {string} text
 * @param {{ onEnd?: () => void, onError?: (e:any) => void }} [callbacks]
 * @param {{ rate?: number }} [options] rate = Wiedergabegeschwindigkeit (0.5–2.0)
 * @returns {Promise<HTMLAudioElement|null>} null, wenn der Aufruf während des
 *   Requests von einem neueren speak-/cancel-Aufruf abgelöst wurde (dann wird
 *   nichts abgespielt und keiner der Callbacks feuert).
 */
export async function speakWithElevenLabs(text, callbacks = {}, options = {}) {
  if (!getActiveBuddyAudio().voiceEnabled || isVoiceMuted()) return null;
  options = { ...options, rate: (options.rate || 1) * getActiveBuddyAudio().speed };
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Kein Text für TTS");
  }

  cancelElevenLabs();
  const myGeneration = generation;

  if (prefersBrowserVoice()) return speakBrowserTracked(text, callbacks, options.rate);

  // Die in den Einstellungen gewählte Stimme mitsenden; das Backend prüft den
  // Plan (Premium-Stimme nur ab Ultimate).
  let response;
  try {
    response = await fetchPremiumAudio(text);
  } catch (err) {
    if (myGeneration !== generation) return null;
    if (isBrowserTTSAvailable()) return speakBrowserTracked(text, callbacks, options.rate);
    throw err;
  }

  // Während des Requests hat ein neuerer speak-/cancel-Aufruf übernommen:
  // dieses Audio verwerfen statt es parallel zur neuen Stimme abzuspielen.
  if (myGeneration !== generation) return null;

  // frontendClient liefert das geparste JSON direkt (kein axios-Wrapper).
  // Unterstütze zur Sicherheit auch ein response.data-Nesting.
  const payload = response?.audioBase64 ? response : response?.data;
  const audioBase64 = payload?.audioBase64;

  if (!audioBase64) {
    throw new Error("ElevenLabs lieferte kein Audio");
  }

  // Base64 Blob
  const blob = base64ToBlob(audioBase64, payload.contentType);

  const url = URL.createObjectURL(blob);
  currentUrl = url;

  const audio = new Audio(url);
  currentAudio = audio;

  // Die in den Audio-Einstellungen gewählte Sprechgeschwindigkeit gilt auch
  // für die ElevenLabs-Wiedergabe.
  const rate = Number(options.rate);
  if (Number.isFinite(rate) && rate >= 0.5 && rate <= 2.0 && rate !== 1.0) {
    audio.playbackRate = rate;
  }

  audio.onended = () => {
    setVoiceSpeaking(false);
    setBuddyActivity('idle');
    if (currentUrl === url) {
      URL.revokeObjectURL(url);
      currentUrl = null;
    }
    if (currentAudio === audio) currentAudio = null;
    callbacks.onEnd?.();
  };

  audio.onerror = (e) => {
    setVoiceSpeaking(false);
    setBuddyActivity('idle');
    if (currentUrl === url) {
      URL.revokeObjectURL(url);
      currentUrl = null;
    }
    if (currentAudio === audio) currentAudio = null;
    callbacks.onError?.(e);
  };

  try {
    await audio.play();
    if (currentAudio === audio) { setVoiceSpeaking(true); setBuddyActivity('speaking'); }
  } catch (err) {
    // Wiedergabe blockiert (z. B. Autoplay-Policy): Blob-URL sofort freigeben,
    // damit kein Leak entsteht, und den Fehler an den Aufrufer durchreichen.
    if (currentUrl === url) {
      URL.revokeObjectURL(url);
      currentUrl = null;
    }
    if (currentAudio === audio) currentAudio = null;
    throw err;
  }
  return audio;
}

/**
 * Zentrale Sprech-Funktion der App: Spielt den Text mit der natürlichen
 * ElevenLabs-Stimme ab und löst auf, wenn die Wiedergabe beendet ist.
 * Es gibt bewusst KEINEN Browser-TTS-Fallback — schlägt die Ausgabe fehl,
 * löst das Promise still auf, damit Aufrufer (Status-Reset, Gesprächs-Loops)
 * normal weiterlaufen. Respektiert das voiceEnabled-Setting.
 *
 * @param {string} text
 * @param {{ voiceEnabled?: boolean, rate?: number }} [options]
 */
export async function speakWithFallback(text, options = {}) {
  const { voiceEnabled = true, rate = 1.0 } = options;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return;
  }

  if (!voiceEnabled) {
    return;
  }

  let audio;
  try {
    audio = await speakWithElevenLabs(text, {}, { rate });
  } catch (err) {
    console.warn('[TTS] Sprachausgabe nicht verfügbar, Ausgabe bleibt still:', err?.message);
    return;
  }

  // Von einem neueren speak-Aufruf abgelöst — der steuert die Wiedergabe.
  if (!audio) return;

  await new Promise((resolve) => {
    // speakWithElevenLabs setzt bereits onended/onerror-Handler, die die
    // Blob-URL via URL.revokeObjectURL freigeben. Diese Handler NICHT
    // überschreiben (sonst Memory-Leak) – stattdessen wrappen: Original-
    // Cleanup zuerst ausführen, dann das Promise auflösen.
    const originalOnEnded = audio.onended;
    const originalOnError = audio.onerror;
    audio.onended = (e) => {
      originalOnEnded?.call(audio, e);
      resolve();
    };
    audio.onerror = (e) => {
      originalOnError?.call(audio, e);
      resolve();
    };
  });
}

// ── Satzweise Streaming-Wiedergabe (Time-to-first-Audio senken) ──────────────
//
// Statt die komplette Antwort als EINEN TTS-Blob zu synthetisieren und erst
// danach abzuspielen, zerlegt die Queue den (ggf. gestreamten) Text in Sätze:
// Der erste Satz spricht sofort, während die nächsten schon im Hintergrund
// synthetisiert werden (Pipelining). Das macht die Sprachausgabe spürbar „live".

const SENTENCE_TERMINATORS = '.!?…';
// Schließende Anführungszeichen/Klammern, die noch zum Satz gehören.
const SENTENCE_TRAILING = '"\')]}“’';
// Mindestlänge eines Satz-Chunks: verhindert zerhackte Ein-Wort-Fetzen
// (z. B. „Ja." als eigener TTS-Call) — kurze Sätze werden mit dem nächsten
// zusammengefasst.
const MIN_SENTENCE_LENGTH = 25;

/**
 * Zerlegt Text an Satzgrenzen (Satzzeichen gefolgt von Whitespace/Ende sowie
 * Zeilenumbrüchen). Zu kurze Fragmente werden mit dem Folgesatz verschmolzen.
 * Nicht als Abkürzungen/Dezimalzahlen splitten (Satzzeichen ohne folgendes
 * Whitespace, z. B. „z.B." oder „3.5", ist keine Grenze).
 *
 * @param {string} text
 * @param {{ flush?: boolean, minLength?: number }} [opts]
 *   flush=true → der verbleibende Rest wird als letzter Satz zurückgegeben.
 * @returns {{ sentences: string[], rest: string }}
 */
export function splitIntoSentences(text, opts = {}) {
  const { flush = false, minLength = MIN_SENTENCE_LENGTH } = opts;
  const sentences = [];
  const n = text.length;
  let start = 0;
  let i = 0;

  const isSpace = (c) => c === undefined || /\s/.test(c);
  const pushChunk = (endExclusive) => {
    const chunk = text.slice(start, endExclusive).trim();
    if (chunk) sentences.push(chunk);
    start = endExclusive;
    // Führende Whitespaces des nächsten Satzes überspringen.
    while (start < n && /\s/.test(text[start])) start++;
    i = start;
  };

  while (i < n) {
    const ch = text[i];

    if (SENTENCE_TERMINATORS.includes(ch)) {
      // Aufeinanderfolgende Satzzeichen + schließende Zeichen konsumieren.
      let j = i + 1;
      while (j < n && (SENTENCE_TERMINATORS.includes(text[j]) || SENTENCE_TRAILING.includes(text[j]))) j++;
      // Grenze nur, wenn danach Whitespace/Ende folgt (sonst Abkürzung/Zahl).
      if (isSpace(text[j]) && text.slice(start, j).trim().length >= minLength) {
        pushChunk(j);
        continue;
      }
      i = j;
      continue;
    }

    if (ch === '\n') {
      if (text.slice(start, i).trim().length >= minLength) {
        pushChunk(i);
        continue;
      }
    }
    i++;
  }

  let rest = text.slice(start);
  if (flush) {
    const trimmed = rest.trim();
    if (trimmed) sentences.push(trimmed);
    rest = '';
  }
  return { sentences, rest };
}

// Holt das Audio für einen einzelnen Satz und liefert einen Blob (oder null,
// wenn die Queue zwischenzeitlich abgelöst/abgebrochen wurde bzw. kein Audio
// kam). Wirft bei Netzwerkfehlern — die Queue überspringt den Satz dann still.
//
// @param {boolean} useBrowserVoice Einmal pro Antwort/Queue entschieden
//   (siehe createSpeechQueue) statt hier live neu abgefragt — verhindert einen
//   Stimmwechsel mitten in der Antwort, falls sich der Plan-Tier während der
//   Wiedergabe ändert (z.B. Kauf-Webhook kommt mitten im Vorlesen an).
// @param {string|null} preferredProvider Vom ersten erfolgreichen Satz dieser
//   Antwort gepinnter Cloud-Provider (siehe fetchPremiumAudio).
// @param {(provider: string) => void} [onProvider] Meldet den vom Server
//   tatsächlich genutzten Provider zurück, damit die Queue ihn für die
//   restlichen Sätze pinnen kann.
async function fetchSentenceBlob(text, myGeneration, useBrowserVoice, preferredProvider, onProvider) {
  if (!getActiveBuddyAudio().voiceEnabled || isVoiceMuted()) return null;
  // Gerätestimme: nichts vorzuladen, der Satz wird direkt gesprochen.
  if (useBrowserVoice) return { browserText: text };
  let response;
  try {
    response = await fetchPremiumAudio(text, preferredProvider);
  } catch (err) {
    if (isBrowserTTSAvailable()) return { browserText: text };
    throw err;
  }
  if (myGeneration !== generation) return null;
  const payload = response?.audioBase64 ? response : response?.data;
  const audioBase64 = payload?.audioBase64;
  if (!audioBase64) return null;
  if (payload.provider) onProvider?.(payload.provider);
  return base64ToBlob(audioBase64, payload.contentType);
}

// Spielt einen Blob über den Modul-Singleton ab (damit cancelElevenLabs auch
// die Queue-Wiedergabe stoppt) und löst auf, wenn die Wiedergabe endet.
function playSentenceBlob(blob, myGeneration, rate) {
  return new Promise((resolve) => {
    if (myGeneration !== generation) return resolve();
    if (blob.browserText) {
      try {
        speakBrowserTracked(blob.browserText, { onEnd: resolve, onError: resolve }, rate);
      } catch { resolve(); }
      return;
    }
    const url = URL.createObjectURL(blob);
    currentUrl = url;
    const audio = new Audio(url);
    currentAudio = audio;

    if (Number.isFinite(rate) && rate >= 0.5 && rate <= 2.0 && rate !== 1.0) {
      audio.playbackRate = rate;
    }

    const cleanup = () => {
      setVoiceSpeaking(false);
      setBuddyActivity('idle');
      if (currentUrl === url) {
        URL.revokeObjectURL(url);
        currentUrl = null;
      }
      if (currentAudio === audio) currentAudio = null;
    };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); resolve(); };
    audio.play().then(() => { if (currentAudio === audio) { setVoiceSpeaking(true); setBuddyActivity('speaking'); } }, () => { cleanup(); resolve(); });
  });
}

/**
 * Erzeugt eine Sprech-Queue für satzweise, pipelined Wiedergabe.
 *
 * Nutzung (Streaming): für jedes Text-Delta `push(delta)`, am Ende `flush()`.
 * Nutzung (Ganztext): `push(fullText)` gefolgt von `flush()`.
 * Ein neuer speak-/cancel-Aufruf (Generation-Token) oder `cancel()` bricht
 * die Queue sofort ab.
 *
 * @param {{ rate?: number, onDrain?: () => void }} [options]
 * @returns {{ push: (chunk: string) => void, flush: () => void, cancel: () => void }}
 */
export function createSpeechQueue(options = {}) {
  const { onDrain } = options;
  const rate = (options.rate || 1) * getActiveBuddyAudio().speed;

  // Wie speakWithElevenLabs: laufende Wiedergabe abbrechen und eigene
  // Generation beanspruchen. Ein späterer speak-/cancel-/Queue-Aufruf bumpt
  // generation weiter und deaktiviert diese Queue.
  cancelElevenLabs();
  const myGeneration = generation;

  // Einmal pro Antwort/Queue entschieden — nicht pro Satz neu abgefragt (siehe
  // fetchSentenceBlob-Doku oben). Das ist der Kern-Fix gegen Stimmwechsel
  // mitten in einer Antwort: vorher rief jeder Satz prefersBrowserVoice() frisch
  // auf, wodurch ein Plan-/Tier-Wechsel während der Wiedergabe die Stimme
  // zwischen Satz 1 und Satz 2 kippen konnte.
  const useBrowserVoice = prefersBrowserVoice();
  // Sobald der erste Premium-Satz einen Provider liefert, gilt dieser für den
  // Rest der Antwort verbindlich (kein Provider-Wechsel pro Satz).
  let pinnedProvider = null;
  const pinProvider = (provider) => { if (!pinnedProvider) pinnedProvider = provider; };

  let textBuffer = "";
  const queue = [];          // fertige Sätze in Reihenfolge
  let headBlobPromise = null; // Prefetch für queue[0] (Tiefe 1 → keine Lücken)
  let running = false;
  let closed = false;
  let drained = false;

  const isActive = () => myGeneration === generation;

  function ensureHeadPrefetch() {
    if (!headBlobPromise && queue.length > 0 && isActive()) {
      // Fehler abfangen, damit ein Reject nicht als Unhandled Rejection endet;
      // die Wiedergabeschleife wertet das Ergebnis (null) aus.
      headBlobPromise = fetchSentenceBlob(queue[0], myGeneration, useBrowserVoice, pinnedProvider, pinProvider).catch(() => null);
    }
  }

  function maybeDrain() {
    if (isActive() && closed && !running && queue.length === 0 && textBuffer === "" && !drained) {
      drained = true;
      onDrain?.();
    }
  }

  async function runLoop() {
    if (running) return;
    running = true;
    try {
      while (isActive() && queue.length > 0) {
        ensureHeadPrefetch();
        const blobPromise = headBlobPromise;
        headBlobPromise = null;
        queue.shift();
        // Nächsten Satz schon anfordern, während der aktuelle spielt.
        ensureHeadPrefetch();

        const blob = await blobPromise;
        if (!isActive()) return;
        if (blob) {
          await playSentenceBlob(blob, myGeneration, rate);
          if (!isActive()) return;
        }
      }
    } finally {
      running = false;
      maybeDrain();
    }
  }

  function enqueueComplete(force) {
    const { sentences, rest } = splitIntoSentences(textBuffer, { flush: force });
    textBuffer = rest;
    for (const s of sentences) queue.push(s);
  }

  return {
    push(chunk) {
      if (closed || !isActive() || !chunk) return;
      textBuffer += chunk;
      enqueueComplete(false);
      runLoop();
    },
    flush() {
      if (closed || !isActive()) return;
      closed = true;
      enqueueComplete(true);
      if (running) return; // laufende Schleife ruft am Ende maybeDrain()
      runLoop().then(maybeDrain);
      maybeDrain(); // Fall: nichts zu sprechen → sofort drainen
    },
    cancel() {
      cancelElevenLabs();
    },
  };
}
