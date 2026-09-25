package app.baitbuddy.mobile.llm;

/**
 * JNI-Deklarationen der nativen Bibliothek libbaitbuddy_llm.so
 * (android/app/src/main/cpp). Auf 32-Bit-ABIs enthaelt die Bibliothek nur
 * {@link #nativeIsSupported()} (liefert false); alle anderen Methoden duerfen
 * dort nicht aufgerufen werden — {@link #isAvailable()} vorher pruefen.
 */
public final class LlamaNative {

    /** Empfaengt erzeugten Text als UTF-8. Rueckgabe false bricht ab. */
    public interface TokenCallback {
        boolean onToken(byte[] utf8);
    }

    private static final boolean AVAILABLE;

    static {
        boolean available;
        try {
            System.loadLibrary("baitbuddy_llm");
            available = nativeIsSupported();
        } catch (UnsatisfiedLinkError e) {
            available = false;
        }
        AVAILABLE = available;
    }

    private LlamaNative() {}

    public static boolean isAvailable() {
        return AVAILABLE;
    }

    static native boolean nativeIsSupported();

    /** Laedt die CPU-Backend-Varianten aus libDir und initialisiert llama.cpp. */
    static native void nativeInit(String libDir);

    /** @return null bei Erfolg, sonst ein Fehlercode. */
    static native String nativeLoad(String modelPath, int nCtx, int nThreads);

    static native void nativeUnload();

    static native void nativeCancel();

    static native String nativeDescribe();

    /** @return JSON (UTF-8) mit Statistik oder Fehlercode, siehe bb_llm_jni.cpp. */
    static native byte[] nativeGenerate(byte[] prefix, byte[] suffix, int maxTokens,
                                        float temperature, float topP, int topK, float minP,
                                        float repeatPenalty, byte[] checkpointPath,
                                        byte[][] stops,
                                        TokenCallback callback);
}
