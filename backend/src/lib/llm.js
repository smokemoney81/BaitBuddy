// LLM-Anbindung des Backends – kein SDK nötig, alle Anbieter per nativem fetch.
//
// Anbieter-Reihenfolge (der erste mit gesetztem Schlüssel antwortet, die
// übrigen springen nur bei einem Fehler ein):
//   Text/Chat:     OpenAI (ChatGPT) → Anthropic (Claude)
//   Bildanalyse:   Google Gemini → OpenAI (ChatGPT) → Anthropic (Claude)
//
// Die Aufrufer (routes/ai.js) kennen nur invokeLLM/invokeLLMStream; welcher
// Anbieter antwortet, entscheidet allein diese Datei.
import { fetchWithTimeout } from './fetchWithTimeout.js';
import { getAnthropicKey, getOpenAIKey, getGeminiKey } from './aiKeys.js';

export { getAnthropicKey, getOpenAIKey, getGeminiKey };

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// LLM-Antworten können langsamer sein als andere Upstreams; großzügigeres
// Timeout, aber immer noch unter dem Vercel-Funktionslimit.
const LLM_TIMEOUT_MS = 30000;

// 2048: Schritt-für-Schritt-Anleitungen des KI-Buddys (Montage, Köderführung)
// brauchen Platz und dürfen nicht mitten im Schritt enden.
const MAX_TOKENS = 2048;

// Schnelle Standardmodelle (Latenz-Ziel des KI-Buddys < 2 Sek., CLAUDE.md),
// jeweils per Env umschaltbar.
const MODELS = {
  openai: () => process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  gemini: () => process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  anthropic: () => process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
};

// Transiente Upstream-Fehler (Rate-Limit, Overload, Gateway-/Server-Fehler)
// kurz erneut versuchen, statt sie sofort als 5xx durchzureichen. MAX_LLM_RETRIES
// sind ZUSÄTZLICHE Versuche. 529 = Anthropic "overloaded_error".
const MAX_LLM_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

// Ein aufgebrauchtes Guthaben/Kontingent kommt teils als 429 zurück
// (OpenAI "insufficient_quota") — das ändert sich durch Warten nicht.
const QUOTA_PATTERN = /insufficient_quota|exceeded your current quota|credit balance|billing/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponentielles Backoff (500ms, 1000ms). In Tests ohne echte Wartezeit, damit
// die Retry-Tests nicht künstlich verlangsamt werden.
function backoffDelay(attempt) {
  if (process.env.NODE_ENV === 'test') return 0;
  return 500 * 2 ** attempt;
}

// ── Bilddaten ───────────────────────────────────────────────────────────────

