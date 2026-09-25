// Verbindung zur nativen Engine der Android-App (window.AndroidLocalLlm).
//
// Das Objekt injiziert LocalLlmPlugin.java per addWebMessageListener — nur in
// Seiten der eigenen Domains. Nachrichten sind JSON-Strings:
//   Web → nativ   {id, method, params}
//   nativ → Web   {id, result} | {id, error} | {event, ...}
// Im Browser und in App-Versionen ohne lokales Modell fehlt das Objekt; dann
// meldet `hasNativeLocalLlm()` false und nichts hier wird aufgerufen.

const pending = new Map();
const listeners = new Set();
let wiredPort = null;
let seq = 0;

function port() {
  if (typeof window === 'undefined') return null;
  const p = window.AndroidLocalLlm;
  return p && typeof p.postMessage === 'function' ? p : null;
}

export function hasNativeLocalLlm() {
  return port() !== null;
}

function nextId(prefix) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

function handleMessage(event) {
  let msg;
  try {
    msg = JSON.parse(typeof event?.data === 'string' ? event.data : '');
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object') return;
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject, timer } = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(timer);
    if (msg.error) reject(Object.assign(new Error(msg.error), { code: msg.error }));
    else resolve(msg.result);
    return;
  }
  if (msg.event) {
    for (const listener of listeners) {
      try { listener(msg); } catch { /* ein defekter Listener darf die anderen nicht blockieren */ }
    }
  }
}

function wire() {
  const p = port();
  if (!p || wiredPort === p) return p;
  if (typeof p.addEventListener === 'function') p.addEventListener('message', handleMessage);
  else p.onmessage = handleMessage;
  wiredPort = p;
  return p;
}

/** RPC-Aufruf an die native Seite. */
export function callNative(method, params = {}, { timeoutMs = 10000 } = {}) {
  const p = wire();
  if (!p) return Promise.reject(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
  const id = nextId('c');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error('timeout'), { code: 'timeout' }));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    p.postMessage(JSON.stringify({ id, method, params }));
  });
}

/** Abonniert Events der nativen Seite ({event:'model'|'delta'|'done'|'error', …}). */
export function onNativeEvent(listener) {
  wire();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Eine Erzeugung auf dem Gerät. Liefert Text-Stücke über `onDelta` und löst
 * mit den Statistiken der Engine auf ({promptTokens, reusedTokens,
 * generatedTokens, promptMs, generateMs, stopReason}).
 *
 * @param {{modelId:string, prefix:string, suffix:string, maxTokens?:number,
 *   temperature?:number, topP?:number, topK?:number, minP?:number,
 *   repeatPenalty?:number, stop?:string[]}} request
 * @param {{ onDelta?: (text:string) => void, signal?: AbortSignal }} [options]
 */
export function nativeGenerate(request, { onDelta, signal } = {}) {
  if (!hasNativeLocalLlm()) {
    return Promise.reject(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
  }
  const requestId = nextId('g');
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      signal?.removeEventListener?.('abort', onAbort);
      fn(value);
    };
    const onAbort = () => {
      callNative('cancel', { requestId }).catch(() => {});
      const err = new Error('Abgebrochen');
      err.name = 'AbortError';
      finish(reject, err);
    };
    const unsubscribe = onNativeEvent((msg) => {
      if (msg.requestId !== requestId) return;
      if (msg.event === 'delta' && typeof msg.text === 'string') onDelta?.(msg.text);
      else if (msg.event === 'done') finish(resolve, msg);
      else if (msg.event === 'error') {
        finish(reject, Object.assign(new Error(msg.error || 'engine_failure'), { code: msg.error || 'engine_failure' }));
      }
    });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.('abort', onAbort);
    callNative('generate', { ...request, requestId }).catch((err) => finish(reject, err));
  });
}
