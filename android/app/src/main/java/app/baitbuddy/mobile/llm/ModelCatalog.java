package app.baitbuddy.mobile.llm;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Feste Liste der Modelle, die die App herunterladen darf.
 *
 * Die Web-Schicht nennt nur die Modell-ID; Adresse, Groesse und Pruefsumme
 * stehen ausschliesslich hier. So kann eine fremde Seite im WebView weder eine
 * beliebige Datei auf das Geraet laden noch eine manipulierte Modelldatei
 * unterschieben: Jede Datei wird vor der Nutzung gegen den SHA-256-Wert geprueft.
 *
 * Quelle: offizielle Qwen3.5-Gewichte (Apache-2.0) als GGUF-Quantisierung von
 * unsloth, auf eine feste Revision gepinnt.
 *
 * Bewusst nur 4B: Qwen3.5-2B war im Test fuer Tool-Calling nicht verlaesslich
 * genug (erfand beim Fang-Eintrag Gewichte, rief bei Fachfragen sinnlos
 * Werkzeuge auf). Ein falscher Fangbuch-Eintrag wiegt schwerer als ein
 * fehlendes Offline-Modell auf kleinen Geraeten.
 */
public final class ModelCatalog {

    public static final class Entry {
        public final String id;
        public final String label;
        public final String fileName;
        public final String url;
        public final String sha256;
        public final long sizeBytes;
        /** Gesamter Geraete-RAM, ab dem das Modell angeboten wird. */
        public final long minRamBytes;
        public final int contextSize;

        Entry(String id, String label, String fileName, String url, String sha256,
              long sizeBytes, long minRamBytes, int contextSize) {
            this.id = id;
            this.label = label;
            this.fileName = fileName;
            this.url = url;
            this.sha256 = sha256;
            this.sizeBytes = sizeBytes;
            this.minRamBytes = minRamBytes;
            this.contextSize = contextSize;
        }
    }

    private static final long GB = 1024L * 1024L * 1024L;

    // Android meldet als totalMem den fuer Apps nutzbaren Speicher, nicht die
    // Nenngroesse — ein "6-GB-Geraet" liegt typischerweise bei 5,3–5,6 GiB.
    private static final List<Entry> ENTRIES = Collections.unmodifiableList(Arrays.asList(
            new Entry(
                    "qwen3.5-4b",
                    "Qwen3.5 4B",
                    "Qwen3.5-4B-Q4_K_M.gguf",
                    "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf",
                    "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
                    2_740_937_888L,
                    5L * GB,
                    4096)
    ));

    private ModelCatalog() {}

    public static List<Entry> all() {
        return ENTRIES;
    }

    public static Entry find(String id) {
        if (id == null) return null;
        for (Entry e : ENTRIES) {
            if (e.id.equals(id)) return e;
        }
        return null;
    }
}