// Erkennt den Bild-Typ anhand der Magic-Bytes im Base64-Header — nötig, weil
// die Vision-Routen HTTP-Bilder als ROHES Base64 (ohne data-URL-Präfix)
// übergeben und alle Anbieter einen MIME-Typ verlangen, der zu den
// tatsächlichen Bytes passt (falscher Typ → 400). Nur die ersten Bytes prüfen.
function sniffMediaType(base64) {
  if (/^\/9j\//.test(base64)) return 'image/jpeg';        // FF D8 FF
  if (/^iVBORw0KGgo/.test(base64)) return 'image/png';    // 89 50 4E 47
  if (/^R0lGOD/.test(base64)) return 'image/gif';         // GIF8
  if (/^UklGR/.test(base64)) return 'image/webp';         // RIFF...WEBP
  return 'image/jpeg'; // Kamera-Fotos sind ganz überwiegend JPEG
}

// Zerlegt imageBase64 (roher Base64-String ODER data-URL) in { media_type, data }.
function parseImageBase64(imageBase64) {
  const match = /^data:(image\/[a-z+.-]+);base64,(.*)$/is.exec(imageBase64);
  if (match) return { media_type: match[1], data: match[2] };
  return { media_type: sniffMediaType(imageBase64), data: imageBase64 };
}

// ── HTTP-Hilfen ─────────────────────────────────────────────────────────────

// Einheitliche, klassifizierbare Fehlermeldung (siehe llmErrors.js).
function upstreamError(label, status, body, keyEnv) {
  let message;
  if (status === 401 || status === 403) {
    message = `${label}-Auth-Fehler ${status}: Ungültiger oder fehlender API-Key. Bitte ${keyEnv} überprüfen.`;
    console.error('[LLM]', message);
  } else if (status === 429 && !QUOTA_PATTERN.test(body)) {
    message = `${label} Rate-Limit (429): Zu viele Anfragen. Versuch später erneut.`;
  } else {
    message = `${label} API Fehler ${status}: ${body.slice(0, 300)}`;
  }
  const err = /** @type {Error & { status?: number }} */ (new Error(message));
  err.status = status;
  return err;
}

// POST mit Timeout und begrenzten Wiederholungen bei transienten Fehlern.
// Liefert das geparste JSON der Antwort.
async function postJsonWithRetry({ label, keyEnv, url, headers, body }) {
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(url, { method: 'POST', headers, body }, LLM_TIMEOUT_MS);
    } catch (e) {
      // Netzwerk-/Timeout-Fehler: begrenzt wiederholen.
      lastErr = e;
      if (attempt < MAX_LLM_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw e;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = upstreamError(label, res.status, text, keyEnv);
      // Nur transiente Status erneut versuchen; 4xx (außer 429) und ein
      // aufgebrauchtes Kontingent sofort werfen.
      if (RETRYABLE_STATUS.has(res.status) && !QUOTA_PATTERN.test(text) && attempt < MAX_LLM_RETRIES) {
        lastErr = err;
        console.warn(`[LLM] ${label}: Versuch ${attempt + 1}/${MAX_LLM_RETRIES} nach ${res.status}...`);
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw err;
    }
    return res.json();
  }
  // Retries erschöpft (nur erreichbar, wenn der letzte Versuch transient war).
  throw lastErr || new Error(`${label} API Fehler: unbekannt`);
}

// Liest einen SSE-Body zeilenweise und ruft onData(payload) je "data:"-Zeile.
// Zeilen können über Chunk-Grenzen zerrissen sein → Puffer bis zum "\n".
async function readSSE(body, onData) {
  const decoder = new TextDecoder();
  let buffer = '';
  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (payload) onData(payload);
  };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nlIndex;
    while ((nlIndex = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, nlIndex));
      buffer = buffer.slice(nlIndex + 1);
    }
  }
  if (buffer.trim()) handleLine(buffer);
}

function parseJson(payload) {
  try { return JSON.parse(payload); } catch { return null; }
}

