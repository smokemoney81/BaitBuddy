import { describe, it, expect, vi } from 'vitest';

vi.mock('./localTools', () => ({
  LOCAL_TOOLS: [{ type: 'function', function: { name: 'log_catch', description: 'Fang', parameters: { type: 'object', properties: {}, required: [] } } }],
  executeLocalTool: vi.fn(),
}));

import { runLocalBuddy, createLocalSession, withKnowledgeHint, buildLocalPrefix, primeLocalBuddy, MAX_ROUNDS } from './localBuddy';

// Simuliert die Engine: liefert pro Aufruf die nächste vorbereitete Ausgabe,
// gestückelt wie die echten Delta-Events.
function fakeEngine(outputs) {
  const requests = [];
  const generate = vi.fn(async (req, { onDelta } = {}) => {
    requests.push(req);
    const text = outputs.shift() ?? '';
    for (let i = 0; i < text.length; i += 7) onDelta?.(text.slice(i, i + 7));
    return { promptTokens: 10, reusedTokens: 0, generatedTokens: text.length, stopReason: 'eos' };
  });
  return { generate, requests };
}

const NOW = new Date('2026-09-25T10:00:00');

describe('runLocalBuddy', () => {
  it('beantwortet direkt, wenn kein Werkzeug nötig ist', async () => {
    const { generate, requests } = fakeEngine(['Petri Heil, alles gut!']);
    const deltas = [];
    const res = await runLocalBuddy({ modelId: 'qwen3.5-4b', question: 'Hallo', generate, now: NOW, onDelta: d => deltas.push(d) });
    expect(res.reply).toBe('Petri Heil, alles gut!');
    expect(deltas.join('')).toBe('Petri Heil, alles gut!');
    expect(requests[0].modelId).toBe('qwen3.5-4b');
    expect(requests[0].stop).toEqual(['</tool_call>']);
    expect(requests[0].prefix).toBe(buildLocalPrefix(NOW));
  });

  it('führt Tool-Calls aus und gibt das Ergebnis an das Modell zurück', async () => {
    const raw = '<tool_call>\n<function=log_catch>\n<parameter=species>\nHecht\n</parameter>\n</function>\n';
    const { generate, requests } = fakeEngine([raw, 'Hecht ist eingetragen.']);
    const executeTool = vi.fn(async () => ({ result: '{"ok": true}', notice: 'Fang Hecht wurde im Fangbuch eingetragen.' }));
    const res = await runLocalBuddy({ modelId: 'm', question: 'Trag einen Hecht ein', generate, executeTool, now: NOW });
    expect(executeTool).toHaveBeenCalledWith({ name: 'log_catch', arguments: { species: 'Hecht' } }, expect.objectContaining({ userTexts: ['Trag einen Hecht ein'] }));
    expect(requests[1].suffix).toContain(`${raw}</tool_call><|im_end|>\n<|im_start|>user\n<tool_response>\n{"ok": true}\n</tool_response>`);
    expect(res.reply).toBe('Hecht ist eingetragen.');
    expect(res.notices).toEqual(['Fang Hecht wurde im Fangbuch eingetragen.']);
    expect(res.rounds).toBe(1);
  });

  it('gibt einen Seitenwechsel erst nach der Antwort zurück', async () => {
    const { generate } = fakeEngine(['<tool_call>\n<function=open_page>\n<parameter=page>\nkarte\n</parameter>\n</function>\n', 'Karte kommt.']);
    const executeTool = vi.fn(async () => ({ result: '{"ok": true}', deferredAction: { type: 'navigate', params: { page: 'karte' } } }));
    const res = await runLocalBuddy({ modelId: 'm', question: 'Öffne die Karte', generate, executeTool, now: NOW });
    expect(res.action).toEqual({ type: 'navigate', params: { page: 'karte' } });
  });

  it('begrenzt die Tool-Runden', async () => {
    const call = '<tool_call>\n<function=log_catch>\n</function>\n';
    const { generate } = fakeEngine(Array(MAX_ROUNDS + 2).fill(call));
    const executeTool = vi.fn(async () => ({ result: '{}' }));
    await runLocalBuddy({ modelId: 'm', question: 'x', generate, executeTool, now: NOW });
    expect(generate).toHaveBeenCalledTimes(MAX_ROUNDS + 1);
    expect(executeTool).toHaveBeenCalledTimes(MAX_ROUNDS);
  });

  it('setzt den vorigen Prompt in der Sitzung wortgleich fort', async () => {
    const session = createLocalSession();
    const { generate, requests } = fakeEngine(['Moin!', 'Klar.']);
    const first = await runLocalBuddy({ modelId: 'm', question: 'Hallo', session, generate, now: NOW });
    await runLocalBuddy({
      modelId: 'm',
      question: 'Und jetzt?',
      session,
      history: [{ role: 'user', content: 'Hallo' }, { role: 'assistant', content: first.reply }],
      generate,
      now: NOW,
    });
    expect(requests[1].suffix.startsWith(`${requests[0].suffix}Moin!<|im_end|>\n`)).toBe(true);
  });

  it('baut die Sitzung aus dem Chat neu auf, wenn zwischendurch die Cloud geantwortet hat', async () => {
    const session = createLocalSession();
    session.turns.push({ question: 'Alt', user: 'Alt', rounds: [], reply: 'alt', shown: 'alt' });
    const { generate, requests } = fakeEngine(['Ok.']);
    await runLocalBuddy({
      modelId: 'm',
      question: 'Neu',
      session,
      history: [{ role: 'user', content: 'Cloud-Frage' }, { role: 'assistant', content: 'Cloud-Antwort' }],
      generate,
      now: NOW,
    });
    expect(requests[0].suffix).toContain('Cloud-Frage');
    expect(requests[0].suffix).not.toContain('alt<|im_end|>');
  });

  it('kürzt bei context_overflow den Verlauf und versucht es erneut', async () => {
    const session = createLocalSession();
    session.turns.push({ question: 'A', user: 'A', rounds: [], reply: 'a', shown: 'a' });
    let calls = 0;
    const generate = vi.fn(async (req, { onDelta }) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('context_overflow'), { code: 'context_overflow' });
      onDelta('Kurz.');
      return {};
    });
    const res = await runLocalBuddy({ modelId: 'm', question: 'B', session, history: [{ role: 'user', content: 'A' }, { role: 'assistant', content: 'a' }], generate, now: NOW });
    expect(res.reply).toBe('Kurz.');
    expect(generate.mock.calls[1][0].suffix).not.toContain('<|im_start|>user\nA<|im_end|>');
  });

  it('bricht bei abgebrochenem Signal vor weiteren Tool-Aufrufen ab', async () => {
    const controller = new AbortController();
    const { generate } = fakeEngine(['<tool_call>\n<function=log_catch>\n</function>\n']);
    controller.abort();
    await expect(runLocalBuddy({ modelId: 'm', question: 'x', generate, executeTool: vi.fn(), signal: controller.signal, now: NOW }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('withKnowledgeHint', () => {
  it('gibt bei klaren Fachfragen geprüftes Wissen mit', () => {
    expect(withKnowledgeHint('Wie montiere ich ein Dropshot-Rig?')).toContain('Geprüftes Hintergrundwissen');
  });

  it('nie bei Fragen zu eigenen Daten oder Aktionen', () => {
    expect(withKnowledgeHint('Welcher Köder hat bei mir auf Zander am besten funktioniert?')).toBe('Welcher Köder hat bei mir auf Zander am besten funktioniert?');
    expect(withKnowledgeHint('Trag einen Zander ins Fangbuch ein')).toBe('Trag einen Zander ins Fangbuch ein');
  });

  it('nicht bei Smalltalk', () => {
    expect(withKnowledgeHint('Hallo')).toBe('Hallo');
  });
});

describe('primeLocalBuddy', () => {
  it('rechnet nur den festen Teil vor und schluckt Fehler', async () => {
    const generate = vi.fn(async () => { throw new Error('model_missing'); });
    await expect(primeLocalBuddy('m', { generate, now: NOW })).resolves.toBeNull();
    expect(generate.mock.calls[0][0]).toMatchObject({ modelId: 'm', suffix: '', maxTokens: 0, prefix: buildLocalPrefix(NOW) });
  });
});
