# Abo/Credit-System — Migration vom alten KI-Volumen

## Integrationsstand 27.09.2026

Dieser Abschnitt ist für den aktuellen Branch maßgeblich; die ältere
Implementierungsnotiz darunter beschreibt PR #455 vor der Integration.

| Plan | Web-Preis bei aktivem Credit-System | Monatscredits | Anbieter-Kostenlimit |
|---|---:|---:|---:|
| Free | 0 € | 300 | 0,05 € |
| Basic | 4,99 € | 2.500 | 0,50 € |
| Pro | 9,99 € | 10.000 | 2,00 € |
| Ultimate | 17,99 € | 30.000 | 4,00 € |

Friends behält seine bestehende Jahrespreis-/Berechtigungslogik und erhält
40.000 Credits bei 4,00 € Monatslimit. Der 24-Stunden-Pass und die kostenlose
Testphase erhalten 3.000 Credits bei 0,50 € Limit. Der Admin-Schalter für
kostenlose Tools hebt die Berechtigungen an, nicht das externe Kostenbudget.
Die Monatscredits verfallen am Periodenende;
Bestandspläne bleiben bei ausgeschaltetem Flag unverändert. Die neuen
Webpreise werden serverseitig erst mit `AI_CREDIT_SYSTEM_ENABLED=true`
wirksam. In der Android-App wird kein im Code hinterlegter Preis als Play-Preis
ausgegeben; die verbindlichen Preise müssen in der Play Console angepasst
und im Kaufdialog geprüft werden.

Die Kopfzeile, Profil- und Premium-Seite lesen bei aktivem Flag die neue Wallet.
Nutzungsverlauf und Werkzeugkosten kommen vom Server. Lokale Wissensantworten
und reine Datenbankfunktionen verbrauchen keine Credits. Alle kostenpflichtigen
Cloud-Aufrufe reservieren vor dem Anbieteraufruf und geben bei Fehlern frei.
Auch Superuser unterliegen dem Kostenlimit.
Die Cloudflare-Container-Umgebung reicht den Credit-Schalter und die
Kostenkonfiguration explizit weiter (`cloudflare/backend/containerEnv.js`).

**Schutzschalter:** Credit-Topups sind deaktiviert, weil die gekauften Credits
noch keinen periodenübergreifenden Anbieter-Kostenpuffer haben. Die
OpenAI-Realtime-Session ist im Credit-Modus deaktiviert, weil der Server die
direkte WebRTC-Verbindung nicht zeitlich begrenzen kann; turn-basiertes
Sprachgespräch bleibt über Chat/TTS möglich. Vor der Produktivschaltung sind
Migration, parallele Reservierungen, echte Anbieterkosten, Bestandskunden,
Stripe-Testkauf und Play-Testkauf in Staging zu prüfen.

Das Limit wird vor dem Aufruf anhand geschätzter Anbieter-Kosten geprüft;
ein einzelner Aufruf kann bei höherem tatsächlichem Verbrauch das Limit
überschreiten. Ein absolut harter EUR-Kostendeckel erfordert ein vom Server
kontrolliertes Anbieterbudget oder strengere Anbieterlimits. Das Flag bleibt
bis zu dieser Prüfung aus.

Der Supabase-Migrations-Trockenlauf im PR wird derzeit durch ältere, nur in
der Remote-Migrationshistorie vorhandene Versionen blockiert. Diese
Historie muss mit den echten Quellen rekonstruiert und abgeglichen werden;
ein `migration repair --status reverted` würde produktiv angewandte
Migrationen falsch als zurückgenommen markieren.

Dieses Dokument fasst alle drei Teilaufträge zusammen, die das Buddy-Token-
System (`backend/src/lib/aiTokenQuota.js`) durch ein Abo/Credit-System mit
echten Anbieterkosten-Limits ablösen — additiv, hinter dem Flag
`AI_CREDIT_SYSTEM_ENABLED`, ohne das alte System zu entfernen.

## 1. Analyse des vorherigen Zustands

