# BaitBuddy Gesamtplan – Umsetzungsstand 19.09.2026

## Verbindliche Entscheidungen

- Free bleibt als Tarif und Modus erhalten (letzte ausdrückliche Nutzerkorrektur).
- Neue Web-Käufe: Basic 8,99 EUR/Monat, Pro 18 EUR/Monat, Ultimate 36 EUR/Monat automatisch wiederkehrend; Freundschaft 150 EUR/Jahr. Bestehende Einmalzahlungen werden nicht rückwirkend in Abos umgewandelt.
- Tagespass: 4,99 EUR, 24 Stunden, ohne automatische Verlängerung.
- Keine Sonderbehandlung eines einzelnen Tarifs bei der Reparatur.
- Digitalprodukte-Widget ist eine eigene Produktoberfläche, nicht das App-Widget.
- Drei Monate Basic je Käufer, ohne reguläre Registrierung; hierfür ist vor Verkauf ein eigener sicherer Einlösepfad erforderlich.
- Deutsch/Englisch zuerst, zentrale Übersetzungen; weitere Sprachen nach Nachfrage.

## Phase 1: konkret umgesetzt, noch nicht live abgenommen

- Zentrale Tarif-/Play-Produkt-Zuordnung in `shared/billingCatalog.js`.
- Fehlerhafte Mindestpreis-Anwendung für Basic und Tagespass beseitigt.
- Wiederkehrende Stripe-Checkout-Sessions, einmaliger Referral-Rabatt statt dauerhaft reduziertem Abopreis.
- Konfigurationsprüfung für Preis, Webhook, APP_BASE_URL; Schema-Verfügbarkeit vor Checkout. Konfigurationsfehler sperren Käufe.
- Rücksprungadresse ausschließlich aus serverseitiger APP_BASE_URL, nicht aus ungeprüften Request-Headern.
- Identischer Freischaltungspfad für Browser-Rückkehr und signierte Webhooks.
- Provider-Zustand wird bei Abo-Ereignissen neu geladen, statt verspäteten Event-Snapshots blind zu vertrauen.
- Abgelaufene/gekündigte Abos, fehlgeschlagene Zahlungen, bezahlte Perioden und Tarifwechsel berücksichtigt.
- Global eindeutige gehashte Kaufnachweise; Konto-Zuordnung, Idempotenz und Metadaten-Update in einer Datenbanktransaktion.
- Mehrere gültige Käufe bleiben erhalten. Stärkerer Tarif verdrängt einen schwächeren nicht dauerhaft.
- Tagespässe separat; verspäteter Zahlungserfolg startet den Pass bei erster Freischaltung. Wiederholungen starten ihn nicht neu.
- Google-Play-Produkt muss zum angeforderten Tarif passen; Laufzeit stammt aus verifiziertem Provider-Datensatz. Fehlende Zeitstempel werden abgewiesen.
- Status-Abfragen lesen aktuelle Auth-Daten; Freischaltung invalidiert den lokalen Auth-Cache.
- Abo-Verwaltung über Stripe Customer Portal.
- HTML-Bericht für Playwright-CI, explizite UTC-Testumgebung.

## Stripe-Testkonto: angelegt

Nur Testmodus, keine echten Abbuchungen. Konto `Baitbuddy`.

| Variable | Test-ID |
|---|---|
| STRIPE_PRICE_BASIC | price_1UHQRo2LxSrxQBvrrpc49Akh |
| STRIPE_PRICE_PRO | price_1UHQS42LxSrxQBvrH43Luwib |
| STRIPE_PRICE_ULTIMATE | price_1UHQSB2LxSrxQBvrxZcPum3U |
| STRIPE_PRICE_FRIENDS | price_1UHQSJ2LxSrxQBvrOnDNeEfM |
| STRIPE_PORTAL_CONFIGURATION | bpc_1UHQUE2LxSrxQBvrQniTqlWP |

Portal: Rechnungen, Zahlungsmittel ändern, Kündigung zum Periodenende; Preiswechsel mit anteiliger Rechnung, Preisreduzierungen zum Periodenende. Test-IDs nicht in Live-Konfiguration einsetzen.

## Vor Merge/Deployment und Phase-1-Abnahme

