import { describe, it, expect } from 'vitest';
import {
  pyJson,
  buildSystemPrefix,
  buildConversationSuffix,
  parseModelOutput,
  visibleStreamingText,
  stripReasoning,
  renderToolCall,
  TOOL_CALL_STOP,
} from './qwenPrompt';

const TOOL = { type: 'function', function: { name: 'get_weather', description: 'Wetter', parameters: { type: 'object', properties: {}, required: [] } } };

describe('pyJson', () => {
  it('trennt wie Pythons json.dumps und lässt Umlaute stehen', () => {
    expect(pyJson({ a: 1, b: ['x', 'ö'], c: { d: null } })).toBe('{"a": 1, "b": ["x", "ö"], "c": {"d": null}}');
  });
});

describe('buildSystemPrefix', () => {
  it('folgt dem Qwen3.5-Template mit Tools', () => {
    const prefix = buildSystemPrefix('Du bist BaitBuddy.', [TOOL]);
    expect(prefix.startsWith('<|im_start|>system\n# Tools\n\nYou have access to the following functions:\n\n<tools>\n{"type": "function"')).toBe(true);
    expect(prefix).toContain('</tools>\n\nIf you choose to call a function ONLY reply');
    expect(prefix.endsWith('</IMPORTANT>\n\nDu bist BaitBuddy.<|im_end|>\n')).toBe(true);
  });

  it('ohne Tools nur die Systemnachricht', () => {
    expect(buildSystemPrefix('  Hallo  ')).toBe('<|im_start|>system\nHallo<|im_end|>\n');
  });
});

describe('buildConversationSuffix', () => {
  it('schließt mit leerem Denkblock (Denkmodus aus)', () => {
    expect(buildConversationSuffix([], 'Hi')).toBe('<|im_start|>user\nHi<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n');
  });

  it('schreibt Tool-Runden aus dem Rohtext fort, damit der Engine-Cache greift', () => {
    const raw = 'Moment.\n\n<tool_call>\n<function=get_weather>\n</function>\n';
    const suffix = buildConversationSuffix([], 'Wetter?', [{ raw, toolCalls: [{ name: 'get_weather', arguments: {} }], results: ['{"temperatur_c": 12}'] }]);
    expect(suffix).toContain(`<think>\n\n</think>\n\n${raw}${TOOL_CALL_STOP}<|im_end|>\n<|im_start|>user\n<tool_response>\n{"temperatur_c": 12}\n</tool_response><|im_end|>\n`);
    expect(suffix.endsWith('<|im_start|>assistant\n<think>\n\n</think>\n\n')).toBe(true);
  });

  it('rendert Tool-Calls ohne Rohtext im Template-Format', () => {
    const suffix = buildConversationSuffix([], 'x', [{ content: '', toolCalls: [{ name: 'log_catch', arguments: { species: 'Hecht', length_cm: 80 } }], results: ['ok'] }]);
    expect(suffix).toContain('<tool_call>\n<function=log_catch>\n<parameter=species>\nHecht\n</parameter>\n<parameter=length_cm>\n80\n</parameter>\n</function>\n</tool_call><|im_end|>');
  });

  it('frühere Turns stehen vor der Frage — eine Folgefrage verlängert den vorigen Prompt nur', () => {
    const turn = { user: 'Hallo', rounds: [], reply: 'Moin!' };
    const first = buildConversationSuffix([], 'Hallo');
    const second = buildConversationSuffix([turn], 'Und jetzt?');
    expect(second.startsWith(`${first}Moin!<|im_end|>\n`)).toBe(true);
  });
});

describe('parseModelOutput', () => {
  it('liest Tool-Calls im Qwen3.5-XML-Format (auch ohne schließendes Tag)', () => {
    const out = parseModelOutput('Ich trage ein.\n\n<tool_call>\n<function=log_catch>\n<parameter=species>\nZander\n</parameter>\n<parameter=length_cm>\n61\n</parameter>\n<parameter=is_released>\nfalse\n</parameter>\n</function>\n');
    expect(out.content).toBe('Ich trage ein.');
    expect(out.toolCalls).toEqual([{ name: 'log_catch', arguments: { species: 'Zander', length_cm: 61, is_released: false } }]);
  });

  it('parst JSON-Arrays in Parametern', () => {
    const out = parseModelOutput('<tool_call>\n<function=create_trip>\n<parameter=steps>\n["A", "B"]\n</parameter>\n</function>\n</tool_call>');
    expect(out.toolCalls[0].arguments.steps).toEqual(['A', 'B']);
  });

  it('ohne Tool-Call nur Text, Denkblöcke entfernt', () => {
    expect(parseModelOutput('<think>hm</think>Petri Heil!')).toEqual({ content: 'Petri Heil!', toolCalls: [] });
  });

  it('ignoriert Blöcke ohne Funktionsnamen', () => {
    expect(parseModelOutput('<tool_call>kaputt').toolCalls).toEqual([]);
  });
});

describe('renderToolCall', () => {
  it('Objekte als JSON', () => {
    expect(renderToolCall({ name: 'f', arguments: { a: { b: 1 } } })).toContain('<parameter=a>\n{"b": 1}\n</parameter>');
  });
});

describe('visibleStreamingText', () => {
  it('zeigt Text bis zum Tool-Call', () => {
    expect(visibleStreamingText('Moment.\n\n<tool_call>\n<function=x>')).toBe('Moment.\n\n');
  });

  it('hält ein angefangenes Markup zurück', () => {
    expect(visibleStreamingText('Hallo <too')).toBe('Hallo ');
    expect(visibleStreamingText('Hallo <')).toBe('Hallo ');
    expect(visibleStreamingText('Hallo <thi')).toBe('Hallo ');
  });

  it('lässt normalen Text unangetastet', () => {
    expect(visibleStreamingText('  2 < 3 stimmt')).toBe('2 < 3 stimmt');
  });

  it('blendet einen offenen Denkblock aus', () => {
    expect(stripReasoning('<think>noch am Denken')).toBe('');
  });
});
