# Native Android Billing Bridge

Diese Dateien sind **Vorlagen für dein Android-Studio-Projekt** (WebView-Wrapper).
Sie gehoeren NICHT in das Web-Projekt - sondern in deine native APK.

## Struktur

```
app/
  build.gradle                    -> Dependency hinzufuegen (siehe build.gradle.snippet)
  src/main/java/de/catchgbt/app/
    MainActivity.kt               -> WebView + AndroidBilling JS-Interface registrieren
    BillingManager.kt             -> Google Play Billing Logik
    AndroidBillingBridge.kt       -> JavaScript-Interface fuer window.AndroidBilling
```

## Setup-Schritte

1. **Dependency** in `app/build.gradle` einfuegen (siehe `build.gradle.snippet`)
2. **Dateien** ins Android-Projekt kopieren (Package-Name an dein Projekt anpassen)
3. **MainActivity** registriert das JS-Interface mit `webView.addJavascriptInterface(...)`
4. **Produkt-IDs** im Google Play Console anlegen:
   - catchgbt_basic_monthly
   - catchgbt_pro_monthly
   - catchgbt_ultimate_monthly
   - catchgbt_friends_yearly
   - catchgbt_friends_monthly
   - catchgbt_trial_10_10

## Kommunikation Web <-> Native

**Web ruft Native:**
- `window.AndroidBilling.purchase(productId)`
- `window.AndroidBilling.restorePurchases()`
- `window.AndroidBilling.isAvailable()`

**Native sendet an Web (via JavaScript-Events):**
- `play-billing-success` (productId, purchaseToken, orderId, planId)
- `play-billing-cancel` (productId)
- `play-billing-error` (productId, code, message)
- `play-billing-restored` (purchases[])

## Server-Verifizierung

Nach erfolgreichem Kauf ruft die Web-App `activatePlan` Backend-Function auf,
die den `purchase_token` an Google Play Developer API weitergibt zur Verifizierung.