// Anthropic Claude API (Messages API) – kein SDK nötig, nutzt natives fetch.
import { fetchWithTimeout } from './fetchWithTimeout.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// LLM-Antworten können langsamer sein als andere Upstreams; großzügigeres
// Timeout, aber immer noch unter dem Vercel-Funktionslimit.
const LLM_TIMEOUT_MS = 30000;

// Ein Modell für Text UND Vision: Haiku 4.5 ist das schnellste/günstigste
// Claude-Modell und hält als einziges das Latenz-Ziel des KI-Buddys
// (< 2 Sek., siehe CLAUDE.md). Per Env auf ein größeres Modell umschaltbar
// (z. B. ANTHROPIC_MODEL=claude-opus-4-8).
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

// Obergrenze für die Antwortlänge, per Env überschreibbar (Kosten-/Missbrauchsschutz).
const MAX_TOKENS = () => {
  const n = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2048;
};

// Transiente Upstream-Fehler (Rate-Limit, Overload, Gateway-/Server-Fehler)
// einmal kurz erneut versuchen, statt sie sofort als 5xx durchzureichen —
// direkt relevant für die Zuverlässigkeit des KI-Buddys. MAX_LLM_RETRIES sind
// ZUSÄTZLICHE Versuche. 529 = Anthropic "overloaded_error".
const MAX_LLM_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponentielles Backoff (500ms, 1000ms). In Tests ohne echte Wartezeit, damit
// die Retry-Tests nicht künstlich verlangsamt werden.
function backoffDelay(attempt) {
  if (process.env.NODE_ENV === 'test') return 0;
  return 500 * 2 ** attempt;
}

// Entfernt Whitespace und versehentlich mitkopierte Anführungszeichen —
// häufiger Fehler beim Einfügen von Keys in Vercel-Umgebungsvariablen.
function cleanKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^["']|["']$/g, '').trim();
  return trimmed || null;
}

// Findet den Anthropic-Key tolerant: exakter Name zuerst, danach jede
// Env-Variable, deren Name mit anthropic/claude beginnt (auch nach "_") und
// key/token/secret enthält — z. B. CLAUDE_API_KEY oder VITE_ANTHROPIC_KEY.
// Namens-Varianten zählen nur, wenn der Wert wie ein echter Anthropic-Key
// aussieht (sk-ant-…) — das verhindert Fehltreffer durch Plattform-Variablen
// (z. B. Tokens von Hosting-Tools, die zufällig "claude" im Namen tragen).
// Hintergrund: In Vercel wurde der Key in der Vergangenheit unter abweichenden
// Namen angelegt, wodurch der KI-Chat trotz gesetztem Key ausfiel.
export function getAnthropicKey() {
  const direct = cleanKey(process.env.ANTHROPIC_API_KEY);
  if (direct) return direct;
  for (const [name, value] of Object.entries(process.env)) {
    if (!/(^|_)(anthropic|claude|cloude)/i.test(name)) continue;
    if (!/key|token|secret/i.test(name)) continue;
    const cleaned = cleanKey(value);
    if (cleaned && cleaned.startsWith('sk-ant-')) return cleaned;
  }
  return null;
}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

