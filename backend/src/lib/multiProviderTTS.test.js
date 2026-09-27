import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTTSAudio } from './multiProviderTTS.js';

// Provider-Keys, die die Fallback-Kette aktivieren. Vor jedem Test alle leeren,
// damit die Kette deterministisch ist.
const PROVIDER_ENV = [
  'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'GOOGLE_CLOUD_API_KEY', 'GEMINI_API_KEY',
];
const orig = {};

beforeEach(() => {
  for (const k of PROVIDER_ENV) { orig[k] = process.env[k]; delete process.env[k]; }
});

afterEach(() => {
  for (const k of PROVIDER_ENV) {
    if (orig[k] === undefined) delete process.env[k];
    else process.env[k] = orig[k];
  }
  vi.unstubAllGlobals();
});

function mp3Response() {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode('MP3DATA').buffer,
  };
}

describe('getTTSAudio – Multi-Provider-Fallback-Kette', () => {
  it('wirft, wenn kein Provider konfiguriert ist', async () => {
    await expect(getTTSAudio('Hallo')).rejects.toThrow(/kein tts-provider/i);
  });

  it('nutzt OpenAI, wenn dessen Key gesetzt ist (vor ElevenLabs)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ELEVENLABS_API_KEY = 'el-test';
    const fetchMock = vi.fn(async () => mp3Response());
    vi.stubGlobal('fetch', fetchMock);

    const res = await getTTSAudio('Hallo Welt');

    expect(res.provider).toBe('openai');
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.openai.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fällt bei OpenAI-Fehler automatisch auf ElevenLabs zurück', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ELEVENLABS_API_KEY = 'el-test';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limit' })
      .mockResolvedValueOnce(mp3Response());
    vi.stubGlobal('fetch', fetchMock);

    const res = await getTTSAudio('Hallo Welt');

    expect(res.provider).toBe('elevenlabs');
    expect(String(fetchMock.mock.calls[1][0])).toContain('api.elevenlabs.io');
  });

  it('wandelt Gemini-PCM in ein WAV-Audio um (korrekter Header)', async () => {
    process.env.GEMINI_API_KEY = 'gm-test';
    // 4 PCM-Bytes als Base64.
    const pcmBase64 = Buffer.from([1, 2, 3, 4]).toString('base64');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ inlineData: { data: pcmBase64, mimeType: 'audio/L16;rate=24000' } }] },
        }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await getTTSAudio('Hallo');

    expect(res.provider).toBe('gemini');
    expect(res.contentType).toBe('audio/wav');
    const wav = Buffer.from(res.audioBase64, 'base64');
    // WAV-Header: "RIFF" ... "WAVE", 44 Byte Header + 4 Byte PCM.
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.length).toBe(44 + 4);
    // Sample-Rate 24000 im Header (Offset 24, little-endian).
    expect(wav.readUInt32LE(24)).toBe(24000);
  });
});

// Regressionstests zum Mehrfach-Stimmen-Bug: Ein gepinnter Provider (siehe
// elevenLabsTTS.js createSpeechQueue) darf bei einem Fehlschlag NICHT
// automatisch auf einen anderen Cloud-Provider (= andere Stimme) ausweichen —
// das wäre genau der gemeldete Stimmwechsel mitten in einer Antwort. Der
// kontrollierte Fallback auf die Gerätestimme passiert dann im Client.
describe('getTTSAudio – gepinnter Provider (preferredProvider)', () => {
  it('nutzt ausschließlich den gepinnten Provider, auch wenn ein früherer in der Kette verfügbar wäre', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ELEVENLABS_API_KEY = 'el-test';
    const fetchMock = vi.fn(async () => mp3Response());
    vi.stubGlobal('fetch', fetchMock);

    const res = await getTTSAudio('Hallo Welt', null, 'elevenlabs');

    expect(res.provider).toBe('elevenlabs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.elevenlabs.io');
  });

  it('wirft (statt auf einen anderen Provider auszuweichen), wenn der gepinnte Provider fehlschlägt', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ELEVENLABS_API_KEY = 'el-test';
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTTSAudio('Hallo Welt', null, 'openai')).rejects.toThrow();
    // Kein zweiter Call gegen ElevenLabs — kein Provider-Wechsel.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('wirft, wenn der gepinnte Provider gar nicht (mehr) konfiguriert ist', async () => {
    process.env.ELEVENLABS_API_KEY = 'el-test';
    const fetchMock = vi.fn(async () => mp3Response());
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTTSAudio('Hallo Welt', null, 'openai')).rejects.toThrow(/nicht verfügbar/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
