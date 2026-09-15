# BaitBuddy — Entwicklungsrichtlinien für Claude

## 🎯 Projekt-Übersicht
**BaitBuddy** ist eine Angel-App mit AI-gestütztem KI-Buddy. Technisch ist es eine **Vite + React 18 Web-App**, die für Android per **Capacitor** in einen WebView verpackt wird (die Android-Hülle lädt aktuell die Live-Vercel-Site). Backend läuft als Express-App auf Vercel Serverless, Datenspeicher auf Supabase.

> Wichtig: Es ist **kein** React Native/Expo und **kein** Firebase. „Device-Features" nutzen Browser-Web-APIs im WebView. Supabase-**Realtime** wird derzeit **nicht** verwendet — der Datenzugriff läuft über einen eigenen REST-Client (`src/api/frontendClient.js`) gegen das Backend.

## 📋 Sprache & Kommunikation
- **Immer auf Deutsch antworten** (Erklärungen, Zusammenfassungen, Text)
- Code, Commits und PR-Titel dürfen englisch sein, wo technisch sinnvoll
- Keine Ankündigungen von Check-ins beim PR-Watching (einfach im Hintergrund erledigen)

## 🚫 Code-Standards: Keine Platzhalter, keine dekorativen Emojis

### Platzhalter absolut verboten
Keine `TODO`-Stubs, `Lorem ipsum`, Mock-Werte, leere „Coming soon"-Hülsen oder Dummy-Daten im produktiven Code. **Immer echte, funktionierende Implementierungen mit echten Daten und echten API-Anbindungen liefern.** Falls Information fehlt → nachfragen statt Platzhalter setzen.

### Emojis: Funktional ja, dekorativ nein
- ❌ **Keine** dekorativen Emojis in UI-Text, Labels, Buttons, Überschriften, Fehlermeldungen, Toasts oder `console.log`
- ✅ **Funktionale Emojis bleiben**: 
  - Länder-/Sprach-Flaggen (z. B. `LanguageSwitcher.jsx`: `🇩🇪`, `🇬🇧`)
  - Marker-Icons auf der Karte (z. B. Fisch-Spot = `icon`-Datenfeld)

**Faustregel:** Emoji als Datenwert für ein Icon? Funktional → bleibt. Emoji dekorativ im Text? → weg, ggf. durch `lucide-react`-Icon ersetzen.

---

## 🏗️ Tech-Stack

| Layer | Technologie |
|-------|-------------|
| **Frontend** | Vite 6 + React 18 (JSX), Tailwind, Radix/shadcn-UI, React Router, TanStack Query |
| **Mobile-Wrapper** | Capacitor 6 (Android-WebView) |
| **Backend** | Express (Node.js) auf Vercel Serverless (`backend/`, gemountet über `api/[...path].mjs`) |
| **Datenbank & Auth** | Supabase (Postgres, GoTrue-Auth, Storage) — Zugriff über eigenen REST-Client, **kein** Realtime |
| **LLM** | Anthropic Claude (Messages API) für Chat & Vision; OpenAI Realtime (optional) für Voice; ElevenLabs (optional) für TTS |
| **Package Manager** | npm mit legacy peer deps (`--legacy-peer-deps`) |
| **CI/CD** | GitHub Actions (Web-Deploy via Vercel, Android-AAB-Build). **Kein Fastlane, keine iOS-Pipeline.** |

---

## 🔑 Auth-Architektur: Zwei Session-Systeme

Die App nutzt **absichtlich zwei parallele Auth-Pfade**, beide aktiv:

### 1. `bb_token` / `bb_refresh` (Haupt-Pfad für E-Mail/Passwort)
- Stored in `localStorage` (reine Strings)
- Login via Backend-Proxy: `POST /api/auth/login` → Server-seitig `supabase.auth.signInWithPassword` (Service-Role-Client)
- Refresh: Nur über 401-getriggerter eigener Mechanismus (`ApiClient._refreshSession()` → `POST /api/auth/refresh`)
- Location: `src/api/frontendClient.js`

### 2. Browser-Supabase-Session (nur OAuth + Passwort-Reset)
- `signInWithOAuth` für Social-Login
- `resetPasswordForEmail` / `updateUser` für Passwort-Handling
- Synchronisierung in `bb_token`/`bb_refresh` via `AuthCallback.jsx` / `ResetPassword.jsx`
- `AuthContext.jsx` hält zentralen `onAuthStateChange`-Listener (SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED)
- Location: `src/api/supabaseClient.js`

### ⚠️ Kritisch
`autoRefreshToken` ist in `supabaseClient.js` **deaktiviert**, um Token-Konflikt zu vermeiden (nur `bb_token`-Refresh ist aktiv). Eine vollständige Konsolidierung wurde bewusst zurückgestellt (zu großer Eingriff, OAuth nicht offline verifizierbar). **Bei zukünftigen Auth-Änderungen diese Dualität beachten.**

---

## 🤖 KI-Buddy (CloudMD) — Kernfeature

Der **KI-Buddy** ist zentrales Feature mit oberster Priorität. Muss reibungslos, stabil und performant laufen.

### Anforderungen
- Intuitive Konversations-UI
- Kontext-bewusste Antworten (Spot-Info, Wetter, Köder-Tipps)
- Schnelle Response-Zeit (< 2 Sek. Latenz)
- Funktioniert auch offline (gecachte Responses)
- Personalisierte Empfehlungen basierend auf User-History

