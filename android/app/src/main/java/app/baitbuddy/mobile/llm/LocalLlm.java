package app.baitbuddy.mobile.llm;

import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.net.ConnectivityManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lokaler KI-Buddy: verwaltet Modelldateien und die llama.cpp-Engine.
 *
 * Ein Prozess, ein Modell. Alle Engine-Aufrufe laufen nacheinander auf einem
 * eigenen Thread; Downloads auf einem zweiten. Ergebnisse gehen als Events an
 * die Web-Schicht ({@link Emitter}), die sie in src/lib/localLlm/ verarbeitet.
 */
public final class LocalLlm {

    public interface Emitter {
        void emit(JSONObject event);
    }

    private static final String TAG = "LocalLlm";
    private static final long IDLE_UNLOAD_MS = 5 * 60 * 1000L;
    /** Reserve, die nach dem Download auf dem Speicher frei bleiben muss. */
    private static final long STORAGE_RESERVE_BYTES = 300L * 1024L * 1024L;
    private static final long PROGRESS_INTERVAL_MS = 500L;
    private static final long DELTA_FLUSH_MS = 40L;
    private static final int MAX_CHECKPOINTS_PER_MODEL = 3;

    private static volatile LocalLlm instance;

    public static LocalLlm get(Context context) {
        if (instance == null) {
            synchronized (LocalLlm.class) {
                if (instance == null) instance = new LocalLlm(context.getApplicationContext());
            }
        }
        return instance;
    }

