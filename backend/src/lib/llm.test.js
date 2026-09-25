import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeLLM, invokeLLMStream, getAnthropicKey, getLLMStatus, hasTextProvider } from './llm.js';
import { getOpenAIKey, getGeminiKey } from './aiKeys.js';

// Baut aus SSE-Text-Stücken einen async-iterierbaren Response-Body (wie fetch
// ihn liefert), damit invokeLLMStream ihn Chunk für Chunk verarbeiten kann.
function sseBody(chunks) {
  return (async function* () {
    for (const c of chunks) yield new TextEncoder().encode(c);
  })();
}

describe('invokeLLM', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('liefert den Text der ersten Choice zurück', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Hallo' }] }),
    }));
    const out = await invokeLLM({ prompt: 'test' });
    expect(out).toBe('Hallo');
  });

  it('wirft einen aussagekräftigen Fehler bei fehlender/leerer Antwortstruktur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    }));
    await expect(invokeLLM({ prompt: 'test' })).rejects.toThrow(/unerwartete Antwortstruktur/i);
  });

  it('wirft bei nicht-ok Response mit Status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }));
    await expect(invokeLLM({ prompt: 'test' })).rejects.toThrow(/429/);
  });

  it('wiederholt bei transientem 503 und liefert nach erfolgreichem Retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'nach retry' }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const out = await invokeLLM({ prompt: 'test' });
    expect(out).toBe('nach retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wiederholt bei 429 und liefert nach erfolgreichem Retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const out = await invokeLLM({ prompt: 'test' });
    expect(out).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wiederholt NICHT bei 400 (nicht-transienter Fehler)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(invokeLLM({ prompt: 'test' })).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nutzt das Vision-Modell und baut eine data-URL für imageBase64', async () => {
    let sentBody;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'bild-analyse' }] }) };
    }));

    const out = await invokeLLM({ prompt: 'analysiere', imageBase64: 'QUJD' });
    expect(out).toBe('bild-analyse');

    const content = sentBody.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].source.type).toBe('base64');
    expect(content[0].source.media_type).toBe('image/jpeg');
    expect(content[0].source.data).toBe('QUJD');
    expect(content[1].text).toBe('analysiere');
  });

  it('zerlegt eine data-URL in media_type und rohe Base64-Daten', async () => {
    let sentBody;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) };
    }));

    await invokeLLM({ prompt: 'x', imageBase64: 'data:image/png;base64,ABC' });
    expect(sentBody.messages[0].content[0].source.media_type).toBe('image/png');
    expect(sentBody.messages[0].content[0].source.data).toBe('ABC');
  });

  it('wirft, wenn kein Anthropic-Key gesetzt ist', async () => {
    const orig = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(invokeLLM({ prompt: 'test' })).rejects.toThrow(/ANTHROPIC_API_KEY/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      for (const [k, v] of Object.entries(orig)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe('invokeLLMStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parst SSE-Deltas, ruft onDelta pro Stück und liefert den Volltext', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: sseBody([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hallo "}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Welt."}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    }));

    const deltas = [];
    const full = await invokeLLMStream({ prompt: 'x', onDelta: (t) => deltas.push(t) });

    expect(deltas).toEqual(['Hallo ', 'Welt.']);
    expect(full).toBe('Hallo Welt.');
  });

  it('verarbeitet über Chunk-Grenzen zerrissene SSE-Zeilen korrekt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      // Ein Event ist über zwei Chunks verteilt (kein abschließendes \n im ersten).
      body: sseBody([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Te',
        'il1"}}\n\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Teil2"}}\n\n',
      ]),
    }));

    const full = await invokeLLMStream({ prompt: 'x' });
    expect(full).toBe('Teil1Teil2');
  });

  it('wirft bei nicht-ok Response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }));
    await expect(invokeLLMStream({ prompt: 'x' })).rejects.toThrow(/500/);
  });
});