Vor diesem Umbau gab es nur `backend/src/lib/aiTokenQuota.js`
(`meterAiTokens`): ein Monatsvolumen aus abstrakten "Buddy-Tokens" pro Plan
(Free 500, Basic 5.000, Pro 12.000, Ultimate 30.000, Freundschaft 40.000),
**fail-open** bei DB-Fehlern, ohne Bezug zu den tatsächlichen Anbieterkosten
(Anthropic-Tokens, ElevenLabs-Zeichen, OpenAI-Realtime-Minuten). Das
Volumen war für Nutzer verständlich, deckelte aber nicht die reale Kosten-
exposition pro Nutzer — ein Nutzer mit teuren Anfragen (Bildanalyse, lange
Voice-Sitzungen) konnte innerhalb seines Token-Budgets trotzdem deutlich
mehr Anbieterkosten verursachen als ein anderer. Es gab keine Wallet-,
Perioden- oder Kostenlimit-Konzepte, keine Aufladepakete, keine
Admin-Kostenübersicht.

## 2. Implementierte Änderungen

### Teilauftrag 1 — Fundament (DB + Engine)
- Neues Schema (`credit_wallets`, `credit_transactions`, `ai_usage`,
  `provider_cost_periods`, `subscription_plans`, `user_subscriptions`) mit
  atomaren RPCs (`reserve_ai_credits`, `finalize_ai_credits`,
  `rollback_ai_credits`, `grant_monthly_credits`, `add_topup_credits`).
- `creditConfig.js` (Tarife/Kosten/Topup-Pakete, alles per Env als JSON
  überschreibbar), `creditEngine.js` (JS-Wrapper um die RPCs, **fail-closed**
  im Gegensatz zum alten System — eine nicht erreichbare DB blockiert den
  teuren Anbieter-Aufruf statt ihn durchzulassen).

### Teilauftrag 2 — Guard, Routing, Provisionierung, Stripe-Fulfillment
- `aiModelRouting.js` (`classifyFeature`, ordnet jeden `/api/ai/*`-Aufruf einer
  Kosten-/Modellstufe zu; `ANTHROPIC_MODEL_HIGH` für die "high"-Stufe).
- `creditGuard.js` / `chargeAi()` — Ersatz für `meterAiTokens` hinter dem Flag;
  reserviert Credits vor dem Anbieter-Aufruf, finalisiert nach Erfolg, rollt
  bei Fehlern zurück. Ohne Flag bleibt exakt das alte Verhalten.
- `walletProvisioning.js` (`resolveBillingPeriod`, `ensureCurrentWallet`,
  `grantForPlanChange`) — rollierende 30-Tage-Perioden ab einem planabhängigen
  Anker, Lazy-Provisioning statt Massen-Migration.
- `routes/premium.js`: `syncCreditWalletAfterActivation` nach Stripe-Webhook/
  `/premium/activate`, Cron `GET /admin/credits/billing-cycle`, Stripe-Checkout
  für Credit-Topups (`POST /premium/credits/checkout`) + Webhook-Fulfillment.
- `routes/ai.js`: alle KI-Routen nutzen `chargeAi(feature, ...)`; zusätzlich
  ein einfacher `GET /api/ai/credits`-Lesezugriff (von diesem Teilauftrag durch
  die reichhaltigere `GET /api/credits/wallet` für das Frontend ergänzt, siehe
  unten — beide bleiben bestehen, `ai.js` nutzt die einfache Variante intern
  nicht weiter).

### Teilauftrag 3 (dieser Teil) — Frontend, Admin, Missbrauchsschutz
- **Backend**
  - `backend/src/routes/credits.js` (neu): `GET /api/credits/wallet` (Profil-
    taugliche Zusammenfassung: Plan, Credits, Prozent, Abrechnungszeitraum,
    Topup-Pakete — ohne rohe Providerkosten) und `GET /api/credits/feature-costs`
    (reine Preisinformation für Kostenanzeigen vor teuren Aktionen).
  - `backend/src/routes/superAdmin.js`: `GET /superadmin/credits/users`
    (paginierte Liste mit Plan, Guthaben, Anbieterkosten, Anfragen, Voice-
    Minuten, Vision-/Satelliten-Zähler je Nutzer) und
    `GET /superadmin/credits/stats` (tägliche Kosten 30 Tage, Kosten pro
    Feature, verkaufte/verbrauchte Credits, Topup-Umsatz, Cost-Limit-Warnungen).
  - Härtung: `MAX_CHAT_HISTORY_MESSAGES` (Env-Override für die bereits
    bestehende History-Begrenzung in `routes/ai.js`) und `ANTHROPIC_MAX_TOKENS`
    (Env-Override für `max_tokens` in `lib/llm.js`).
