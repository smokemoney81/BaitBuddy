package app.baitbuddy.mobile.llm;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Stellt den lokalen KI-Buddy im WebView als window.AndroidLocalLlm bereit.
 *
 * Anders als window.AndroidBilling (addJavascriptInterface) laeuft die Bruecke
 * ueber WebViewCompat.addWebMessageListener: Das Objekt wird nur in Seiten der
 * eigenen Domains eingeblendet. Eine fremde Seite im WebView kann so weder
 * Gigabyte-Downloads ausloesen noch die Engine benutzen.
 *
 * Als Capacitor-Plugin registriert, weil Capacitor Plugins vor dem ersten
 * Seitenaufruf laedt — der Listener muss vorher haengen, sonst fehlt das Objekt
 * auf der ersten Seite.
 *
 * Protokoll (JSON-Strings): Web → nativ {id, method, params};
 * nativ → Web {id, result} bzw. {id, error} sowie Events {event, ...}.
 */
@CapacitorPlugin(name = "BaitBuddyLocalLlm")
public class LocalLlmPlugin extends Plugin {

    private static final String TAG = "LocalLlmPlugin";

    static final Set<String> ALLOWED_ORIGINS = new HashSet<>(Arrays.asList(
            "https://catchgbt.com",
            "https://www.catchgbt.com",
            "https://localhost"));

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile JavaScriptReplyProxy replyProxy;
    private LocalLlm localLlm;

    @Override
    public void load() {
        final WebView webView = getBridge().getWebView();
        if (webView == null || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Log.w(TAG, "WebMessageListener nicht verfuegbar — lokaler KI-Buddy deaktiviert");
            return;
        }
        localLlm = LocalLlm.get(getContext());
        localLlm.setEmitter(event -> send(event.toString()));
        WebViewCompat.addWebMessageListener(webView, "AndroidLocalLlm", ALLOWED_ORIGINS, this::onMessage);
    }

    private void onMessage(@NonNull WebView view, @NonNull WebMessageCompat message, @NonNull Uri sourceOrigin,
                           boolean isMainFrame, @NonNull JavaScriptReplyProxy proxy) {
        if (!isMainFrame) return;
        // Jede Seite (auch nach einem Reload) meldet sich mit ihrem eigenen Proxy.
        replyProxy = proxy;
        final String data = message.getData();
        if (data == null) return;

        String id = null;
        try {
            final JSONObject msg = new JSONObject(data);
            id = msg.optString("id", null);
            final String method = msg.optString("method");
            final JSONObject params = msg.optJSONObject("params") != null ? msg.optJSONObject("params") : new JSONObject();
            final Object result = dispatch(method, params);
            reply(id, result, null);
        } catch (JSONException e) {
            reply(id, null, "bad_request");
        } catch (IllegalArgumentException e) {
            reply(id, null, e.getMessage());
        }
    }

    private Object dispatch(String method, JSONObject params) throws JSONException {
        switch (method) {
            case "status":
                return localLlm.status();
            case "download": {
                final String error = localLlm.startDownload(params.optString("modelId"));
                if (error != null) throw new IllegalArgumentException(error);
                return true;
            }
            case "cancelDownload":
                localLlm.cancelDownload(params.optString("modelId"));
                return true;
            case "delete":
                localLlm.deleteModel(params.optString("modelId"));
                return true;
            case "generate": {
                final String requestId = params.optString("requestId");
                if (requestId.isEmpty()) throw new IllegalArgumentException("bad_request");
                localLlm.generate(requestId, params);
                return true;
            }
            case "cancel":
                localLlm.cancel(params.optString("requestId"));
                return true;
            case "unload":
                localLlm.unload();
                return true;
            default:
                throw new IllegalArgumentException("unknown_method");
        }
    }

    private void reply(String id, Object result, String error) {
        if (id == null) return;
        try {
            final JSONObject out = new JSONObject();
            out.put("id", id);
            if (error != null) out.put("error", error);
            else out.put("result", result == null ? JSONObject.NULL : result);
            send(out.toString());
        } catch (JSONException ignored) {
            // Feste Schluessel — tritt nicht auf.
        }
    }

    private void send(String json) {
        final JavaScriptReplyProxy proxy = replyProxy;
        if (proxy == null) return;
        mainHandler.post(() -> {
            try {
                proxy.postMessage(json);
            } catch (IllegalStateException e) {
                // Seite wurde inzwischen verlassen.
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (localLlm != null) {
            localLlm.setEmitter(null);
            localLlm.unload();
        }
    }
}
