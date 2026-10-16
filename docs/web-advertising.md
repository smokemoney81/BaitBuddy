# Echte Werbung auf catchgbt.com

## Umgesetzt

- Responsive AdSense-Displayanzeige statt leerer Partnerkarte/Banner.
- Gäste und Free/Basic bekommen Display-Slots unter den bestehenden Routen-/Kontextregeln. Werbefreie Tarife bleiben werbefrei.
- Künstliche Gast-Countdowns und Reward-Angebote sind im Web-Gate deaktiviert: kein echtes Video, kein verifizierter Reward-Anbieter vorhanden.
- Anzeigen werden ausschließlich nach abgeschlossener TCF-CMP-Entscheidung angefordert. Bei geltender DSGVO werden Zustimmung für Zweck 1 und Google-Vendor 755 verlangt. Ohne CMP, bei Ablehnung oder fehlenden IDs keine Anbieteranfragen.
- Ungefüllte Anzeigen und Ladefehler blenden die Fläche aus. Keine eigenen Klickflächen über Anzeigen.
- `VITE_API_URL` gilt nun auch für Werbekonfiguration und Tracking. Ein 404 auf der Live-API muss zusätzlich im Hosting behoben werden; die Änderung allein beweist keine Reparatur des Live-Routings.

## Publisher-ID übernommen

Die vom Betreiber gelieferte öffentliche ID `ca-pub-8135212085624241` ist als Standard in `src/lib/adPublisher.js` hinterlegt. Sie wird vom AdSense-Lader, Account-Meta-Tag und der generierten ads.txt gemeinsam verwendet. Das Script wird weiterhin erst nach Zustimmung und mit gültiger Anzeigenplatz-ID geladen. Die Account-Verifikation kann nach Veröffentlichung über das Meta-Tag erfolgen. Der nachgelieferte Anzeigenblock „Test1“ enthält die Anzeigenplatz-ID `7915506191`; diese ist ebenfalls zentral hinterlegt. Umgebungsvariablen können beide IDs überschreiben (ein explizit leerer Wert deaktiviert den Slot). Die Bereitstellung des Codes belegt keine Website-Freigabe.

## Für die erste echte Auslieferung erforderlich

1. Im eigenen AdSense-Konto catchgbt.com hinzufügen und die Website freigeben lassen. Ohne Kontozugang ist der bestehende Status unbekannt.
2. Publisher und Anzeigenblock Test1 sind bereits im Code hinterlegt. Optional `VITE_ADSENSE_CLIENT` und `VITE_ADSENSE_SLOT` im Frontend-Build überschreiben. Keine AdMob-App-IDs verwenden.
3. Eine Google-zertifizierte TCF-CMP konfigurieren und deren exaktes Kontoscript im HTML einbinden. Diesen kontospezifischen Code erst nach Einrichtung übernehmen, keine erfundenen IDs. Datenschutzinformationen aktualisieren. Das eingebundene Script muss `window.__tcfapi` bereitstellen.
4. Neu bauen und deployen. Der Vite-Build erzeugt das AdSense-Account-Meta-Tag und `/ads.txt` aus der echten Publisher-ID.
5. `/api/ads/config` muss JSON mit erfolgreichem Status liefern; `ads_enabled` im Admin aktivieren. API-404 im bestehenden Worker-/Backend-Deployment untersuchen.
6. Auf Mobil/Desktop prüfen: Zustimmung zeigt einen gefüllten Slot, Ablehnung keine Anzeige, Pro/Ultimate keine Anzeige. Blocker/fehlendes Inventar dürfen die App nicht blockieren. Nicht auf eigene Anzeigen klicken.

Diese Änderungen erstellen kein AdSense-Konto und bewirken keine Google-Freigabe. Die bisherige Reward-API ist kein Auslieferungsnachweis; deren Absicherung über verifizierte Providerereignisse ist vor einer späteren Rewarded-Aktivierung separat erforderlich.

## Referenzen

- https://support.google.com/adsense/answer/9183363
- https://support.google.com/adsense/answer/13554116
