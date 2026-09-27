import { fetchWithTimeout } from './fetchWithTimeout.js';

// Multi-Provider TTS mit automatischer Fallback-Kette.
//
// WICHTIG (deutsche App): Die Reihenfolge ist auf natürliche DEUTSCHE Sprache
// optimiert. Schlägt ein Provider fehl oder ist kein Key gesetzt, wird der
// nächste probiert. Gibt am Ende keiner Audio zurück, wirft die Funktion —
// der Aufrufer (Route /api/ai/tts) antwortet dann mit 502 und das Frontend
// bleibt still (kein Roboterstimmen-Fallback).
//
// Standard-Kette (alle sprechen sauberes Deutsch, liefern direkt MP3/WAV):
//   1. OpenAI  (ChatGPT-Stimme, multilingual, sehr natürlich)
//   2. ElevenLabs (bewährt, natürlichste deutsche Stimme)
//   3. Google Cloud TTS (de-DE, stabil)
//   4. Gemini 2.5 TTS (multilingual inkl. Deutsch, Preview)
//
// Claude/Anthropic bietet kein TTS — die LLM-Logik nutzt Anthropic Cloud API (siehe llm.js).
// TTS erfolgt über die obigen Provider; LLM-Anfragen ausschließlich über Backend-Endpoints.

const TTS_TIMEOUT_MS = 15000;

// Baut die Provider-Kette dynamisch aus den gesetzten Keys.
function buildProviderChain(text, voiceId) {
  const chain = [];

  if (process.env.OPENAI_API_KEY) {
    chain.push({ name: 'openai', fn: () => openaiTTS(text) });
  }
  if (process.env.ELEVENLABS_API_KEY) {
    chain.push({ name: 'elevenlabs', fn: () => elevenlabsTTS(text, voiceId) });
  }
  if (process.env.GOOGLE_CLOUD_API_KEY) {
    chain.push({ name: 'google', fn: () => googleCloudTTS(text) });
  }
  if (process.env.GEMINI_API_KEY) {
    chain.push({ name: 'gemini', fn: () => geminiTTS(text) });
  }

  return chain;
}

/**
 * Holt TTS-Audio über die erste erreichbare Provider-Quelle.
 * @param {string} text
 * @param {string} [voiceId] ElevenLabs-Voice-ID (male/female-Gate in der Route)
 * @param {string|null} [preferredProvider] Name eines Providers, der für
 *   diesen Aufruf verbindlich ist (siehe unten) — verhindert einen
 *   Stimmwechsel mitten in einer mehrsätzigen Antwort: Der Client pinnt den
 *   Provider, der den ersten Satz einer Antwort geliefert hat, und schickt ihn
 *   bei jedem weiteren Satz derselben Antwort erneut mit. Schlägt genau dieser
 *   Provider fehl, wird NICHT auf einen anderen Cloud-Provider (= andere
 *   Stimme) ausgewichen — das überließe dem Aufrufer (Route) den kontrollierten
 *   Fallback auf die Gerätestimme, statt zwei Cloud-Stimmen im selben Turn
 *   gegeneinander zu starten.
 * @returns {Promise<{ audioBase64: string, contentType: string, provider: string }>}
 */
export async function getTTSAudio(text, voiceId = null, preferredProvider = null) {
  const providers = buildProviderChain(text, voiceId);

  if (providers.length === 0) {
    throw new Error('Kein TTS-Provider konfiguriert');
  }

  if (preferredProvider) {
    const pinned = providers.find((p) => p.name === preferredProvider);
    if (!pinned) throw new Error(`Provider ${preferredProvider} nicht verfügbar`);
    const result = await pinned.fn();
    if (!result || !result.audioBase64) throw new Error(`Provider ${preferredProvider} lieferte kein Audio`);
    return { ...result, provider: pinned.name };
  }

  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result && result.audioBase64) {
        return { ...result, provider: provider.name };
      }
    } catch (err) {
      console.warn(`[TTS] Provider ${provider.name} fehlgeschlagen:`, err?.message);
      // Weiter zum nächsten Provider in der Kette.
    }
  }

  throw new Error('Kein TTS-Provider lieferte Audio');
}