- **Frontend**
  - `src/api/frontendClient.js`: Namespace `credits.*`
    (`getWallet`, `featureCosts`, `checkoutTopup`) + `superAdmin.creditsUsers`/
    `creditsStats`.
  - `src/components/credits/CreditWalletCard.jsx` (neu): Guthabenanzeige mit
    Fortschrittsbalken, abgestuften Hinweisen (<20 %, <10 %, 0) und den drei
    Optionen aus der Spezifikation (Credits kaufen, Tarif upgraden, Warten bis
    zur Erneuerung).
  - `src/pages/Profile.jsx`: neuer Abschnitt "Abo & Guthaben" mit der Karte,
    Topup-Paketauswahl (Stripe-Redirect) und dem Erneuerungsdatum. Nur
    sichtbar, wenn `/api/credits/wallet` `enabled:true` liefert.
  - `src/pages/SatelliteAnalysis.jsx`: Kostenanzeige ("Satellitenanalyse:
    250 Credits") vor dem Start, verbleibendes Guthaben danach — beides nur
    mit aktivem Credit-System.
  - `src/pages/Admin.jsx`: neuer Tab "Credits" mit den aggregierten Statistiken
    und der Nutzer-Tabelle (>80 %/>90 % Cost-Limit farblich hervorgehoben).

## 3. Geänderte Dateien

### Teilauftrag 1
- `supabase/migrations/20260926130000_credit_system_foundation.sql`
- `backend/src/lib/creditConfig.js`, `backend/src/lib/creditEngine.js`,
  `backend/src/lib/planCreditMapping.js` (+ zugehörige `.test.js`)

### Teilauftrag 2
- `backend/src/lib/aiModelRouting.js`, `backend/src/lib/walletProvisioning.js`,
  `backend/src/middleware/creditGuard.js` (+ `.test.js`)
- `backend/src/routes/ai.js` (alle `/api/ai/*`-Routen auf `chargeAi`
  umgestellt, `GET /api/ai/credits` ergänzt)
- `backend/src/routes/premium.js` (Cron, Wallet-Sync, Topup-Checkout +
  Webhook-Fulfillment)

### Teilauftrag 3 (dieser Teil)
- `backend/src/routes/credits.js` (neu) + `backend/src/routes/credits.test.js` (neu)
- `backend/src/routes/superAdmin.js` (Credits-Endpunkte ergänzt) +
  `backend/src/routes/superAdminCredits.test.js` (neu)
- `backend/src/server.js` (neue Route registriert)
- `backend/src/routes/ai.js` (`MAX_CHAT_HISTORY_MESSAGES` Env-Override)
- `backend/src/lib/llm.js` (`ANTHROPIC_MAX_TOKENS` Env-Override)
- `src/api/frontendClient.js` (`credits.*`, `superAdmin.creditsUsers/Stats`)
- `src/components/credits/CreditWalletCard.jsx` (neu)
- `src/pages/Profile.jsx` (Abschnitt "Abo & Guthaben")
- `src/pages/SatelliteAnalysis.jsx` (Kostenanzeige vor/nach der Analyse)
- `src/pages/Admin.jsx` (Tab "Credits")
- `docs/SUBSCRIPTION_CREDITS_MIGRATION.md` (dieses Dokument, neu)

## 4. Datenbankmigrationen

Einzige Migration: `supabase/migrations/20260926130000_credit_system_foundation.sql`
- Tabellen: `subscription_plans`, `user_subscriptions`, `credit_wallets`,
  `credit_transactions`, `ai_usage`, `provider_cost_periods`.
- RPCs (security definer, nur `service_role`): `reserve_ai_credits`,
  `finalize_ai_credits`, `rollback_ai_credits`, `grant_monthly_credits`,
  `add_topup_credits`.
- Dieser Teilauftrag hat **keine weitere Migration** hinzugefügt — alle neuen
  Routen lesen ausschließlich aus dem bestehenden Schema.

## 5. Neue ENV-/Secrets-Anforderungen

| Variable | Zweck | Default |
|---|---|---|
| `AI_CREDIT_SYSTEM_ENABLED` | Globaler Schalter für das gesamte Credit-System | aus (`false`) |
| `CREDIT_PLANS_JSON` | Tarif-Overrides (`includedCredits`/`costLimitEur`/`adsEnabled` je Plan) | siehe `DEFAULT_CREDIT_PLANS` |
| `CREDIT_COSTS_JSON` | Credit-Kosten je Feature-Kategorie | siehe `DEFAULT_CREDIT_COSTS` |
| `AI_MODEL_ROUTES_JSON` | Modell je Routing-Stufe (low/medium/high/vision/voice) | siehe `aiModelRouting.js` |
| `ANTHROPIC_MODEL_HIGH` | Modell für die "high"-Stufe (z. B. Satellitenanalyse) | fällt auf `ANTHROPIC_MODEL`/Default zurück |
| `ANTHROPIC_MODEL_VISION` | Modell für Bildanalysen | fällt auf `ANTHROPIC_MODEL`/Default zurück |
| `ANTHROPIC_MODEL` | Bestehendes Standardmodell (Text) | `claude-haiku-4-5` |
| `ANTHROPIC_MAX_TOKENS` | **Neu (Teilauftrag 3)**: Obergrenze für `max_tokens` je LLM-Antwort | 2048 |
| `MAX_CHAT_HISTORY_MESSAGES` | **Neu (Teilauftrag 3)**: Obergrenze für Chat-Historie je Anfrage | 50 |
| `AI_USD_TO_EUR` | Umrechnungskurs für Kostenschätzung | fester Fallback im Code |
| `AI_VOICE_COST_EUR_PER_MINUTE` | Kostenschätzung Voice | fester Fallback im Code |
| `REALTIME_SESSION_BILLED_SECONDS` | Pauschale Abrechnungsdauer für Live-Voice-Sitzungen | siehe `aiModelRouting.js`/Route |
| `CREDIT_BILLING_CYCLE_BATCH` | Batch-Größe des Cron-Endpunkts `/admin/credits/billing-cycle` | siehe `premium.js` |
| `CRON_SECRET` | Bestehendes Secret, schützt den neuen Cron-Endpunkt mit | — (bereits vorhanden) |
| `STRIPE_SECRET_KEY` | Bestehendes Secret, wird auch für Credit-Topup-Checkouts genutzt | — (bereits vorhanden) |

Alle Variablen sind optional — ohne sie gelten die im Code hinterlegten
Defaults bzw. bleibt das System komplett inaktiv (`AI_CREDIT_SYSTEM_ENABLED`
ungesetzt).

## 6. Tests und Ergebnisse

Lauf am 2026-09-26 in diesem Worktree (`npx vitest run --project backend`,
nach `npm install --legacy-peer-deps` in Root **und** `backend/`, da beide
`node_modules`-Verzeichnisse im Worktree leer waren):

```
Test Files  64 passed (64)
     Tests  669 passed (669)
```

Davon **10 neue Tests** aus diesem Teilauftrag (6 in `credits.test.js`, 4 in
`superAdminCredits.test.js`) zusätzlich zu den 659 aus Teilauftrag 1+2. Kein
bestehender Test wurde verändert oder ist rot geworden.

Frontend: `npm run build` (Vite) läuft **erfolgreich durch** (Exit 0, `dist/`
wird erzeugt). Zusätzlich `npx eslint` auf allen neuen/geänderten
Frontend-Dateien (`Admin.jsx`, `Profile.jsx`, `SatelliteAnalysis.jsx`,
`CreditWalletCard.jsx`, `frontendClient.js`) — keine Fehler oder Warnungen.

Für die in Abschnitt 5 des Auftrags genannten Missbrauchsschutz-Limits wurden
**keine zusätzlichen dedizierten Tests** ergänzt, weil die betroffenen Limits
(`MAX_CHAT_HISTORY_MESSAGES`, `ANTHROPIC_MAX_TOKENS`) reine Env-Overrides
bereits bestehender, bereits getesteter Grenzen sind (siehe Abschnitt 7 unten)
— ein eigener Test hätte nur die `Number()`-Parsing-Fallback-Logik geprüft,
nicht neues Verhalten.

## 7. Verbleibende Risiken

Konsolidiert aus allen drei Teilaufträgen:

1. **Keine Massen-Migration für Bestandsuser.** Nur Lazy-Provisioning
   (`ensureCurrentWallet` beim ersten Credit-Kontakt). Ein zahlender
   Bestandsnutzer bekommt seine erste Wallet erst beim ersten KI-Aufruf nach
   Aktivierung des Flags — bis dahin sieht `/api/credits/wallet` (und die
   Profil-Seite) noch nichts an, wo er tatsächlich steht.
2. **Keine Google-Play-Topups.** Nur Stripe-Web-Checkout. Play-Konsumgüter
   bräuchten ein eigenes `consumeAsync`-Konzept plus Server-Verifikation
   (nicht Teil dieses Zeitbudgets).
3. **Keine Last-/Nebenläufigkeitstests der SQL-RPCs.** `reserve_ai_credits`
   etc. sind nicht unter echter Parallelität gegen eine echte Postgres-Instanz
   getestet — nur die JS-Wrapper mit Mocks.
4. **Keine Live-Datenbank-Verifikation der Migration.** Die Migration wurde
   nicht gegen eine echte Supabase-Instanz angewendet (kein DB-Zugriff in
   diesem Worktree).
5. **Kosten-pro-Plan-Aggregation eingeschränkt.** `GET /superadmin/credits/stats`
   liefert bewusst **Kosten pro Feature statt pro Plan** — eine Zuordnung
   "Kosten zum Zeitpunkt der Nutzung zum damaligen Plan" bräuchte eine
   Plan-Historie, die es nicht gibt (`resolvePlan` kennt nur den aktuellen
   Plan). Im Response als `cost_by_plan_note` dokumentiert statt erfunden.
6. **Keine dedizierte Missbrauchserkennung.** Nur die einfache Cost-Limit-
   Warnung (>80 %/>90 % der Periode) in `GET /superadmin/credits/stats`. Eine
   echte Anomalie-/Abuse-Erkennung (z. B. Anfragen/Stunde über Schwellenwert,
   Muster-Erkennung) ist **nicht umgesetzt** — im Response als
   `abuse_detection_note` dokumentiert.
7. **Kein hartes Zeitlimit für `/ai/realtime-session`.** Die Abrechnung
   (`REALTIME_SESSION_BILLED_SECONDS`) deckelt die verrechneten Credits pro
   Sitzungsstart, aber es gibt kein serverseitig erzwungenes Session-Ende bei
   der OpenAI-Realtime-API selbst. Ein Nutzer könnte eine Sitzung über die
   pauschal abgerechnete Dauer hinaus offen halten — nur der Credits-Preis
   ist gedeckelt, nicht die tatsächliche WebRTC-Zeit.
8. **Kein dediziertes Research-Feature.** `buddy_research`/
   `deep_research_min`/`deep_research_max` existieren nur als Kosten-Konstanten
   in `creditConfig.js` — es gibt aktuell **keinen** Endpunkt im Code, der sie
   nutzt. Ein "Research-Limit" (Abschnitt 5 des Auftrags) betrifft daher
   nichts Bestehendes; bei Einführung einer echten Research-Funktion müsste
   das Limit dort neu bewertet werden.
9. **Bildgröße/Body-Größe:** bereits vorhandenes globales
   `express.json({ limit: '10mb' })` (`backend/src/server.js`) deckt Fotos
   (Base64 im Body) bereits ab — kein separates Multer/Upload-Middleware-Limit
   für `/analyze-photo`, `/ai/vision`, `/ai/recognize-gear` nötig, da diese
   Routen kein `multipart/form-data` nutzen, sondern JSON mit
   `image_base64`. Ein sehr großes Originalfoto kann trotzdem knapp unter
   10 MB Base64 durchgehen; ein engeres, feature-spezifisches Limit wurde
   bewusst nicht ergänzt, um bestehende Uploads nicht zu brechen, ohne einen
   konkreten Vorfall zu haben, der ein engeres Limit rechtfertigt.

## 8. Manuell zu erledigende Schritte vor Produktivschaltung

1. Migration `20260926130000_credit_system_foundation.sql` in einer
   Staging-Supabase-Instanz testen (Tabellen, RLS, RPCs).
2. Entscheiden, ob/wie Bestandsuser vor dem Flag-Wechsel migriert werden
   sollen (Skript schreiben + ausführen, falls gewünscht — siehe Risiko 1).
3. Stripe-Produkte/Preise für die vier Topup-Pakete
   (2.500/7.500/15.000/30.000 Credits, siehe `TOPUP_PACKAGES`) im
   Stripe-Dashboard anlegen, falls nicht bereits über
   `createStripeCheckoutSession` (dynamische Preise) abgedeckt — prüfen, ob
   Stripe hier feste Produkt-IDs verlangt oder die dynamische Preisangabe
   ausreicht (Teilauftrag 2 hat das bereits mit dynamischen `amountCents`
   gebaut, keine feste Produkt-ID nötig).
4. ENV-Variablen setzen (siehe Tabelle in Abschnitt 5); `AI_CREDIT_SYSTEM_ENABLED`
   zunächst **nicht** setzen.
5. Deploy mit `AI_CREDIT_SYSTEM_ENABLED` weiterhin aus durchführen (siehe
   Abschnitt 9), damit der reine Code-Merge risikofrei ist.
6. Feature-Flag zunächst nur für Test-Accounts aktivieren (z. B. per
   `CREDIT_PLANS_JSON`/gezielter Test-User, oder ein temporäres
   Staging-Deployment mit dem Flag an) und die neuen Endpunkte/Seiten manuell
   durchklicken (Profil-Seite, Satellitenanalyse-Kostenanzeige, Admin-Tab
   "Credits").
7. Cron `GET /admin/credits/billing-cycle` in der Zielumgebung (Vercel-Cron
   bzw. Docker-Cron-Container) verifizieren — Eintrag in `vercel.json` bzw.
   `docker/cron/crontab` prüfen (aus Teilauftrag 2, hier nicht erneut
   geändert).
8. Erst danach `AI_CREDIT_SYSTEM_ENABLED=true` für alle setzen.

## 9. Exakte Deployment-Anleitung

1. Diesen Branch in die Hauptentwicklung mergen (PR → Review → Merge).
2. `.github/workflows/supabase-migrations.yml` wendet die Migration beim
   Merge auf `main` automatisch an (`supabase db push`) — kein manuelles
   Einspielen.
3. ENV-Variablen in der Zielumgebung (Vercel-Projekt/Cloudflare-Backend-Worker,
   siehe `cloudflare/backend/containerEnv.js` für neue Backend-Variablen)
   setzen, **`AI_CREDIT_SYSTEM_ENABLED` zunächst auf `false`/ungesetzt lassen**.
4. Deploy durchführen. Da alle neuen Code-Pfade hinter dem Flag liegen (und
   `/api/credits/*` sowie `/superadmin/credits/*` ohne Flag 404 liefern),
   ändert sich für bestehende Nutzer nichts.
5. In einer Staging-Phase (Schritt 6 in Abschnitt 8) das Flag gezielt testen.
6. Erst wenn Staging-Tests grün sind: `AI_CREDIT_SYSTEM_ENABLED=true` in
   Produktion setzen (Redeploy/Restart je nach Plattform nötig, damit die
   neue Env-Variable geladen wird).

## 10. Rollback-Anleitung

- **Sofort-Rollback:** `AI_CREDIT_SYSTEM_ENABLED` auf `false` setzen (oder die
  Variable entfernen) und neu deployen/neustarten. Ab diesem Moment läuft
  wieder exakt das alte `meterAiTokens`-Verhalten über `chargeAi()` — kein
  Code-Rollback nötig.
- **Daten:** Die neuen Tabellen (`credit_wallets`, `credit_transactions`,
  `ai_usage`, `provider_cost_periods`, `subscription_plans`,
  `user_subscriptions`) bleiben unangetastet als Historie stehen. Es ist
  **kein Daten-Rollback nötig**, weil die Migration rein additiv ist (keine
  bestehende Tabelle/Spalte wurde verändert oder entfernt).
- **Frontend:** Die neuen Komponenten/Abschnitte (`CreditWalletCard`,
  Profil-Abschnitt, Satelliten-Kostenanzeige, Admin-Tab) blenden sich von
  selbst aus, sobald `/api/credits/wallet` wieder 404 liefert — kein
  Frontend-Rollback nötig, nur der Env-Wechsel im Backend.

## 11. Definition-of-Done-Checkliste

| # | Punkt | Status | Begründung |
|---|---|---|---|
| 1 | Wallet/Guthaben-Konzept mit Perioden | erfüllt | `credit_wallets` + `walletProvisioning.js`, Teilauftrag 1+2 |
| 2 | Atomare Credit-Buchungen (reserve/finalize/rollback) | erfüllt | RPCs + `creditEngine.js`, Teilauftrag 1 |
| 3 | Fail-closed bei DB-Ausfall (Kosten-Schutz) | erfüllt | `creditEngine.js`/`creditGuard.js`, bewusst anders als altes System |
| 4 | Modell-Routing nach Feature-Kategorie | erfüllt | `aiModelRouting.js`, Teilauftrag 2 |
| 5 | Alle `/api/ai/*`-Routen hinter dem neuen Guard | erfüllt | `chargeAi()` in `routes/ai.js`, Teilauftrag 2 |
| 6 | Stripe-Topup-Checkout + Webhook-Fulfillment | erfüllt | `routes/premium.js`, Teilauftrag 2 |
| 7 | Google-Play-Topups | offen | Kein Konsumgut-Flow implementiert (Risiko 2) |
| 8 | Cron für Abrechnungszyklus | erfüllt | `GET /admin/credits/billing-cycle`, Teilauftrag 2 (dieser Teilauftrag hat den Cron-Eintrag nicht erneut geprüft, siehe Schritt 7 in Abschnitt 8) |
| 9 | Nutzer-seitige Wallet-Anzeige (API) | erfüllt | `GET /api/credits/wallet`, dieser Teilauftrag |
| 10 | Nutzer-seitige Wallet-Anzeige (UI, Profil) | erfüllt | `CreditWalletCard.jsx` + Profile.jsx, dieser Teilauftrag |
| 11 | Kostenanzeige vor teurer KI-Aktion | erfüllt | `SatelliteAnalysis.jsx` (ein Beispiel wie gefordert, nicht alle Tool-Seiten) |
| 12 | Admin-Übersicht Nutzer/Kosten | erfüllt | `GET /superadmin/credits/users`, Admin-Tab "Credits" |
| 13 | Admin-Aggregatstatistik | teilweise | Kosten pro Feature statt pro Plan (Risiko 5), Topup-Umsatz zurückgerechnet statt direkt gespeichert |
| 14 | Cost-Limit-Warnungen (80 %/90 %) | erfüllt | in `GET /superadmin/credits/stats` + Tabellen-Hervorhebung |
| 15 | Abuse-/Anomalie-Erkennung | offen | Nur Cost-Limit-Schwelle, keine Muster-/Frequenz-Erkennung (Risiko 6) |
| 16 | Max. Chat-Historie konfigurierbar | erfüllt | `MAX_CHAT_HISTORY_MESSAGES`, bereits vorhandene Begrenzung (50) jetzt per Env |
| 17 | Max. Tokenzahl konfigurierbar | erfüllt | `ANTHROPIC_MAX_TOKENS` in `llm.js` |
| 18 | Bildgrößenlimit für Uploads | teilweise | Über globales `express.json({limit:'10mb'})` abgedeckt, kein feature-spezifisches engeres Limit (Risiko 9) |
| 19 | Voice-Session-Limit | teilweise | Nur Credits-Abrechnung gedeckelt (`REALTIME_SESSION_BILLED_SECONDS`), kein hartes Server-seitiges Zeitlimit (Risiko 7) |
| 20 | Massen-Migration Bestandsuser | offen | Bewusst nicht gebaut, nur Lazy-Provisioning (Risiko 1) |

**Zusammenfassung:** 13 von 20 Punkten vollständig erfüllt, 4 teilweise
(begründete Einschränkungen dokumentiert), 3 offen (bewusst nicht gebaut, da
außerhalb des Zeitbudgets bzw. ohne echte Datengrundlage — siehe jeweilige
Begründung statt Platzhalter-Code).