// Erkennt den Bild-Typ anhand der Magic-Bytes im Base64-Header — nötig, weil
// die Vision-Routen HTTP-Bilder als ROHES Base64 (ohne data-URL-Präfix)
// übergeben und die Anthropic Messages API einen media_type verlangt, der zu
// den tatsächlichen Bytes passt (falscher Typ → 400). Nur die ersten Bytes
// dekodieren, nicht das ganze Bild.
function sniffMediaType(base64) {
  if (/^\/9j\//.test(base64)) return 'image/jpeg';        // FF D8 FF
  if (/^iVBORw0KGgo/.test(base64)) return 'image/png';    // 89 50 4E 47
  if (/^R0lGOD/.test(base64)) return 'image/gif';         // GIF8
  if (/^UklGR/.test(base64)) return 'image/webp';         // RIFF...WEBP
  return 'image/jpeg'; // Kamera-Fotos sind ganz überwiegend JPEG
}

// Zerlegt imageBase64 (roher Base64-String ODER data-URL) in Anthropic-Format:
// { media_type, data } — die Messages API erwartet beides getrennt.
function parseImageBase64(imageBase64) {
  const match = /^data:(image\/[a-z+.-]+);base64,(.*)$/is.exec(imageBase64);
  if (match) return { media_type: match[1], data: match[2] };
  return { media_type: sniffMediaType(imageBase64), data: imageBase64 };
}

// Extrahiert den Text aus einer Messages-API-Antwort (content ist ein Array
// aus Blöcken; Text steht in Blöcken vom Typ "text").
function extractText(data) {
  if (!Array.isArray(data?.content)) return null;
  const text = data.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  return text.length ? text : null;
}

// `model` optional (Modellrouting, aiModelRouting.js); ohne Angabe gilt wie
// bisher ANTHROPIC_MODEL bzw. claude-haiku-4-5.
export async function invokeLLM({ prompt, imageBase64 = null, onUsage = null, model = null }) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw new Error('KI-Service nicht verfügbar – ANTHROPIC_API_KEY fehlt in den Server-Einstellungen.');
  }

  let content;
  if (imageBase64) {
    const { media_type, data } = parseImageBase64(imageBase64);
    content = [
      { type: 'image', source: { type: 'base64', media_type, data } },
      { type: 'text', text: prompt },
    ];
  } else {
    content = prompt;
  }

  // 2048 statt 1024: Schritt-für-Schritt-Anleitungen des KI-Buddys (Montage,
  // Köderführung) brauchen mehr Platz und dürfen nicht mitten im Schritt enden.
  const requestBody = JSON.stringify({
    model: model || MODEL(),
    max_tokens: MAX_TOKENS(),
    messages: [{ role: 'user', content }],
  });
  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(ANTHROPIC_URL, {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: requestBody,
      }, LLM_TIMEOUT_MS);
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
      const body = await res.text().catch(() => '');
      let errorMsg = body.slice(0, 300);

      // Bessere Fehlerdiagnose für häufige Probleme
      if (res.status === 401 || res.status === 403) {
        errorMsg = `Claude-Auth-Fehler ${res.status}: Ungültiger oder fehlender API-Key. Bitte ANTHROPIC_API_KEY überprüfen.`;
        console.error('[LLM]', errorMsg);
      } else if (res.status === 429) {
        errorMsg = `Claude Rate-Limit (429): Zu viele Anfragen. Versuch später erneut.`;
      } else {
        errorMsg = `Claude API Fehler ${res.status}: ${errorMsg}`;
      }

      const err = new Error(errorMsg);
      // Nur transiente Status erneut versuchen; 4xx (außer 429) sofort werfen.
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_LLM_RETRIES) {
        lastErr = err;
        console.warn(`[LLM] Versuch ${attempt + 1}/${MAX_LLM_RETRIES} nach ${res.status}...`);
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw err;
    }

    const data = await res.json();
    // Sicherheits-Refusal der API: als klarer Fehler statt leerer Antwort.
    if (data?.stop_reason === 'refusal') {
      throw new Error('Claude API hat die Anfrage abgelehnt (refusal).');
    }
    const text = extractText(data);
    if (typeof text !== 'string') {
      throw new Error('Claude API lieferte eine unerwartete Antwortstruktur (keine Nachricht).');
    }
    // Echte Token-Zahlen für das KI-Volumen-Ledger (aiTokenQuota.js).
    if (onUsage && data?.usage) onUsage({ input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens });
    return text;
  }

  // Retries erschöpft (nur erreichbar, wenn der letzte Versuch transient war).
  throw lastErr || new Error('Claude API Fehler: unbekannt');
}

/**
 * Wie invokeLLM, aber gestreamt (Anthropic stream:true). Ruft `onDelta` je
 * Text-Stück auf und liefert am Ende den akkumulierten Volltext. Bewusst OHNE
 * Retry-Logik: ein bereits begonnener SSE-Stream lässt sich nicht sauber
 * wiederholen — bei Fehler wirft die Funktion, der Aufrufer fällt dann auf den
 * Nicht-Stream-Pfad (invokeLLM) zurück. Nur Text (kein Vision-Streaming).
 *
 * @param {{ prompt: string, onDelta?: (text: string) => void, signal?: AbortSignal, onUsage?: (usage: { input_tokens?: number, output_tokens?: number }) => void }} params
 * @returns {Promise<string>} vollständiger Antworttext
 */
export async function invokeLLMStream({ prompt, onDelta, signal, onUsage = null, model = null }) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw new Error('KI-Service nicht verfügbar – ANTHROPIC_API_KEY fehlt in den Server-Einstellungen.');
  }

  const requestBody = JSON.stringify({
    model: model || MODEL(),
    max_tokens: MAX_TOKENS(),
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  // Direktes fetch statt fetchWithTimeout: Wir brauchen für den Stream sowohl
  // ein hartes Timeout ALS AUCH das externe Abbruch-Signal (Client-Disconnect).
  // fetchWithTimeout überschreibt ein übergebenes signal, deshalb hier selbst
  // kombinieren.
  const timeoutSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: requestBody,
    signal: combinedSignal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API Fehler ${res.status}: ${body.slice(0, 300)}`);
  }
  if (!res.body) {
    throw new Error('Claude API lieferte keinen Stream-Body.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  const usage = {};

  // Verarbeitet eine komplette SSE-Zeile ("data: {...}"). Anthropic streamt
  // Events wie content_block_delta mit delta.type "text_delta".
  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload);
      if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta') {
        const delta = json.delta.text;
        if (typeof delta === 'string' && delta.length) {
          full += delta;
          onDelta?.(delta);
        }
      } else if (json?.type === 'message_start' && json?.message?.usage) {
        usage.input_tokens = json.message.usage.input_tokens;
      } else if (json?.type === 'message_delta' && json?.usage) {
        usage.output_tokens = json.usage.output_tokens;
      } else if (json?.type === 'error') {
        throw new Error(`Claude Stream-Fehler: ${json?.error?.message || 'unbekannt'}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Claude Stream-Fehler')) throw e;
      // Unvollständige/fehlerhafte Zeile ignorieren (die API sendet ganze Events).
    }
  };

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nlIndex;
    while ((nlIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nlIndex);
      buffer = buffer.slice(nlIndex + 1);
      handleLine(line);
    }
  }
  // Letzten Rest verarbeiten (falls kein abschließendes \n kam).
  if (buffer.trim()) handleLine(buffer);

  if (onUsage && (usage.input_tokens != null || usage.output_tokens != null)) onUsage(usage);
  return full;
}