// Hartes Timeout plus externes Abbruch-Signal (Client-Disconnect).
function streamSignal(signal) {
  const timeout = AbortSignal.timeout(LLM_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

// ── OpenAI (ChatGPT) ────────────────────────────────────────────────────────

function openAIHeaders(apiKey) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

function openAIMessages(prompt, imageBase64) {
  if (!imageBase64) return [{ role: 'user', content: prompt }];
  const { media_type, data } = parseImageBase64(imageBase64);
  return [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${media_type};base64,${data}` } },
    ],
  }];
}

async function callOpenAI({ prompt, imageBase64, apiKey }) {
  const data = await postJsonWithRetry({
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    url: OPENAI_URL,
    headers: openAIHeaders(apiKey),
    body: JSON.stringify({
      model: MODELS.openai(),
      max_completion_tokens: MAX_TOKENS,
      messages: openAIMessages(prompt, imageBase64),
    }),
  });
  const message = data?.choices?.[0]?.message;
  if (message?.refusal) {
    throw new Error('OpenAI API hat die Anfrage abgelehnt (refusal).');
  }
  if (typeof message?.content !== 'string' || !message.content.length) {
    throw new Error('OpenAI API lieferte eine unerwartete Antwortstruktur (keine Nachricht).');
  }
  return message.content;
}

async function streamOpenAI({ prompt, onDelta, signal, apiKey }) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: openAIHeaders(apiKey),
    body: JSON.stringify({
      model: MODELS.openai(),
      max_completion_tokens: MAX_TOKENS,
      messages: openAIMessages(prompt, null),
      stream: true,
    }),
    signal: streamSignal(signal),
  });
  if (!res.ok) {
    throw upstreamError('OpenAI', res.status, await res.text().catch(() => ''), 'OPENAI_API_KEY');
  }
  if (!res.body) throw new Error('OpenAI API lieferte keinen Stream-Body.');

  let full = '';
  await readSSE(res.body, (payload) => {
    if (payload === '[DONE]') return;
    const json = parseJson(payload);
    if (!json) return;
    if (json.error) throw new Error(`OpenAI Stream-Fehler: ${json.error.message || 'unbekannt'}`);
    const delta = json.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length) {
      full += delta;
      onDelta?.(delta);
    }
  });
  return full;
}

// ── Google Gemini (Bildanalyse) ─────────────────────────────────────────────

async function callGemini({ prompt, imageBase64, apiKey }) {
  const model = MODELS.gemini();
  const parts = [];
  if (imageBase64) {
    const { media_type, data } = parseImageBase64(imageBase64);
    parts.push({ inline_data: { mime_type: media_type, data } });
  }
  parts.push({ text: prompt });

  const generationConfig = { maxOutputTokens: MAX_TOKENS };
  // 2.5-Flash "denkt" sonst vor jeder Antwort — kostet Sekunden und zählt
  // gegen maxOutputTokens. Für Bildbeschreibungen unnötig.
  if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const data = await postJsonWithRetry({
    label: 'Gemini',
    keyEnv: 'GEMINI_API_KEY',
    url: `${GEMINI_BASE_URL}${encodeURIComponent(model)}:generateContent`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
  });

  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini API hat die Anfrage abgelehnt (${blockReason}).`);
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .filter((p) => typeof p?.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
  if (!text) {
    throw new Error('Gemini API lieferte eine unerwartete Antwortstruktur (keine Nachricht).');
  }
  return text;
}

// ── Anthropic (Claude) ──────────────────────────────────────────────────────

function anthropicHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

async function callAnthropic({ prompt, imageBase64, apiKey }) {
  let content = prompt;
  if (imageBase64) {
    const { media_type, data } = parseImageBase64(imageBase64);
    content = [
      { type: 'image', source: { type: 'base64', media_type, data } },
      { type: 'text', text: prompt },
    ];
  }
  const data = await postJsonWithRetry({
    label: 'Claude',
    keyEnv: 'ANTHROPIC_API_KEY',
    url: ANTHROPIC_URL,
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: MODELS.anthropic(),
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content }],
    }),
  });
  // Sicherheits-Refusal der API: als klarer Fehler statt leerer Antwort.
  if (data?.stop_reason === 'refusal') {
    throw new Error('Claude API hat die Anfrage abgelehnt (refusal).');
  }
  const text = Array.isArray(data?.content)
    ? data.content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('')
    : '';
  if (!text) {
    throw new Error('Claude API lieferte eine unerwartete Antwortstruktur (keine Nachricht).');
  }
  return text;
}

async function streamAnthropic({ prompt, onDelta, signal, apiKey }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: MODELS.anthropic(),
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal: streamSignal(signal),
  });
  if (!res.ok) {
    throw upstreamError('Claude', res.status, await res.text().catch(() => ''), 'ANTHROPIC_API_KEY');
  }
  if (!res.body) throw new Error('Claude API lieferte keinen Stream-Body.');

  let full = '';
  await readSSE(res.body, (payload) => {
    const json = parseJson(payload);
    if (!json) return;
    if (json.type === 'error') throw new Error(`Claude Stream-Fehler: ${json.error?.message || 'unbekannt'}`);
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      const delta = json.delta.text;
      if (typeof delta === 'string' && delta.length) {
        full += delta;
        onDelta?.(delta);
      }
    }
  });
  return full;
}

// ── Anbieter-Auswahl ────────────────────────────────────────────────────────

const PROVIDERS = {
  openai: { label: 'OpenAI (ChatGPT)', getKey: getOpenAIKey, call: callOpenAI, stream: streamOpenAI },
  gemini: { label: 'Google Gemini', getKey: getGeminiKey, call: callGemini, stream: null },
  anthropic: { label: 'Anthropic (Claude)', getKey: getAnthropicKey, call: callAnthropic, stream: streamAnthropic },
};