describe('getAnthropicKey — toleranter Env-Lookup', () => {
  const NAMES = ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'NGROK_TOKEN'];
  const orig = {};

  beforeEach(() => {
    for (const k of NAMES) { orig[k] = process.env[k]; delete process.env[k]; }
  });

  afterEach(() => {
    for (const k of NAMES) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
  });

  it('nimmt ANTHROPIC_API_KEY direkt und trimmt Whitespace/Anführungszeichen', () => {
    process.env.ANTHROPIC_API_KEY = ' "sk-ant-test" \n';
    expect(getAnthropicKey()).toBe('sk-ant-test');
  });

  it('findet abweichend benannte Varianten wie CLAUDE_API_KEY', () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-variant';
    expect(getAnthropicKey()).toBe('sk-ant-variant');
  });

  it('ignoriert Fremd-Variablen wie NGROK_TOKEN', () => {
    process.env.NGROK_TOKEN = 'not-a-claude-key';
    expect(getAnthropicKey()).toBe(null);
  });

  it('liefert null bei leerem Wert', () => {
    process.env.ANTHROPIC_API_KEY = '   ';
    expect(getAnthropicKey()).toBe(null);
  });
});

// ── Anbieter-Auswahl: OpenAI für Chat, Gemini für Bilder, Anthropic als Reserve ──

const KEY_NAMES = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_MODEL', 'GEMINI_MODEL'];

function withKeys(keys) {
  const orig = {};
  beforeEach(() => {
    for (const k of KEY_NAMES) { orig[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, keys);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const k of KEY_NAMES) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
  });
}

const openAIOk = (text) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });
const geminiOk = (text) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const anthropicOk = (text) => ({ ok: true, json: async () => ({ content: [{ type: 'text', text }] }) });

describe('invokeLLM — OpenAI (ChatGPT) für Text', () => {
  withKeys({ OPENAI_API_KEY: 'sk-openai', GEMINI_API_KEY: 'gem-key', ANTHROPIC_API_KEY: 'sk-ant-x' });

  it('schickt Textfragen an die Chat-Completions-API von OpenAI', async () => {
    let call;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => { call = { url, opts }; return openAIOk('Petri Heil'); }));

    await expect(invokeLLM({ prompt: 'Angeln an der Erft?' })).resolves.toBe('Petri Heil');
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call.opts.headers.Authorization).toBe('Bearer sk-openai');
    const body = JSON.parse(call.opts.body);
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.messages).toEqual([{ role: 'user', content: 'Angeln an der Erft?' }]);
  });

  it('nutzt OPENAI_MODEL, wenn gesetzt', async () => {
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    let body;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => { body = JSON.parse(opts.body); return openAIOk('ok'); }));
    await invokeLLM({ prompt: 'x' });
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('weicht bei aufgebrauchtem OpenAI-Kontingent auf Anthropic aus, ohne OpenAI zu wiederholen', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => '{"error":{"code":"insufficient_quota"}}' })
      .mockResolvedValueOnce(anthropicOk('von Claude'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(invokeLLM({ prompt: 'x' })).resolves.toBe('von Claude');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('meldet den Fehler des bevorzugten Anbieters, wenn alle scheitern', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'bad key' })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'credit balance is too low' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(invokeLLM({ prompt: 'x' })).rejects.toThrow(/OpenAI-Auth-Fehler 401.*OPENAI_API_KEY/);
  });

  it('meldet einen OpenAI-Refusal als Fehler statt leerer Antwort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: null, refusal: 'nein' } }] }),
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reserve Anthropic bekommt denselben Mock und liefert keine gültige Struktur.
    await expect(invokeLLM({ prompt: 'x' })).rejects.toThrow(/refusal/);
  });
});

