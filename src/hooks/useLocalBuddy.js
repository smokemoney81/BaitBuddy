import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasNativeLocalLlm, onNativeEvent, callNative } from '@/lib/localLlm/nativeBridge';
import {
  AI_MODE_EVENT,
  AI_MODE_KEY,
  getAiMode,
  getLocalLlmStatus,
  pickReadyModel,
  resolveBuddyEngine,
} from '@/lib/localLlm/localModel';
import { createLocalSession, primeLocalBuddy, runLocalBuddy } from '@/lib/localLlm/localBuddy';

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Status des lokalen Modells plus Modus-Einstellung — live aktualisiert über
 * die Events der nativen Seite (Download-Fortschritt, fertig, gelöscht).
 */
export function useLocalLlmStatus() {
  const native = hasNativeLocalLlm();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(native);
  const [mode, setMode] = useState(getAiMode);

  const refresh = useCallback(async () => {
    if (!hasNativeLocalLlm()) return null;
    const next = await getLocalLlmStatus();
    setStatus(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    if (!native) return undefined;
    refresh();
    return onNativeEvent((msg) => {
      if (msg.event !== 'model') return;
      // Fortschritt direkt übernehmen, Zustandswechsel neu abfragen (freier Speicher usw.).
      setStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          models: prev.models.map((m) => (m.id === msg.modelId
            ? { ...m, state: msg.state, downloadedBytes: msg.downloadedBytes, error: msg.error || null }
            : m)),
        };
      });
      if (msg.state !== 'downloading') refresh();
    });
  }, [native, refresh]);

  useEffect(() => {
    const onMode = () => setMode(getAiMode());
    const onStorage = (e) => { if (e.key === AI_MODE_KEY) onMode(); };
    window.addEventListener(AI_MODE_EVENT, onMode);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AI_MODE_EVENT, onMode);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const download = useCallback((modelId) => callNative('download', { modelId }).then(refresh), [refresh]);
  const cancelDownload = useCallback((modelId) => callNative('cancelDownload', { modelId }), []);
  const remove = useCallback((modelId) => callNative('delete', { modelId }), []);

  return { native, status, loading, mode, refresh, download, cancelDownload, remove };
}

/**
 * Für die Buddy-Seiten: entscheidet pro Frage zwischen Cloud und Gerät und
 * hält den Gesprächszustand des lokalen Modells.
 */
export function useLocalBuddy() {
  const { status, mode } = useLocalLlmStatus();
  const picked = pickReadyModel(status);
  const pickedId = picked?.id || null;
  // Stabile Referenz: Der Status wird bei jedem Download-Event neu gebaut.
  const readyModel = useMemo(() => picked, [pickedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessionRef = useRef(createLocalSession());
  const primedRef = useRef(null);

  // Festen Prompt-Teil vorrechnen, sobald klar ist, dass das Gerät antworten
  // wird. Im Automatik-Modus nur offline — online antwortet die Cloud, und das
  // Vorrechnen würde nur Akku kosten.
  useEffect(() => {
    if (!readyModel || primedRef.current === readyModel.id) return;
    if (mode === 'device' || (mode === 'auto' && !isOnline())) {
      primedRef.current = readyModel.id;
      primeLocalBuddy(readyModel.id);
    }
  }, [readyModel, mode]);

  const engineFor = useCallback(
    (online = isOnline()) => resolveBuddyEngine({ mode, online, readyModel }),
    [mode, readyModel],
  );

  const askLocal = useCallback((options) => {
    if (!readyModel) return Promise.reject(Object.assign(new Error('model_missing'), { code: 'model_missing' }));
    return runLocalBuddy({ ...options, modelId: readyModel.id, session: sessionRef.current });
  }, [readyModel]);

  return useMemo(() => ({
    mode,
    readyModel,
    engineFor,
    askLocal,
    // Automatik: fällt die Cloud aus, springt das Gerät ein.
    canFallBack: mode === 'auto' && !!readyModel,
  }), [mode, readyModel, engineFor, askLocal]);
}