const ORDER = {
  text: ['openai', 'anthropic'],
  vision: ['gemini', 'openai', 'anthropic'],
};

const NO_KEY_MESSAGE =
  'KI-Service nicht verfügbar – kein KI-Schlüssel gesetzt (OPENAI_API_KEY für Chat, GEMINI_API_KEY für Bildanalyse, ANTHROPIC_API_KEY als Reserve).';

/** Anbieter mit gesetztem Schlüssel, in Einsatz-Reihenfolge. */
function providerChain(kind) {
  return ORDER[kind]
    .map((id) => ({ id, ...PROVIDERS[id], apiKey: PROVIDERS[id].getKey() }))
    .filter((p) => p.apiKey);
}

/** Ist überhaupt ein Anbieter für Text/Chat konfiguriert? */
export function hasTextProvider() {
  return providerChain('text').length > 0;
}

/**
 * Welche Anbieter/Modelle gerade antworten würden — für Health-Checks.
 * Gibt nur Namen aus, nie Schlüssel.
 */
export function getLLMStatus() {
  const describe = (kind) => {
    const first = providerChain(kind)[0];
    return first ? { provider: first.label, model: MODELS[first.id]() } : null;
  };
  return { text: describe('text'), vision: describe('vision') };
}

// Ein Timeout oder Abbruch ist kein Grund, den nächsten Anbieter zu fragen:
// Der zweite Versuch würde das Funktionslimit sprengen bzw. niemand wartet mehr.
function allowsFallback(e) {
  const name = /** @type {any} */ (e)?.name;
  return name !== 'AbortError' && name !== 'TimeoutError' && name !== 'FetchTimeoutError';
}

function logFallback(from, e, to) {
  const msg = e && typeof (/** @type {any} */ (e).message) === 'string' ? /** @type {any} */ (e).message : String(e);
  console.warn(`[LLM] ${from.label} fehlgeschlagen, weiter mit ${to.label}:`, msg.slice(0, 300));
}

/**
 * Einmalige Antwort (Text oder Bild + Text).
 *
 * @param {{ prompt: string, imageBase64?: string | null }} params
 * @returns {Promise<string>}
 */
export async function invokeLLM({ prompt, imageBase64 = null }) {
  const chain = providerChain(imageBase64 ? 'vision' : 'text');
  if (!chain.length) throw new Error(NO_KEY_MESSAGE);

  // Der Fehler des bevorzugten Anbieters ist der aussagekräftige (er ist der,
  // den der Betreiber eingerichtet hat) — Reserve-Fehler landen nur im Log.
  let primaryError = null;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    try {
      return await provider.call({ prompt, imageBase64, apiKey: provider.apiKey });
    } catch (e) {
      primaryError ??= e;
      const next = chain[i + 1];
      if (!next || !allowsFallback(e)) break;
      logFallback(provider, e, next);
    }
  }
  throw primaryError;
}

/**
 * Wie invokeLLM, aber gestreamt (nur Text). Ruft `onDelta` je Text-Stück auf
 * und liefert am Ende den Volltext. Innerhalb eines Anbieters OHNE Retry — ein
 * begonnener Stream lässt sich nicht sauber wiederholen. Der nächste Anbieter
 * springt nur ein, solange noch kein Text beim Client angekommen ist.
 *
 * @param {{ prompt: string, onDelta?: (text: string) => void, signal?: AbortSignal }} params
 * @returns {Promise<string>} vollständiger Antworttext
 */
export async function invokeLLMStream({ prompt, onDelta, signal }) {
  const chain = providerChain('text').filter((p) => p.stream);
  if (!chain.length) throw new Error(NO_KEY_MESSAGE);

  let emitted = false;
  const forward = (delta) => { emitted = true; onDelta?.(delta); };

  let primaryError = null;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    try {
      return await provider.stream({ prompt, onDelta: forward, signal, apiKey: provider.apiKey });
    } catch (e) {
      primaryError ??= e;
      const next = chain[i + 1];
      if (!next || emitted || signal?.aborted || !allowsFallback(e)) break;
      logFallback(provider, e, next);
    }
  }
  throw primaryError;
}
