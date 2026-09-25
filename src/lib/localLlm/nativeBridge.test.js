import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Nachbau von window.AndroidLocalLlm (WebViewCompat.addWebMessageListener):
// postMessage(String) Richtung nativ, Antworten als MessageEvent.
function installPort(handler) {
  const listeners = new Set();
  const port = {
    postMessage: vi.fn((data) => handler(JSON.parse(data), (msg) => {
      for (const l of listeners) l({ data: JSON.stringify(msg) });
    })),
    addEventListener: (type, fn) => listeners.add(fn),
  };
  window.AndroidLocalLlm = port;
  return port;
}

let bridge;
beforeEach(async () => {
  vi.resetModules();
  bridge = await import('./nativeBridge');
});
afterEach(() => { delete window.AndroidLocalLlm; });

describe('nativeBridge', () => {
  it('meldet fehlende Brücke (Browser)', async () => {
    expect(bridge.hasNativeLocalLlm()).toBe(false);
    await expect(bridge.callNative('status')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('RPC: Antwort und Fehler', async () => {
    installPort((msg, send) => {
      if (msg.method === 'status') send({ id: msg.id, result: { supported: true } });
      else send({ id: msg.id, error: 'unknown_method' });
    });
    await expect(bridge.callNative('status')).resolves.toEqual({ supported: true });
    await expect(bridge.callNative('quatsch')).rejects.toMatchObject({ code: 'unknown_method' });
  });

  it('streamt Deltas und löst mit den Statistiken auf', async () => {
    installPort((msg, send) => {
      if (msg.method !== 'generate') return;
      send({ id: msg.id, result: true });
      const { requestId } = msg.params;
      send({ event: 'delta', requestId: 'fremd', text: 'nicht meins' });
      send({ event: 'delta', requestId, text: 'Petri ' });
      send({ event: 'delta', requestId, text: 'Heil' });
      send({ event: 'done', requestId, generatedTokens: 2 });
    });
    const deltas = [];
    const stats = await bridge.nativeGenerate({ modelId: 'm', prefix: 'p', suffix: 's' }, { onDelta: d => deltas.push(d) });
    expect(deltas.join('')).toBe('Petri Heil');
    expect(stats.generatedTokens).toBe(2);
  });

  it('gibt Engine-Fehler mit Code weiter', async () => {
    installPort((msg, send) => {
      if (msg.method === 'generate') send({ event: 'error', requestId: msg.params.requestId, error: 'context_overflow' });
    });
    await expect(bridge.nativeGenerate({ modelId: 'm' })).rejects.toMatchObject({ code: 'context_overflow' });
  });

  it('bricht per AbortSignal ab und sagt es der Engine', async () => {
    const port = installPort(() => {});
    const controller = new AbortController();
    const pending = bridge.nativeGenerate({ modelId: 'm' }, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const methods = port.postMessage.mock.calls.map(([d]) => JSON.parse(d).method);
    expect(methods).toContain('cancel');
  });
});