1. Migration `202609190001_verified_payments.sql` zuerst in einer Staging-Datenbank einspielen. RLS/RPC mit echtem Service-Role-Client prüfen. PGlite-Tests ersetzen keinen Supabase-Staging-Test.
2. Test-Preise, Portal-ID, Test-Schlüssel als Hosting-Secrets, APP_BASE_URL und Webhook-Secret im Staging setzen. Niemals Secrets ins Repository übernehmen.
3. Webhook auf `/api/premium/stripe/webhook` registrieren: checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed, invoice.payment_action_required.
4. Stripe-Testkäufe je Tarif mit gültiger, abgelehnter und 3DS-pflichtiger Testkarte; verzögerte Zahlungsmethode; Browser vor Rückkehr schließen; erneuter Login und zweites Gerät; doppelte/verspätete Webhooks.
5. Google-Play-Testtrack: echte Produkte, Service-Account-Berechtigungen, Kauf/Abbruch/Pending, Wiederherstellung, Neuinstallation, Gerätewechsel, Verlängerung und Tarifwechsel prüfen. Native Upgrade/Downgrade-Replacement-Modes sind noch nicht in diesem PR umgebaut.
6. Vollständige Browser-E2E in GitHub Actions. Lokaler Chromium-Download wurde durch Netzwerkfehler blockiert; lokale Browserabnahme ist daher ausdrücklich nicht erfolgt.
7. Stripe Tax/steuerliche Preisdarstellung separat konfigurieren, bevor echte EU-Käufe starten. `automatic_tax` ist nicht aktiviert; Registrierungen wurden nicht geprüft.
8. Rückerstattungen/Disputes und Google-Play-RTDN ergänzen und testen, bevor die Abwicklung als vollständig produktionsreif gilt. Diese Ereignisse sind derzeit nicht neu implementiert.
9. Bestehende Admin-/Referral-Sonderfreischaltungen müssen vor Einführung des Zahlungsledgers darauf geprüft werden, dass neue Grants ebenfalls dauerhaft in die gemeinsame Entitlement-Quelle aufgenommen werden. Ungeprüftes Ausrollen würde spätere Sonderfreischaltungen übergehen.

## Testergebnis

- Lokaler vollständiger Lauf mit TZ=UTC: 98 Testdateien / 953 Tests erfolgreich (vor ergänztem Tagespass-Replay-Test).
- Lint, Typecheck und Build lokal erfolgreich.
- Direkte SQL-Tests: Kaufzuordnung, Replay, Verlängerung, veraltete Events, Kündigung, getrennte Tagespässe, einmaliger Rabatt und RPC-Berechtigungen.
- Browser-Tests nutzen simulierte Provider-Antworten. Sie sind keine echten Stripe-/Play-Testkäufe.

## Folgephasen – noch nicht als erledigt markieren

2. Gemeinsame Produktbasis: versioniertes Datenmodell mit stabilen IDs für Fänge, Trips, Spots, Köder, Ausrüstung und Einsatzzeiten; erfolglose Trips einschließen. Einheiten metrisch, Zeitstempel mit Zeitzone, fehlend ungleich null. Gemeinsame DE/EN-Übersetzungsdatei.
3. Smart-Widget: vorhandene Tracker-Daten automatisch verwenden, Stichprobe/Unsicherheit nennen, Analyse → Erklärung → Empfehlung → nächster Schritt; Tippen, Mikrofon mit Zustimmung, TTS gemäß Projektarchitektur; lokale Daten vor Cloud-Übertragung transparent auswählen. PDF nur per verifiziertem Link/QR, Sheets per Sidebar, Excel per geeignetem Add-in oder Web-Übergang. Keine eingebettete PDF-Live-KI versprechen.
4. Fünf Produkte: Smart Fishing Tracker, Trip Planner, Lure Performance Tracker, Gear Planner, Complete Bundle. Gemeinsame Navigation und Daten statt isolierter Dateikopien. Leere Lieferdateien und separat gekennzeichnete Beispiele. Drei-Monate-Basic-Einlösung erst bewerben, wenn sie funktioniert.
5. Mehrsprachigkeit: eine Master-Struktur, DE/EN-Umschaltung, passende Datums-/Zahlformate; keine parallelen manuell gepflegten Sprachprodukte.
6. Prüfung in echtem Excel und Google Sheets: Formeln, Dropdowns, Charts, Null/Leerwerte, ungewöhnliche Eingaben, Import/Export, mobile Ansicht, Druck, Sprachwechsel, Widget/Voice und Anleitung.
7. Etsy/Gumroad/Payhip: plattformspezifische Listings und Vorschaubilder erst aus den fertigen Produkten, keine ungeprüften Funktionsversprechen.
8. Affiliate-Angebot und Kooperationspaket für Verbände/Vereine nach Produktfertigstellung. Keine Nachrichten ohne gesonderten Sendeauftrag.
9. Weitere Stores: Gebühren, Geräteunterstützung, Signierung und Billing unmittelbar vor Veröffentlichung neu prüfen. Samsung/Amazon/Uptodown sind Prüfkandidaten, keine bestätigten kostenlosen Veröffentlichungswege.

## Bildreferenzen

- 71815.png: Widget-Zustände, Fisch-Maskottchen, Chat, Sprache, Hinweise und Datenerklärung.
- 71813.png: dunkle Fangprotokoll-/Dashboard-Gestaltung, Navy/Cyan, Karten und Statistiken.
- 71812.png: redaktionelle Produktstruktur (20 Seiten), Navigation und Bonusbereich.
- 71814.png: helle redaktionelle Gestaltung; nicht unverändert als tintensparende Version verwenden.
- Tintenmodus: weiß, schwarze Schrift, sparsame Linien, keine vollflächigen Fotos; Mini-Vorschau, mit einer Auswahl erreichbar. Unterschiedliche Logos der Bildreferenzen vor Produktproduktion auf das bestehende BaitBuddy-Branding vereinheitlichen.
