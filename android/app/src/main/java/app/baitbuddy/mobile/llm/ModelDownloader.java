package app.baitbuddy.mobile.llm;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Laedt eine Modelldatei aus dem {@link ModelCatalog} herunter.
 *
 * Bewusst ohne Android-Abhaengigkeiten, damit die Logik auch auf der JVM
 * pruefbar ist. Ein Abbruch (App geschlossen, Netz weg) hinterlaesst eine
 * ".part"-Datei; der naechste Aufruf setzt per HTTP-Range dort fort, statt
 * Gigabytes erneut zu laden. Erst nach bestandener SHA-256-Pruefung wird die
 * Datei unter ihrem endgueltigen Namen abgelegt — nur solche Dateien laedt die
 * Engine.
 */
public final class ModelDownloader {

    public interface Listener {
        void onProgress(long downloadedBytes, long totalBytes);

        void onVerifying();
    }

    /** Fehler mit maschinenlesbarem Code fuer die Web-Schicht. */
    public static final class DownloadException extends IOException {
        public final String code;

        public DownloadException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private static final int BUFFER_SIZE = 256 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    public void cancel() {
        cancelled.set(true);
    }

    public static File finalFile(File dir, ModelCatalog.Entry entry) {
        return new File(dir, entry.fileName);
    }

    public static File partFile(File dir, ModelCatalog.Entry entry) {
        return new File(dir, entry.fileName + ".part");
    }

    public File download(ModelCatalog.Entry entry, File dir, Listener listener) throws IOException {
        if (!dir.exists() && !dir.mkdirs()) {
            throw new DownloadException("storage_unavailable", "Modellordner nicht anlegbar");
        }
        final File part = partFile(dir, entry);
        long existing = part.exists() ? part.length() : 0L;
        if (existing > entry.sizeBytes) {
            deleteQuietly(part);
            existing = 0L;
        }

        if (existing < entry.sizeBytes) {
            fetch(entry, part, existing, listener);
        }
        if (part.length() != entry.sizeBytes) {
            throw new DownloadException("size_mismatch", "Datei unvollstaendig: " + part.length());
        }

        listener.onVerifying();
        final String actual = sha256(part);
        if (!entry.sha256.equalsIgnoreCase(actual)) {
            deleteQuietly(part);
            throw new DownloadException("checksum_mismatch", "Pruefsumme stimmt nicht");
        }

        final File target = finalFile(dir, entry);
        deleteQuietly(target);
        if (!part.renameTo(target)) {
            throw new DownloadException("storage_unavailable", "Datei nicht umbenennbar");
        }
        return target;
    }

    private void fetch(ModelCatalog.Entry entry, File part, long offset, Listener listener) throws IOException {
        final HttpURLConnection conn = (HttpURLConnection) new URL(entry.url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setRequestProperty("User-Agent", "BaitBuddy-Android");
        if (offset > 0) {
            conn.setRequestProperty("Range", "bytes=" + offset + "-");
        }
        try {
            final int status = conn.getResponseCode();
            final boolean append;
            if (status == HttpURLConnection.HTTP_PARTIAL && offset > 0) {
                append = true;
            } else if (status == HttpURLConnection.HTTP_OK) {
                append = false;  // Server ignoriert Range: von vorn
                offset = 0;
            } else if (status == 416 && offset == entry.sizeBytes) {
                return;
            } else {
                throw new DownloadException("http_" + status, "Server antwortet mit " + status);
            }

            long downloaded = offset;
            listener.onProgress(downloaded, entry.sizeBytes);
            try (InputStream in = conn.getInputStream();
                 OutputStream out = new FileOutputStream(part, append)) {
                final byte[] buffer = new byte[BUFFER_SIZE];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    if (cancelled.get()) {
                        throw new DownloadException("cancelled", "Download abgebrochen");
                    }
                    downloaded += read;
                    if (downloaded > entry.sizeBytes) {
                        throw new DownloadException("size_mismatch", "Datei groesser als erwartet");
                    }
                    out.write(buffer, 0, read);
                    listener.onProgress(downloaded, entry.sizeBytes);
                }
            }
        } catch (DownloadException e) {
            throw e;
        } catch (IOException e) {
            throw new DownloadException("network", e.getMessage() != null ? e.getMessage() : "Netzwerkfehler");
        } finally {
            conn.disconnect();
        }
    }

    static String sha256(File file) throws IOException {
        final MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
        try (InputStream in = new FileInputStream(file)) {
            final byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        final StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private static void deleteQuietly(File f) {
        if (f.exists() && !f.delete()) {
            f.deleteOnExit();
        }
    }
}