### Architektur
- **Frontend**: verteilt über mehrere Stellen (es gibt **kein** `src/components/KiBuddy/`-Verzeichnis):
  - `src/components/layout/AIBuddyWidget.jsx` — das schwebende Chat-Widget (Haupt-Surface)
  - `src/pages/KiBuddyBeta.jsx` — eigenständige Voice-Buddy-Seite
  - `src/components/ai/`, `src/components/chatbot/`, `src/components/home/MiniKiBuddy*.jsx`
  - Hooks: `useChatMessages`, `useSpeechRecognition`, `useElevenLabsVoice`
  - `src/lib/buddyGreetings.js` — Start-Begrüßungs-Generator: begrüßt per Sprechblase + TTS, variiert nach Tageszeit/Stimmung/Event-Status (Anti-Wiederholung via localStorage). Wiederholung gesteuert über **Zeitstempel-Cooldown** (`shouldGreet`/`markGreeted`, localStorage `bb_buddy_last_greeting`, Default 15 Min) statt eines Session-Flags — nötig, weil im Capacitor-WebView eine Sitzung das Wiederöffnen (Resume) überlebt. Ausgelöst im `AIBuddyWidgetStub` beim Mount **und bei `visibilitychange` (Foreground-Resume)**; das volle Widget und `KiBuddyBeta` nutzen denselben Generator. `getVariedPageBubble` rotiert die Seiten-Blase (Seitenfrage/Buddy-Frage/Funktions-Tipp).
  - `src/lib/audioUnlock.js` — `runWhenAudioReady(fn)`: Browser/WebView blockieren Audio-Wiedergabe ohne vorherige Nutzer-Geste (Autoplay-Policy). Die Start-Begrüßung wird deshalb **beim ersten Antippen** entsperrt/nachgeholt; alle Begrüßungs-TTS-Aufrufe laufen über diesen Helfer.
- **Backend**: `backend/src/routes/ai.js` (`POST /api/ai/chat` u. a.) mit `backend/src/lib/llm.js` für die LLM-Anbindung. (Es gibt **kein** `api/routes/kibuddy.js`.)
- **„Quasi live"-Sprachausgabe (Streaming-Pipeline)**: Widget (`AIBuddyWidget`) und `KiBuddyBeta` streamen die Antwort, damit der erste Satz spricht, **bevor** die ganze Antwort fertig ist. Drei Schichten:
  1. **Gestreamte LLM-Antwort**: `POST /api/ai/chat/stream` (SSE) mit `invokeLLMStream` in `llm.js` (Anthropic Messages `stream:true`, SSE-Events `content_block_delta`/`text_delta`); der geteilte Prompt-Aufbau steckt in `buildChatPrompt(req)` (von `/ai/chat` und `/ai/chat/stream` genutzt). Der `<<ACTION>>`-Block wird am Stream-Ende aus dem Volltext extrahiert und im `done`-Event mitgeliefert. Client: `ai.chatStream(messages, userLocation, { onDelta, signal })` in `frontendClient.js` (SSE-Reader). **Fällt bei Stream-Fehler automatisch auf `ai.chat` zurück** (Vercel-SSE-Risiko abgesichert).
  2. **Satzweise TTS-Queue**: `createSpeechQueue`/`splitIntoSentences` in `elevenLabsTTS.js` — spricht Sätze in Reihenfolge und prefetcht den nächsten schon während der aktuelle läuft (Pipelining). `stripActionMarker` (`src/lib/streamingReply.js`) hält den Aktions-Block aus Anzeige und TTS heraus. Nutzt denselben Audio-Singleton/Generation-Token wie `speakWithElevenLabs` (neuer Turn/`cancelElevenLabs` bricht die Queue ab). `speakWithFallback` bleibt für Einzel-Ansagen (Begrüßungen, Offline-/Fehler-Fallbacks).
  3. **Schnelles ElevenLabs-Modell**: Default `eleven_flash_v2_5` (~75 ms statt Sekunden, spricht Deutsch) + kompaktes `output_format` in `multiProviderTTS.js`; per Env `ELEVENLABS_MODEL_ID`/`ELEVENLABS_OUTPUT_FORMAT` auf das Qualitätsmodell umschaltbar.
