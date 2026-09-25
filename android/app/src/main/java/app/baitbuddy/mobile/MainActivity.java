package app.baitbuddy.mobile;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import app.baitbuddy.mobile.llm.LocalLlm;
import app.baitbuddy.mobile.llm.LocalLlmPlugin;

public class MainActivity extends BridgeActivity {

    private BillingManager billingManager;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Vor super.onCreate: Capacitor laedt Plugins, bevor die Seite geladen
        // wird — nur so steht window.AndroidLocalLlm schon auf der ersten Seite.
        registerPlugin(LocalLlmPlugin.class);
        super.onCreate(savedInstanceState);

        billingManager = new BillingManager(this, (eventName, jsonPayload) -> {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null) return;
            // eventName ist immer eine feste Konstante aus BillingManager, der
            // jsonPayload ein von org.json erzeugtes Objekt-Literal (gueltiges JS).
            final String js = "window.dispatchEvent(new CustomEvent('" + eventName
                    + "', { detail: " + jsonPayload + " }));";
            runOnUiThread(() -> webView.evaluateJavascript(js, null));
        });

        // Das JS-Interface muss vor der (asynchronen) Seitenladung registriert
        // sein, damit window.AndroidBilling schon beim ersten Render existiert.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.addJavascriptInterface(new AndroidBillingBridge(billingManager), "AndroidBilling");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Aktive Kaeufe an die Web-App melden (notifyWeb=true). Damit gleicht
        // die Web-Schicht bei jedem Wiedereinstieg ab, ob ein bezahlter Kauf
        // serverseitig noch gar nicht aktiviert wurde (z. B. weil die App
        // direkt nach der Zahlung geschlossen wurde) oder ob Play das Abo
        // inzwischen verlaengert hat. Ohne die Meldung (vorher notifyWeb=false)
        // verpuffte die Abfrage wirkungslos.
        if (billingManager != null) {
            billingManager.queryActivePurchases(true);
        }
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        LocalLlm.get(this).onTrimMemory(level);
    }

    @Override
    public void onDestroy() {
        if (billingManager != null) {
            billingManager.destroy();
        }
        super.onDestroy();
    }
}