    private final Context context;
    private final File modelDir;
    private final ExecutorService engineThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "bb-llm"));
    private final ExecutorService downloadThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "bb-llm-download"));
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, DownloadState> downloads = new ConcurrentHashMap<>();
    private final Map<String, Boolean> cancelledRequests = new ConcurrentHashMap<>();
    /** Letzter Download-Fehler je Modell, bis zum naechsten Versuch. */
    private final Map<String, String> lastErrors = new ConcurrentHashMap<>();
    private final Runnable idleUnload = this::unloadWhenIdle;

    private volatile Emitter emitter;
    private volatile boolean nativeInitialized = false;
    private volatile String loadedModelId = null;
    private volatile String activeRequestId = null;

    private static final class DownloadState {
        final ModelDownloader downloader = new ModelDownloader();
        volatile String phase = "downloading";  // downloading | verifying
        volatile long downloaded = 0;
        volatile long lastEmit = 0;
    }

    private LocalLlm(Context context) {
        this.context = context;
        this.modelDir = new File(context.getFilesDir(), "models");
    }

    public void setEmitter(Emitter emitter) {
        this.emitter = emitter;
    }

    private void emit(JSONObject event) {
        final Emitter e = emitter;
        if (e != null) e.emit(event);
    }

    // ------------------------------------------------------------------ Status

    private long totalRamBytes() {
        final ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        final ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
        if (am != null) am.getMemoryInfo(info);
        return info.totalMem;
    }

    private long freeStorageBytes() {
        try {
            if (!modelDir.exists()) modelDir.mkdirs();
            return new StatFs(modelDir.getAbsolutePath()).getAvailableBytes();
        } catch (IllegalArgumentException e) {
            return 0L;
        }
    }

    private boolean isMetered() {
        final ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        return cm != null && cm.isActiveNetworkMetered();
    }

    private static long minimumRam() {
        long min = Long.MAX_VALUE;
        for (ModelCatalog.Entry e : ModelCatalog.all()) min = Math.min(min, e.minRamBytes);
        return min;
    }

    private String modelState(ModelCatalog.Entry entry) {
        final DownloadState d = downloads.get(entry.id);
        if (d != null) return d.phase;
        if (ModelDownloader.finalFile(modelDir, entry).isFile()) return "ready";
        if (ModelDownloader.partFile(modelDir, entry).isFile()) return "paused";
        return "absent";
    }

    public JSONObject status() throws JSONException {
        final long ram = totalRamBytes();
        final boolean nativeOk = LlamaNative.isAvailable();
        final JSONObject out = new JSONObject();
        out.put("supported", nativeOk && ram >= minimumRam());
        if (!nativeOk) out.put("reason", "unsupported_abi");
        else if (ram < minimumRam()) out.put("reason", "insufficient_ram");
        out.put("abi", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "");
        out.put("deviceRamBytes", ram);
        out.put("freeStorageBytes", freeStorageBytes());
        out.put("metered", isMetered());
        out.put("loadedModelId", loadedModelId == null ? JSONObject.NULL : loadedModelId);
        out.put("busy", activeRequestId != null);
        final JSONArray models = new JSONArray();
        for (ModelCatalog.Entry e : ModelCatalog.all()) {
            final JSONObject m = new JSONObject();
            m.put("id", e.id);
            m.put("label", e.label);
            m.put("sizeBytes", e.sizeBytes);
            m.put("minRamBytes", e.minRamBytes);
            m.put("fitsDevice", ram >= e.minRamBytes);
            final String state = modelState(e);
            m.put("state", state);
            final DownloadState d = downloads.get(e.id);
            long done = 0;
            if (d != null) done = d.downloaded;
            else if ("paused".equals(state)) done = ModelDownloader.partFile(modelDir, e).length();
            else if ("ready".equals(state)) done = e.sizeBytes;
            m.put("downloadedBytes", done);
            final String lastError = lastErrors.get(e.id);
            if (lastError != null && d == null) m.put("error", lastError);
            models.put(m);
        }
        out.put("models", models);
        return out;
    }

    // -------------------------------------------------------------- Downloads

    /** @return null wenn gestartet, sonst Fehlercode. */
    public String startDownload(String modelId) {
        final ModelCatalog.Entry entry = ModelCatalog.find(modelId);
        if (entry == null) return "unknown_model";
        if (!LlamaNative.isAvailable()) return "unsupported_abi";
        if (totalRamBytes() < entry.minRamBytes) return "insufficient_ram";
        if (ModelDownloader.finalFile(modelDir, entry).isFile()) return "already_ready";
        if (downloads.containsKey(modelId)) return null;
        final long remaining = entry.sizeBytes - ModelDownloader.partFile(modelDir, entry).length();
        if (freeStorageBytes() < remaining + STORAGE_RESERVE_BYTES) return "insufficient_storage";

        final DownloadState state = new DownloadState();
        lastErrors.remove(modelId);
        downloads.put(modelId, state);
        downloadThread.execute(() -> runDownload(entry, state));
        return null;
    }

    private void runDownload(ModelCatalog.Entry entry, DownloadState state) {
        try {
            state.downloader.download(entry, modelDir, new ModelDownloader.Listener() {
                @Override
                public void onProgress(long downloadedBytes, long totalBytes) {
                    state.downloaded = downloadedBytes;
                    final long now = System.currentTimeMillis();
                    if (now - state.lastEmit >= PROGRESS_INTERVAL_MS) {
                        state.lastEmit = now;
                        emitModelEvent(entry, "downloading", downloadedBytes, null);
                    }
                }

                @Override
                public void onVerifying() {
                    state.phase = "verifying";
                    emitModelEvent(entry, "verifying", entry.sizeBytes, null);
                }
            });
            downloads.remove(entry.id);
            emitModelEvent(entry, "ready", entry.sizeBytes, null);
        } catch (ModelDownloader.DownloadException e) {
            downloads.remove(entry.id);
            Log.w(TAG, "Download " + entry.id + " fehlgeschlagen: " + e.code);
            if (!"cancelled".equals(e.code)) lastErrors.put(entry.id, e.code);
            emitModelEvent(entry, "cancelled".equals(e.code) ? "paused" : "error",
                    ModelDownloader.partFile(modelDir, entry).length(), e.code);
        } catch (Exception e) {
            downloads.remove(entry.id);
            Log.w(TAG, "Download " + entry.id + " fehlgeschlagen", e);
            lastErrors.put(entry.id, "io");
            emitModelEvent(entry, "error", ModelDownloader.partFile(modelDir, entry).length(), "io");
        }
    }

    private void emitModelEvent(ModelCatalog.Entry entry, String state, long downloaded, String error) {
        try {
            final JSONObject ev = new JSONObject();
            ev.put("event", "model");
            ev.put("modelId", entry.id);
            ev.put("state", state);
            ev.put("downloadedBytes", downloaded);
            ev.put("sizeBytes", entry.sizeBytes);
            if (error != null) ev.put("error", error);
            emit(ev);
        } catch (JSONException ignored) {
            // Feste Schluessel und Werte — tritt nicht auf.
        }
    }

    public void cancelDownload(String modelId) {
        final DownloadState state = downloads.get(modelId);
        if (state != null) state.downloader.cancel();
    }

    /** Entfernt Modell und angefangene Downloads. */
    public void deleteModel(String modelId) {
        final ModelCatalog.Entry entry = ModelCatalog.find(modelId);
        if (entry == null) return;
        cancelDownload(modelId);
        engineThread.execute(() -> {
            if (modelId.equals(loadedModelId)) {
                LlamaNative.nativeUnload();
                loadedModelId = null;
            }
            final File[] checkpoints = new File(context.getCacheDir(), "llm-checkpoints").listFiles();
            if (checkpoints != null) {
                for (File f : checkpoints) {
                    if (f.getName().startsWith(entry.id + "-")) f.delete();
                }
            }
            // Ein laufender Download wird zuerst beendet, sonst schriebe er die
            // .part-Datei nach dem Loeschen neu.
            downloadThread.execute(() -> {
                ModelDownloader.finalFile(modelDir, entry).delete();
                ModelDownloader.partFile(modelDir, entry).delete();
                emitModelEvent(entry, "absent", 0, null);
            });
        });
    }

    // ----------------------------------------------------------------- Engine

    private String ensureLoaded(ModelCatalog.Entry entry) {
        if (entry.id.equals(loadedModelId)) return null;
        final File file = ModelDownloader.finalFile(modelDir, entry);
        if (!file.isFile()) return "model_missing";
        if (totalRamBytes() < entry.minRamBytes) return "insufficient_ram";
        if (!nativeInitialized) {
            LlamaNative.nativeInit(context.getApplicationInfo().nativeLibraryDir);
            nativeInitialized = true;
        }
        if (loadedModelId != null) {
            LlamaNative.nativeUnload();
            loadedModelId = null;
        }
        final int cores = Runtime.getRuntime().availableProcessors();
        final int threads = Math.max(2, Math.min(4, cores - 2));
        final String error = LlamaNative.nativeLoad(file.getAbsolutePath(), entry.contextSize, threads);
        if (error != null) return error;
        loadedModelId = entry.id;
        return null;
    }

    /**
     * Startet eine Erzeugung. Ereignisse: delta {text}, done {stats}, error {error}.
     * Anfragen laufen nacheinander; eine neue Anfrage bricht die laufende nicht ab
     * (das entscheidet die Web-Schicht per {@link #cancel(String)}).
     */
    public void generate(String requestId, JSONObject req) {
        cancelledRequests.remove(requestId);
        mainHandler.removeCallbacks(idleUnload);
        engineThread.execute(() -> runGenerate(requestId, req));
    }

    private void runGenerate(String requestId, JSONObject req) {
        if (cancelledRequests.remove(requestId) != null) {
            emitRequestEvent(requestId, "error", "cancelled", null);
            return;
        }
        final ModelCatalog.Entry entry = ModelCatalog.find(req.optString("modelId"));
        if (entry == null) {
            emitRequestEvent(requestId, "error", "unknown_model", null);
            return;
        }
        activeRequestId = requestId;
        try {
            final String loadError = ensureLoaded(entry);
            if (loadError != null) {
                emitRequestEvent(requestId, "error", loadError, null);
                return;
            }
            final JSONArray stopArr = req.optJSONArray("stop");
            final byte[][] stops = new byte[stopArr != null ? stopArr.length() : 0][];
            for (int i = 0; i < stops.length; i++) {
                stops[i] = stopArr.optString(i, "").getBytes(StandardCharsets.UTF_8);
            }

            final StringBuilder pending = new StringBuilder();
            final long[] lastFlush = {System.currentTimeMillis()};
            final byte[] result = LlamaNative.nativeGenerate(
                    req.optString("prefix", "").getBytes(StandardCharsets.UTF_8),
                    req.optString("suffix", "").getBytes(StandardCharsets.UTF_8),
                    req.optInt("maxTokens", 512),
                    (float) req.optDouble("temperature", 0.7),
                    (float) req.optDouble("topP", 0.8),
                    req.optInt("topK", 20),
                    (float) req.optDouble("minP", 0.0),
                    (float) req.optDouble("repeatPenalty", 1.05),
                    checkpointFile(entry, req.optString("prefix", "")).getAbsolutePath().getBytes(StandardCharsets.UTF_8),
                    stops,
                    utf8 -> {
                        if (cancelledRequests.containsKey(requestId)) return false;
                        pending.append(new String(utf8, StandardCharsets.UTF_8));
                        final long now = System.currentTimeMillis();
                        // Stuecke buendeln: ein Event pro Token wuerde den
                        // UI-Thread des WebViews unnoetig fluten.
                        if (now - lastFlush[0] >= DELTA_FLUSH_MS) {
                            lastFlush[0] = now;
                            emitRequestEvent(requestId, "delta", null, pending.toString());
                            pending.setLength(0);
                        }
                        return true;
                    });
            if (pending.length() > 0) emitRequestEvent(requestId, "delta", null, pending.toString());

            final JSONObject stats = new JSONObject(new String(result, StandardCharsets.UTF_8));
            if (stats.optBoolean("ok")) {
                stats.remove("ok");
                stats.put("event", "done");
                stats.put("requestId", requestId);
                stats.put("modelId", entry.id);
                emit(stats);
            } else {
                emitRequestEvent(requestId, "error", stats.optString("error", "generate_failed"), null);
            }
        } catch (JSONException e) {
            emitRequestEvent(requestId, "error", "bad_request", null);
        } catch (Throwable t) {
            Log.e(TAG, "Erzeugung fehlgeschlagen", t);
            emitRequestEvent(requestId, "error", "engine_failure", null);
        } finally {
            activeRequestId = null;
            cancelledRequests.remove(requestId);
            mainHandler.postDelayed(idleUnload, IDLE_UNLOAD_MS);
        }
    }

    /**
     * Ablageort des Prefix-Checkpoints: eine Datei pro Modell und Prefix
     * (Hash im Namen). Buddy-Chat und JSON-Aufgaben haben verschiedene
     * Prefixe, deshalb bleiben die drei zuletzt genutzten Dateien je Modell
     * liegen; aeltere (etwa vom Vortag, das Datum steht im Prompt) fallen weg.
     */
    private File checkpointFile(ModelCatalog.Entry entry, String prefix) {
        final File dir = new File(context.getCacheDir(), "llm-checkpoints");
        if (!dir.exists()) dir.mkdirs();
        String hash;
        try {
            final java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            final byte[] digest = md.digest(prefix.getBytes(StandardCharsets.UTF_8));
            final StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 12; i++) hex.append(String.format("%02x", digest[i]));
            hash = hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            hash = Integer.toHexString(prefix.hashCode());
        }
        final File target = new File(dir, entry.id + "-" + hash + ".ckpt");
        if (target.exists()) target.setLastModified(System.currentTimeMillis());

        final File[] existing = dir.listFiles((d, name) -> name.startsWith(entry.id + "-"));
        if (existing != null && existing.length > MAX_CHECKPOINTS_PER_MODEL) {
            java.util.Arrays.sort(existing, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            for (int i = MAX_CHECKPOINTS_PER_MODEL; i < existing.length; i++) {
                if (!existing[i].equals(target)) existing[i].delete();
            }
        }
        return target;
    }

    private void emitRequestEvent(String requestId, String event, String error, String text) {
        try {
            final JSONObject ev = new JSONObject();
            ev.put("event", event);
            ev.put("requestId", requestId);
            if (error != null) ev.put("error", error);
            if (text != null) ev.put("text", text);
            emit(ev);
        } catch (JSONException ignored) {
            // Feste Schluessel — tritt nicht auf.
        }
    }

    public void cancel(String requestId) {
        cancelledRequests.put(requestId, Boolean.TRUE);
        if (requestId.equals(activeRequestId)) LlamaNative.nativeCancel();
    }

    public void unload() {
        mainHandler.removeCallbacks(idleUnload);
        engineThread.execute(() -> {
            if (loadedModelId != null) {
                LlamaNative.nativeUnload();
                loadedModelId = null;
            }
        });
    }

    private void unloadWhenIdle() {
        if (activeRequestId == null) unload();
    }

    /** Aus Activity.onTrimMemory: Modell freigeben, bevor Android die App beendet. */
    public void onTrimMemory(int level) {
        // UI_HIDDEN (App kurz verlassen) bewusst nicht: Die Rueckkehr soll ohne
        // Neuladen und ohne verlorenen Prompt-Cache gehen.
        final boolean pressure = level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW
                || level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL
                || level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND;
        if (pressure && activeRequestId == null && loadedModelId != null) {
            unload();
        }
    }
}