- **Wissensbasis**: `backend/src/lib/buddyKnowledge.js` — zentrale Praxis-Wissensbasis (Köderführung, Montagen, Unterwasser-Köderbox, Knoten, Drill, Saisonwissen), Gesprächsstil-Regeln (variierende Rückfragen: humorvoll/nachdenklich/neugierig/direkt) und App-Funktionswissen (der Buddy erklärt jede App-Funktion ausführlich und bietet passende Handgriffe aktiv an, z. B. „Sag einfach: Karpfen ins Fangbuch") plus verbindliche Anleitungs-Regeln: Bei „Wie benutze/montiere/führe ich X?"-Fragen erklärt der Buddy **immer selbst Schritt für Schritt** (Montage → Einsatz im Wasser → Führung → Bisserkennung → typische Fehler) und verweist **nie** nur auf Tutorials. Eingebunden in `POST /api/ai/chat` (System-Prompt) und `POST /api/ai/realtime-session` (Voice-Instructions). Wissens-Erweiterungen gehören in dieses Modul, nicht in einzelne Routen-Prompts.
- **Datenbank**: Supabase-Tabellen (`catches`, `spots`, `rule_entries` …) liefern den Kontext; Chat-Historie wird clientseitig gehalten.
- **LLM**: **Anthropic Claude über Anthropic Cloud API** — natives `fetch` gegen die Messages API (`https://api.anthropic.com/v1/messages`) in `backend/src/lib/llm.js`. EIN Modell für Text UND Vision, Default `claude-haiku-4-5` (schnellstes Modell, hält das < 2 Sek.-Latenz-Ziel), per Env `ANTHROPIC_MODEL` umschaltbar (z. B. `claude-opus-4-8`). Der Key wird über `getAnthropicKey()` tolerant gelesen (`ANTHROPIC_API_KEY` bzw. `sk-ant-…`-Varianten). Der Aufruf erfolgt serverseitig, nie direkt vom Frontend. **Anthropic Cloud API ist der einzige LLM-Provider; andere Anbieter sind nicht gestattet.**
  - ⚠️ **Regel: Nur Anthropic Cloud API als LLM-Quelle** — Alle LLM-Anfragen müssen über Backend-Endpoints mit Anthropic gehen (`POST /api/ai/chat`, `POST /api/ai/realtime-session`, `POST /api/ai/vision` u.ä.). Frontend darf keine LLM-Libraries direkt verwenden. Das verhindert API-Key-Exposure, reduziert Bundle-Size und zentralisiert Kontextverwaltung serverseitig.
- **TTS-Stimmen**: `POST /api/ai/tts` (ElevenLabs) kennt zwei Stimmen: männlich „Daniel" (Standard, alle Pläne) und weiblich „Matilda" (**nur Ultimate**, Plan-ID `elite`/Friends-Level). Das Plan-Gate sitzt **serverseitig** (`backend/src/lib/planResolver.js`, geteilt mit `premium.js`) — ohne Ultimate fällt der Server still auf die Standardstimme zurück. Die Auswahl liegt in den Audio-Einstellungen (`VoiceSettings.jsx`), gespeichert via `src/lib/ttsVoice.js` (localStorage `buddy-tts-voice`); `elevenLabsTTS.js` sendet die Wahl bei jedem TTS-Aufruf mit. Env-Overrides: `ELEVENLABS_VOICE_ID` (männlich), `ELEVENLABS_VOICE_ID_FEMALE` (weiblich).
  - ⚠️ **Regel: Nur die ElevenLabs-Stimme** — Die App spricht ausschließlich mit der natürlichen ElevenLabs-Stimme über die zentrale Utility `src/components/utils/elevenLabsTTS.js` (`speakWithFallback` = spricht und löst nach Wiedergabe-Ende auf; „Fallback" bedeutet **Stille** bei Fehlern, nicht Roboterstimme). Die frühere Browser-TTS (`speechSynthesis`, `browserTTS.jsx`) wurde komplett entfernt und darf **nicht** wieder eingeführt werden — schlägt ElevenLabs fehl (offline, kein API-Key), bleibt die Ausgabe still und der Text steht im Chat. Überlappende TTS-Aufrufe werden per Generation-Token in `elevenLabsTTS.js` verworfen (keine Doppelstimmen).

### Dev-Checkliste
- [ ] Keine Platzhalter in KI-Responses (echte Kontextdaten)
- [ ] Fehlerbehandlung robust (Timeout, API-Fehler, Offline)
- [ ] Unit & Integration Tests für KI-Logik
- [ ] Performance-Test (Response < 2 Sek.)
- [ ] Accessibility (Screen Reader, Mobile)
- [ ] App Store Review vorbereitet (Privacy, Datenhandling dokumentiert)

---

## 🎣 3D-Köderanimation (Seite `Koeder3D`)

Zeigt Kunstköder (Wobbler, Gummifisch am Jigkopf, Spinner, Blinker, Popper/Stickbait) als 3D-Animation mit echtem Laufverhalten (Jiggen, Faulenzen, Stop-and-Go, Twitchen, Walk the Dog).

- **Architektur**: `src/pages/Koeder3D.jsx` (Route manuell in `App.jsx` registriert, CatchStats-Muster) + Modul `src/components/lures3d/`:
  - `LureScene.jsx` — einzige React↔three.js-Brücke (Renderer, PMREM-Environment, RAF-Loop, Dispose, `webglcontextlost`-Rebuild, RAF-Pause bei `visibilitychange`)
  - `lureModels.js` — **prozedurale** Modelle aus three.js-Grundgeometrien + Canvas-Texturen. Bewusste Entscheidung: **keine GLB/GLTF-Assets** (APK-Gewicht, Offline-Fähigkeit, Lizenzfreiheit); Realismus über `MeshPhysicalMaterial` (Clearcoat/Metalness) + `RoomEnvironment`-Lighting + ACES-Tone-Mapping
  - `lureAnimator.js` — parametrisches Bewegungsmodell, reine Mathematik ohne three.js-Import (unit-testbar ohne WebGL)
  - `underwaterEnvironment.js` — Wasseroberfläche, Grund, Schwebeteilchen; „Laufband"-Modell (Köder bleibt am Ursprung, Umgebung scrollt)
- **Daten**: `src/data/lureGuide.data.js` — Technik-Texte (fachlich konsistent zu `buddyKnowledge.js`, bewusst nicht von dort importiert) + Animations-Parameter pro Führungsstil
- **Geteilt**: `src/lib/three/SimpleOrbitControls.js` (aus `ARWater3D.jsx` extrahiert, `minDistance` konfigurierbar) — bei Änderungen beide Nutzer (AR-Seite + Koeder3D) testen
- **Performance-Regeln**: pixelRatio-Cap (2, bei `deviceMemory <= 2` → 1.5), 256px-Canvas-Texturen, keine Shadow-Maps (Kontaktschatten als Gradient-Plane), kein `transmission`-Material, vollständiges Dispose bei Köderwechsel und Unmount
- **Buddy-Anbindung**: Eintrag in `APP_FEATURE_KNOWLEDGE`; Voice-Navigation über `voicePages.js` (Aliase u. a. `köderanimation`, `laufverhalten`)

---

## 🔔 Aktions-Benachrichtigungen (Trip, Fang, Alarm …)

Nach jeder erfolgreichen Mutation zeigt die App eine System-Benachrichtigung
(Trip erstellt/aktualisiert/aktiviert/gelöscht, Fang gespeichert, Spot
gespeichert, Wetter-Alarme aktualisiert, Gear ergänzt, Event erstellt).
Zentraler Helfer: `src/lib/actionNotifications.js` mit:

- `notifyAction(title, { body, tag, url })` — delegiert an
  `showSystemNotification` in `src/lib/systemNotification.js`.
- ⚠️ **Regel: Nie `new Notification(...)` direkt aufrufen.** Der Konstruktor ist
  auf Android (Chrome/WebView) ein *Illegal constructor* und auf iOS gar nicht
  vorgesehen — beide Plattformen erlauben ausschließlich
  `ServiceWorkerRegistration.showNotification()`. `showSystemNotification`
  nimmt deshalb immer zuerst die SW-Registrierung (`/sw.js` wird in
  `Layout.jsx` registriert) und fällt nur auf Desktop-Browsern ohne Service
  Worker auf den Konstruktor zurück. Der Klick landet dadurch im
  `notificationclick`-Handler von `public/sw.js`, der ein offenes App-Fenster
  fokussiert und zur Route aus `data.url` navigiert.
- **Bekannte Grenze:** Im Capacitor-Android-WebView gibt es die
  Web-Notifications-API überhaupt nicht (`'Notification' in window` ist dort
  `false`) — die Aktions-Benachrichtigungen bleiben in der gepackten App still.
  Sie funktionieren in Android-Chrome, in der installierten PWA (WebAPK) und in
  der iOS-Home-Screen-PWA ab 16.4. Für die gepackte App wäre ein natives
  Notification-Plugin nötig (dann auch `POST_NOTIFICATIONS` im Manifest).
- `actionMessages.*` — vorgefertigte, konsistent formulierte Texte pro
  Aktion (keine dekorativen Emojis, deutsche Sprache).
- Beim ersten Aufruf wird die OS-Permission einmal angefragt (`ensurePermission`).
  Ablehnung merken wir uns in `localStorage.bb_action_notifications_prompted`,
  damit der Nutzer nicht bei jeder Aktion erneut gefragt wird.
- User-Toggle über `Settings → Benachrichtigungen`
  (`src/components/settings/ActionNotificationSettings.jsx`), speichert in
  `localStorage.bb_action_notifications_enabled`.
- In-Memory-Dedupe pro `tag` (4 s), damit Doppelklicks nicht zwei
  Notifications erzeugen.

Bewusst KEINE Server-Push-Infrastruktur: die Aktionen laufen lokal, die
Bestätigung darf lokal bleiben — das erspart FCM/APNS und passt zur
Vercel-/Supabase-only-Regel. Für zeitversetzte Warnungen (Solunar, Tide,
Wetter) bleibt `src/services/NotificationService.js` zuständig.

## 💳 Plan-Kauf (Premium)

Zwei Kaufwege, je nach Umgebung — die Premium-Seite (`src/pages/PremiumPlans.jsx`)
zeigt immer nur den passenden:

- **Android-App**: Google Play Billing über die native Brücke
  (`android/.../BillingManager.java` + `AndroidBillingBridge.java`, im WebView
  als `window.AndroidBilling`). Play-Pflicht für digitale Güter.
- **Browser**: Stripe-Checkout (`POST /api/premium/checkout` →
  `createStripeCheckoutSession`, `mode: 'payment'`), Rücksprung auf
  `/PremiumPlans?checkout=success&plan_id=…&session_id=…`.

Beide Wege enden bei **`POST /api/premium/activate`**, das die Zahlung
serverseitig beim Anbieter verifiziert (`backend/src/lib/purchaseVerification.js`)
und erst dann den Plan in die User-Metadaten schreibt. Preise sind
ausschließlich serverseitig (`CHECKOUT_PLANS`); der Client sendet nur die
`plan_id`.

### Regeln, die beim Anfassen dieses Pfads gelten

- **Google-Play-Abos bestimmen ihr Ablaufdatum selbst.** `/premium/activate`
  übernimmt `expiryTimeMillis` aus der Play-Verifikation als
  `premium_expires_at`; nur ohne dieses Feld (Stripe, Einmalprodukte) rechnet
  der Server selbst (`PLAN_DURATION_DAYS`, Default 30 Tage). Play verlängert Abos
  automatisch **unter demselben purchaseToken** — ein reiner Token-Replay-Schutz
  würde die Verlängerung verschlucken und zahlende Nutzer aussperren. Deshalb
  darf ein erneuter Aufruf die Laufzeit fortschreiben, wenn der Anbieter ein
  späteres Ablaufdatum bestätigt (`extendsRuntime`). Die Antwort trägt
  `updated: true|false`.
- **Bezahlt ≠ freigeschaltet.** Zwischen Zahlung und Aktivierung liegt ein
  API-Aufruf, der scheitern kann. Beide Wege heilen sich selbst:
  - Play: `startGooglePlayReconciliation()` (`googlePlayBilling.jsx`, gestartet
    im `PlanProvider`) fragt bei Start und bei jedem Foreground-Resume die
    aktiven Käufe ab und meldet sie still an den Server. Nativ liefert
    `MainActivity.onResume` → `queryActivePurchases(true)` dieselben Daten.
  - Stripe: Der Kauf wird vor der Aktivierung in `localStorage.bb_pending_checkout`
    festgehalten und beim nächsten Öffnen der Premium-Seite erneut aktiviert —
    bis der Server bestätigt oder endgültig ablehnt (400/403).
- **Vor dem Kauf prüfen, ob der Server verifizieren kann.** `GET /api/premium/config`
  (öffentlich) meldet, welche Zahlungswege konfiguriert sind
  (`STRIPE_SECRET_KEY` / `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`). Fehlt das Secret,
  sperrt die UI den Kauf-Button — sonst zahlt der Nutzer erst und bekommt danach
  einen 501. Schlägt die Abfrage fehl, wird **nicht** gesperrt (fail-open).
- **Plan-Rangfolge an zwei Stellen spiegeln:** `backend/src/lib/planResolver.js`
  (`PLAN_RANK`) und `src/components/premium/planHierarchy.jsx`
  (`PLAN_HIERARCHY`). Laufen sie auseinander, schaltet der Server etwas frei,
  das die UI sperrt (oder umgekehrt). Das bezahlte Einmalprodukt `trial_10_10`
  (10 Tage Vollzugriff) liegt auf Ultimate-Niveau.
- **Kauf direkt nach App-Start:** Play Billing verbindet sich asynchron. Ein
  Kaufwunsch, der auf Verbindung/Produktdetails wartet, wird in
  `BillingManager` gepuffert und ausgeführt, sobald die Details da sind
  (Timeout 15 s) — kein sofortiger „Billing service not ready"-Fehler.

## 🎁 Freundschafts-Empfehlung (Login-Popup)

Nach dem Einloggen erscheint auf dem Dashboard das `ReferralInvitePopup`
(`src/components/referral/ReferralInvitePopup.jsx`). Es zeigt den persönlichen
Einladungslink des Nutzers und bewirbt die Belohnung: **1 Woche Ultimate pro
erfolgreich eingeladenem Freund**. Das Popup rotiert alle 72h (localStorage
`bb_referral_popup_last_shown`), damit es nicht bei jedem Login nervt.

- **Referral-Code**: 8-stellig, alphanumerisch, generiert vom Backend beim
  ersten `GET /api/referrals/me`. Gespiegelt in `user_metadata.referral_code`
  (fürs Frontend) UND in der Tabelle `user_referral_codes` (Reverse-Lookup —
  Supabase-JS kann nicht auf `auth.users.user_metadata` filtern).
- **Einlösen**: `POST /api/referrals/redeem` (`backend/src/routes/referrals.js`).
  Home.jsx nimmt `?ref=CODE` aus der URL und speichert ihn in
  `localStorage.bb_pending_referral_code`; das Popup löst ihn nach dem Login
  einmalig ein. Der eingeladene Nutzer bekommt `referred_by` in seinen
  Metadaten gesetzt (verhindert Doppel-Einlösung); die `referrals`-Tabelle
  hat zusätzlich `UNIQUE(referred_user_id)` als strukturelle Absicherung.
- **Belohnung (Anmeldung)**: 7 Tage werden an die bestehende Ultimate-Laufzeit
  angehängt (oder ab jetzt +7 Tage, falls kein aktiver Ultimate-Plan). Ein bereits
  höherer Plan (`friends`) wird **nicht** herabgestuft. Der Server pflegt
  `referral_reward_count` in den Metadaten des Referrers.
- **Belohnung (Basic-Kauf des Freundes)**: Aktiviert ein eingeladener Nutzer
  erstmals den **Basic**-Plan, bekommt sein Referrer **10 € Rabatt auf den
  nächsten Ultimate-Kauf** gutgeschrieben — gedeckelt bei 3 Freunden (30 €).
  Gespeichert als `ultimate_discount_cents` in den Referrer-Metadaten, idempotent
  über `referrals.basic_reward_granted` (Migration `20260727180343_referral_basic_reward.sql`).
  Der Rabatt wird beim **Stripe-Web-Checkout** (`POST /api/premium/checkout`,
  nur `elite`) vom Preis abgezogen (Mindestbetrag 9,99 €) und bei erfolgreicher
  Ultimate-Aktivierung wieder auf 0 gesetzt. Google Play nutzt feste SKUs → dort
  kein dynamischer Rabatt. Logik in `backend/src/routes/premium.js`.
- **Migration**: `supabase/migrations/20260727180333_create_referrals_tables.sql`
  (Tabellen `user_referral_codes` + `referrals`, RLS: nur Lesen der eigenen
  Zeilen, Insert/Update ausschließlich vom Backend über die Service-Role).

## 🗓️ Events — Auswahl & Lebenszyklus

Die **Event-Auswahl** (Event-Vorlage wählen und starten) lebt auf der
Events-Hauptseite (`src/pages/Events.jsx`, Nav „Event", Route `/Events`) über die
Komponente `src/components/events/EventLauncher.jsx` (`GET /api/events/templates`,
Start via `POST /api/events`). Sie ist **nicht** mehr in der Community-Sektion
(`CompetitionsSection.jsx`) — dort bleibt nur der Wettbewerbs-Launcher
(`CompetitionLauncher`).

**Auto-Archivierung & Ausblenden** laufen im täglichen Cron
`GET /api/admin/events/auto-archive` (`vercel.json`, 02:00 UTC,
`backend/src/routes/events.js`) in zwei Schritten:
1. Abgelaufene aktive Events (`status='active'` & `end_date < now`) werden mit
   finalen Rankings archiviert (`status='ended'`), bleiben aber sichtbar
   (finale Rangliste einsehbar).
2. Beendete Events, deren Ende länger als `EVENT_AUTO_DELETE_DAYS` (Default 3 Tage)
   zurückliegt, werden per **Soft-Delete** (`is_active=false`) aus der Liste
   ausgeblendet. `GET /api/events` filtert nur `is_active=true`. Kein Hard-Delete —
   `event_participants`/`event_submissions`/Punkte-Historie bleiben erhalten.

## 🗄️ Datenbank-Migrationen (automatisierter Deploy)

Schema-Änderungen gehören **ausschließlich** in `supabase/migrations/` und werden
vom Workflow `.github/workflows/supabase-migrations.yml` automatisch angewendet:
PR → Trockenlauf, Merge auf `main` → `supabase db push`, täglich 03:00 UTC →
Drift-Kontrolle (schlägt fehl, wenn Repo-Migrationen auf der DB fehlen).
Details in `supabase/README.md`.

- **Dateiname zwingend `<14-stelliger Zeitstempel>_<name>.sql`** (via
  `npx supabase migration new <name>`). Kürzere Präfixe brechen den Abgleich mit
  `supabase_migrations.schema_migrations` — die CLI hält die Migration dann für
  unangewendet und führt sie erneut aus.
- **Nicht mehr von Hand einspielen** (Dashboard/Management-API vergeben eigene
  Zeitstempel und erzeugen genau die Drift, die das Referral-System monatelang
  live lahmgelegt hat).
- **Idempotent schreiben** (`if not exists`). Ausnahme: `CREATE POLICY` kennt kein
  `IF NOT EXISTS` → vorher `drop policy if exists`. Bei Indizes prüft
  `IF NOT EXISTS` nur den **Namen**, nicht die Spalten-Abdeckung.
- Secrets `SUPABASE_ACCESS_TOKEN` und `SUPABASE_DB_PASSWORD` müssen in den
  Repository-Secrets gesetzt sein, sonst schlägt der Deploy bewusst fehl.

## 📱 Device-Features (Pflicht)

| Feature | Anforderung |
|---------|-----------|
| **Kamera** | Fotos von Fängen, Ködern, Spots |
| **GPS/Location** | Spot-Tracking, Kartenfunktion, Geotagging |
| **Offline-Sync** | Lokale Speicherung, async. Supabase-Sync |
| **Push Notifications** | Wetter-Warnungen, Events, Community-Updates |

**Regel:** Permissions immer präzise checken, niemals blind anfordern.

### Geräteverbindung (BLE / Device Hub)
Der **Device Hub** (`src/components/devices/DeviceHub.jsx`) verbindet echte
Hardware per **Web Bluetooth** (Herzfrequenz-Sensoren, Waagen, Rollen, castable
Echolote, Umwelt-Sensoren). Verbindungen müssen **stabil und zuverlässig** sein:
- **Zeitlimit** auf jeden Verbindungsaufbau (`gatt.connect()` kann im WebView
  sonst unendlich hängen) — via `withTimeout` aus `src/lib/bleConnection.js`.
- **Automatischer Reconnect** bei unerwartetem `gattserverdisconnected` mit
  Exponential-Backoff + Jitter (`retryWithBackoff`/`computeBackoffDelay`); nutzt
  das vorhandene Geräte-Handle, **kein** erneuter `requestDevice`-Dialog.
- **Manuelles Trennen** setzt `manualDisconnect` und unterdrückt den Reconnect.
- **Vollständiges Cleanup beim Unmount**: alle GATT-Handles trennen, laufende
  Reconnects abbrechen, Kamera-Stream stoppen (sonst leaken Verbindungen).
- **Keine Stale-Closures**: HR-Session-Zustand läuft über Refs, damit die beim
  Verbinden registrierten BLE-Listener stets aktuelle Werte sehen.
- `requestDevice` **immer innerhalb der Nutzergeste** (nicht Timeout-gewrappt).

Die reine Timeout-/Backoff-/Retry-Logik liegt in `src/lib/bleConnection.js`
(ohne GATT-Import, unit-testbar; Tests in `bleConnection.test.js`).

---

## 📐 Plattform-Kompatibilität (Android-WebView & Apple/WebKit)

Die App muss auf dem ältesten unterstützten Android-WebView (**90**, siehe
`capacitor.config.json → android.minWebViewVersion`) und auf iPhones/iPads ab
**iOS 14** laufen. Daraus folgen drei verbindliche Regeln:

1. **Build-Target ist nicht `esnext`.** `vite.config.js` baut gegen
   `['es2020', 'chrome90', 'safari14', 'edge90', 'firefox90']`. Mit `esnext`
   landet moderne Syntax (private Klassenfelder, logische Zuweisungen)
   unverändert im Bundle — ältere Engines scheitern schon am Parsen und zeigen
   nur einen weißen Screen.
2. **Keine jungen Web-APIs ohne Fallback.** Besonders `AbortSignal.timeout`
   (Chrome 103 / Safari 16) und `AbortSignal.any` (Chrome 116 / Safari 17.4)
   sind jünger als unsere Zielplattformen. Beide laufen deshalb ausschließlich
   über `src/lib/abortCompat.js` (`timeoutSignal`, `anySignal`). Gleiches gilt
   für `crypto.randomUUID` (Chrome 92 / Safari 15.4) — immer mit Guard.
3. **iOS-Sensoren brauchen eine Nutzer-Geste.** Orientierungs-Events liefert
   iOS erst nach `DeviceOrientationEvent.requestPermission()` aus einem
   Tap heraus, und die Nordreferenz steht dort in `webkitCompassHeading`
   (nicht in `alpha`, `deviceorientationabsolute` gibt es auf iOS nicht).
   Gekapselt in `src/lib/deviceOrientation.js`.

**Android-Manifest:** Der WebView reicht eine Web-Permission nur weiter, wenn
die passende Android-Permission deklariert ist. `CAMERA`,
`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO` und
`ACCESS_NETWORK_STATE` stehen deshalb in `AndroidManifest.xml` (mit
`uses-feature required="false"`, damit Play keine Geräte ausschließt).
`allowBackup` ist **aus** (`data_extraction_rules.xml`): Im localStorage liegen
`bb_token`/`bb_refresh` und die dürfen nicht ins Google-Drive-Backup wandern.

## ⚡ Performance-Anforderungen

- **App-Start:** < 3 Sekunden (Tap → UI bereit)
- **Low-End-Geräte:** Funktioniert mit ≤2GB RAM
- **Offline-First:** Core-Features funktionieren ohne Internet
- **KI-Buddy Response:** < 2 Sekunden

**Regel:** Immer auf echten Devices testen (nicht nur Simulator/Emulator).

---

## 🏭 Infrastruktur: Cloudflare & Supabase (Migration von Vercel)

> **Migration in Arbeit (Vercel → Cloudflare):** Der Code ist Cloudflare-tauglich
> vorbereitet (Front-Door-Worker `cloudflare/worker.js`, Pages-`_headers`,
> `cf-connecting-ip` im Rate-Limiter, Env-gesteuerte Origins, generischer
> `READ_ONLY_FS`-Guard). Ziel: SPA über Cloudflare (Static Assets/Pages),
> Express-Backend als **Cloudflare Container** (`docker/backend.Dockerfile`),
> Crons als **Cron Triggers**. Deploy/Domain sind noch offen — bis dahin läuft
> die Live-Site auf Vercel. Details: `docs/CLOUDFLARE_MIGRATION.md`.

- ✅ Cloudflare (Hosting, Worker/Container, Deploy) — Zielplattform
- ✅ Supabase (DB, Auth, Storage)
- ⏳ Vercel bleibt bis zum Domain-Umzug produktiv (`vercel.json`/`api/[...path].mjs`)
- ❌ **Keine** weiteren externen Dienste/Backends (kein Render, keine zusätzlichen MCP-Services)

> **Rate-Limiting-Store:** Das API-Rate-Limiting (`backend/src/middleware/rateLimit.js`)
> nutzt optional **Vercel KV** (Upstash Redis, ioredis-kompatibel) als
> instanzübergreifenden Zähler — aktiviert über die Env-Variable `KV_URL`
> (Fallback `REDIS_URL`). Ohne gesetzte Env fällt es automatisch auf den
> In-Memory-Store zurück (lokal/Dev/Tests unverändert). Vercel KV bleibt innerhalb
> „nur Vercel & Supabase". Fällt der KV-Store aus, blockiert das die App nicht
> (Fail-Open).

### Self-Hosting per Docker (Alternative zu Vercel + Supabase-Cloud)

Unter `docker/` liegt ein vollständiges `docker compose`-Setup, das den
**Supabase-Stack selbst** (Postgres, GoTrue, PostgREST, Storage, Kong) plus
Backend, Frontend (Nginx) und einen Cron-Container auf einem Rechner betreibt.
Anleitung: `docs/DOCKER_SELFHOST.md`. Bewusste Entscheidung: Supabase wird
**betrieben, nicht ersetzt** — Auth (`user_metadata` für Plan/Referral),
Storage-Bucket `catches` und die 25 Backend-Module mit `supabase.from(...)`
bleiben unverändert; nur `SUPABASE_URL`/`VITE_SUPABASE_URL` zeigen auf Kong.

- `docker/db/init/90-baitbuddy-schema.sql` ist der **vollständige
  Schema-Snapshot** der Cloud-DB (54 Tabellen, Policies, Trigger) vom
  2026-09-05 und läuft nur beim ersten `db`-Start. Neue Schemaänderungen
  weiterhin als Datei nach `supabase/migrations/` (idempotent schreiben) und
  mit `docker/scripts/apply-migrations.sh` einspielen.
- `supabase/schema.sql` ist **unvollständig** (26 von 54 Tabellen) — bei
  Schemafragen den Snapshot als Referenz nehmen.
- `vercel.json`-Crons ↔ `docker/cron/crontab`: beide Listen bei neuen
  Cron-Endpunkten **synchron** halten.
- Vercel-spezifisch bleibt nur `api/[...path].mjs` + `vercel.json`; beide
  Deploy-Wege nutzen denselben Code.

#### ⚠️ Regel: Der geteilte Supabase-Client darf NIE eine User-Session bekommen

`backend/src/lib/supabase.js` exportiert **einen prozessweit geteilten**
Service-Role-Client. supabase-js baut den `Authorization`-Header pro Request aus
`auth.getSession() ?? supabaseKey`. Jeder Aufruf, der auf diesem Client eine
Session anlegt (`signInWithPassword`, `setSession`, `verifyOtp` …), schaltet das
**gesamte Backend** dauerhaft von `service_role` auf `authenticated` um — ab da
greift RLS auch fürs Backend: Lesen liefert leere Ergebnisse, Schreiben
scheitert mit „violates row-level security policy". Der Fehler ist
zustandsabhängig und tritt erst nach dem ersten Login einer Instanz auf.

Deshalb sprechen `POST /api/auth/login` und `POST /api/auth/register` GoTrue
**direkt per `fetchWithTimeout`** an (`passwordGrant()` in `routes/auth.js`),
genau wie `POST /api/auth/refresh`. `supabase.auth.admin.*` und
`supabase.auth.getUser(token)` sind unbedenklich — die setzen keine Session.

#### Storage-URLs beim Self-Hosting: `SUPABASE_PUBLIC_URL`

`getPublicUrl()` baut Links immer aus `SUPABASE_URL`. Im Docker-Setup ist das
die containerinterne Adresse (`http://kong:8000`), die kein Browser auflösen
kann. `backend/src/lib/supabase.js` exportiert daher `toPublicStorageUrl()`,
das die Basis-URL durch `SUPABASE_PUBLIC_URL` ersetzt (ohne diese Env-Variable
unverändert, also identisches Cloud-Verhalten). Neue Storage-Links **immer**
durch diese Funktion schicken.

---

## 📦 Build & Release

**Automatisiert via GitHub Actions (kein Fastlane):**
1. PR → `main` gemergt → Vercel deployt die Web-App automatisch
2. Auf `v*`-Tag baut GitHub Actions das Android-**AAB** (Signierung in CI)
3. Upload zu Google Play erfolgt aus dem Artefakt (Beta-Track zuerst)
4. **Keine iOS-Pipeline** vorhanden

> Hinweis: Der Android-Build läuft über **einen** Workflow
> (`.github/workflows/build-android.yml`, Trigger: `v*`-Tag **oder**
> manuell per `workflow_dispatch`). Er baut sowohl ein Debug-APK zum
> Sideloaden als auch das signierte Release-**AAB** — der AAB-Signierschritt
> läuft nur, wenn das `KEYSTORE_BASE64`-Secret gesetzt ist. Der frühere
> zweite Workflow (`build-apk.yml`) wurde konsolidiert und entfernt.
> `versionCode`/`versionName` werden beim manuellen `workflow_dispatch` als
> Inputs übergeben und via Gradle-Properties `appVersionCode`/`appVersionName`
> in `android/app/build.gradle` ausgewertet (die `android.injected.version.*`-
> Properties wirken beim `bundleRelease` nicht). Ohne Property greifen die
> Defaults in `build.gradle`, die der Play-Store-Versionierung folgen. Der
> `version_code` muss höher sein als der zuletzt in der Play Console
> hochgeladene.

---

## 🎁 App Store Compliance

Apple App Store & Google Play verlangen:
- ✅ Privacy Policy inline erreichbar
- ✅ Datenhandling dokumentiert (Location, Kamera, Microphone)
- ✅ Keine versteckten Permissions
- ✅ Testflight/Beta vor Release
- ✅ App Review für sensible Features geplant

**Bei neuen Features:** App Store Review Anforderungen prüfen.

---

## 🔄 Git & PR-Workflow

### Merging
- Preview-Branches → `main` automatisch, wenn Checks grün
- Hauptentwicklung auf designiertem Feature-Branch
- Immer Pull Request vor Merge (für Code Review + Checks)

### PR-Watching
- CI-Fails, Review-Kommentare, Konflikte eigenverantwortlich beheben
- Check-ins im Hintergrund durchführen — **nie ankündigen** (z. B. "plane Check-in in 30 Min.")
- Stille Durchführung oder komplett weglassen

---

## ✅ Code-Review Checkliste

Vor jedem Commit prüfen:
- [ ] Keine Platzhalter (keine `TODO`, keine Mock-Daten)
- [ ] Keine dekorativen Emojis
- [ ] Echte Implementierung, nicht Stub
- [ ] KI-Buddy-Code: Robuste Fehlerbehandlung, Tests
- [ ] Performance: App-Start < 3 Sek., KI-Response < 2 Sek.
- [ ] Keine neuen Secrets/Credentials in Code
- [ ] TypeScript/Linting clean
- [ ] Tests grün (Unit, Integration, E2E wenn relevant)

---

## 📝 Dokumentation Updaten

Diese CLAUDE.md ist das **Source of Truth** für Entwicklungsregeln. Bei signifikanten Änderungen (neue Auth-Systeme, Device-Features, KI-Buddy-Architektur) **sofort hier updaten**, damit alle Claude-Sessions konsistent arbeiten.