describe('invokeLLM — Google Gemini für Bildanalyse', () => {
  withKeys({ OPENAI_API_KEY: 'sk-openai', GEMINI_API_KEY: 'gem-key', ANTHROPIC_API_KEY: 'sk-ant-x' });

  it('schickt Bilder an Gemini (inline_data + Text, Schlüssel im Header)', async () => {
    let call;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => { call = { url, opts }; return geminiOk('Ein Hecht, ca. 70 cm'); }));

    await expect(invokeLLM({ prompt: 'Welcher Fisch?', imageBase64: 'iVBORw0KGgoAAA' })).resolves.toBe('Ein Hecht, ca. 70 cm');
    expect(call.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(call.url).not.toContain('gem-key');
    expect(call.opts.headers['x-goog-api-key']).toBe('gem-key');
    const body = JSON.parse(call.opts.body);
    expect(body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/png', data: 'iVBORw0KGgoAAA' } });
    expect(body.contents[0].parts[1]).toEqual({ text: 'Welcher Fisch?' });
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('übernimmt den MIME-Typ aus einer data-URL', async () => {
    let body;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => { body = JSON.parse(opts.body); return geminiOk('ok'); }));
    await invokeLLM({ prompt: 'x', imageBase64: 'data:image/webp;base64,UklGRabc' });
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: 'image/webp', data: 'UklGRabc' });
  });

  it('ignoriert Denk-Teile der Antwort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Überlegung', thought: true }, { text: 'Zander' }] } }] }),
    }));
    await expect(invokeLLM({ prompt: 'x', imageBase64: '/9j/abc' })).resolves.toBe('Zander');
  });

  it('weicht bei Gemini-Fehler auf OpenAI Vision aus', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'API key not valid' })
      .mockResolvedValueOnce(openAIOk('Barsch'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(invokeLLM({ prompt: 'x', imageBase64: '/9j/abc' })).resolves.toBe('Barsch');
    const openAIBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(openAIBody.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/abc' } });
  });

  it('meldet eine blockierte Anfrage als Fehler', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }));
    await expect(invokeLLM({ prompt: 'x', imageBase64: '/9j/abc' })).rejects.toThrow(/SAFETY/);
  });
});

describe('invokeLLMStream — OpenAI', () => {
  withKeys({ OPENAI_API_KEY: 'sk-openai', ANTHROPIC_API_KEY: 'sk-ant-x' });

  it('parst OpenAI-SSE-Deltas bis [DONE]', async () => {
    let sent;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      sent = { url, body: JSON.parse(opts.body) };
      return {
        ok: true,
        body: sseBody([
          'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Hallo "}}]}\n\ndata: {"choices":[{"delta":{"content":"Welt."}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      };
    }));
    const deltas = [];
    const full = await invokeLLMStream({ prompt: 'x', onDelta: (t) => deltas.push(t) });

    expect(sent.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(sent.body.stream).toBe(true);
    expect(deltas).toEqual(['Hallo ', 'Welt.']);
    expect(full).toBe('Hallo Welt.');
  });

  it('weicht vor dem ersten Delta auf Anthropic aus', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'insufficient_quota' })
      .mockResolvedValueOnce({
        ok: true,
        body: sseBody(['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}\n\n']),
      }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(invokeLLMStream({ prompt: 'x' })).resolves.toBe('Claude');
  });

  it('weicht NICHT aus, wenn schon Text beim Client angekommen ist', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: sseBody([
        'data: {"choices":[{"delta":{"content":"Teil"}}]}\n\n',
        'data: {"error":{"message":"server_error"}}\n\n',
      ]),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(invokeLLMStream({ prompt: 'x' })).rejects.toThrow(/OpenAI Stream-Fehler/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Anbieter-Status und Schlüssel', () => {
  withKeys({});

  it('meldet ohne jeden Schlüssel keinen Anbieter und wirft ohne Upstream-Aufruf', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.CLAUDE_API_KEY;
    expect(hasTextProvider()).toBe(false);
    expect(getLLMStatus()).toEqual({ text: null, vision: null });
    await expect(invokeLLM({ prompt: 'x' })).rejects.toThrow(/OPENAI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nennt OpenAI für Chat und Gemini für Bilder, sobald beide Schlüssel da sind', () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.GEMINI_API_KEY = 'gem-key';
    expect(getLLMStatus()).toEqual({
      text: { provider: 'OpenAI (ChatGPT)', model: 'gpt-4.1-mini' },
      vision: { provider: 'Google Gemini', model: 'gemini-2.5-flash' },
    });
  });

  it('liest Schlüssel tolerant und trimmt Anführungszeichen', () => {
    process.env.OPENAI_API_KEY = ' "sk-proj-abc" ';
    process.env.GEMINI_API_KEY = "'gem'";
    expect(getOpenAIKey()).toBe('sk-proj-abc');
    expect(getGeminiKey()).toBe('gem');
  });
});