// ── OpenAI (ChatGPT-Stimme) ─────────────────────────────────────────────────
async function openaiTTS(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text.slice(0, 4000),
      voice: 'alloy',
      response_format: 'mp3',
    }),
  }, TTS_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`OpenAI TTS error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { audioBase64: Buffer.from(arrayBuffer).toString('base64'), contentType: 'audio/mpeg' };
}

// ── ElevenLabs ──────────────────────────────────────────────────────────────
// Standardmodell: eleven_flash_v2_5 — für die "quasi live"-Sprachausgabe. Es
// spricht sauberes Deutsch (32 Sprachen) und hat mit ~75 ms Modell-Latenz einen
// Bruchteil der Verzögerung von eleven_multilingual_v2. Über ELEVENLABS_MODEL_ID
// jederzeit auf das Qualitätsmodell (eleven_multilingual_v2) zurückstellbar,
// ohne Deploy. output_format hält die Payload klein (schnellerer Transfer).
const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5';
const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = 'mp3_22050_32';

async function elevenlabsTTS(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  // Premade-Stimmen sind auch im Free-Plan per API nutzbar.
  const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel (männlich)

  const voiceIdToUse = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_ELEVENLABS_MODEL;
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || DEFAULT_ELEVENLABS_OUTPUT_FORMAT;

  const callElevenLabs = (vid) => fetchWithTimeout(
    `https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    },
    TTS_TIMEOUT_MS
  );

  let response = await callElevenLabs(voiceIdToUse);

  // Library-Voices sind im Free-Plan gesperrt (402/403) — einmalig mit der
  // Premade-Standardstimme wiederholen statt ganz ohne Audio zu bleiben.
  if (!response.ok && (response.status === 402 || response.status === 403) && voiceIdToUse !== DEFAULT_VOICE_ID) {
    console.warn(`[ElevenLabs] Voice ${voiceIdToUse} abgelehnt (${response.status}) — Fallback auf Premade-Voice`);
    response = await callElevenLabs(DEFAULT_VOICE_ID);
  }

  if (!response.ok) {
    throw new Error(`ElevenLabs error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { audioBase64: Buffer.from(arrayBuffer).toString('base64'), contentType: 'audio/mpeg' };
}

// ── Google Cloud Text-to-Speech ─────────────────────────────────────────────
async function googleCloudTTS(text) {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_CLOUD_API_KEY not configured');

  const response = await fetchWithTimeout(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: text.slice(0, 5000) },
        voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-B' },
        audioConfig: { audioEncoding: 'MP3', pitch: 0, speakingRate: 1.0 },
      }),
    },
    TTS_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Google TTS error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.audioContent) {
    throw new Error('Google TTS lieferte kein audioContent');
  }

  return { audioBase64: data.audioContent, contentType: 'audio/mpeg' };
}

// ── Gemini 2.5 TTS ──────────────────────────────────────────────────────────
// Gemini liefert rohes PCM (L16, 24 kHz, mono, 16-bit). Für die Wiedergabe im
// Browser-<audio> muss ein WAV-Header davor — das erledigt pcmToWav().
async function geminiTTS(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: text.slice(0, 4000) }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      }),
    },
    TTS_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Gemini TTS error: ${response.status}`);
  }

  const data = await response.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const pcmBase64 = part?.inlineData?.data;
  if (!pcmBase64) {
    throw new Error('Gemini TTS lieferte kein Audio');
  }

  // Sample-Rate aus dem MIME-Type lesen (z. B. "audio/L16;rate=24000").
  const mime = part.inlineData.mimeType || '';
  const rateMatch = mime.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  const wavBuffer = pcmToWav(pcmBuffer, sampleRate);
  return { audioBase64: wavBuffer.toString('base64'), contentType: 'audio/wav' };
}

// Umschließt rohes PCM16-mono-Audio mit einem WAV-Header (44 Byte).
function pcmToWav(pcmBuffer, sampleRate, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // fmt-Chunk-Größe
  header.writeUInt16LE(1, 20);           // Audio-Format PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

