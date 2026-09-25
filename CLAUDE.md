# BaitBuddy — Entwicklungsrichtlinien für Claude

## 🎯 Projekt-Übersicht
**BaitBuddy** ist eine Angel-App mit AI-gestütztem KI-Buddy. Technisch ist es eine **Vite + React 18 Web-App**, die für Android per **Capacitor** in einen WebView verpackt wird (die Android-Hülle lädt die Live-Site remote; Ziel-Domain `https://catchgbt.com` via Cloudflare, Migration läuft — bis zur Zonenaktivierung noch Vercel). Backend läuft als Express-App (Vercel Serverless bzw. Cloudflare Container), Datenspeicher auf Supabase.

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

Die App nutzt **absichtlich zwei parallele Auth-Pfade**, beide aktiv (dazu Clerk als optionaler Anmeldeweg, der in Pfad 1 mündet):

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

### 3. Clerk (optionaler Zusatz-Login, endet in `bb_token`)
- Login-Seite → „Weitere Anmeldeoptionen“ bettet Clerks `<SignIn>` ein (`src/components/auth/ClerkSignInPanel.jsx`, lazy, Hash-Routing `#/…`). Nach der Anmeldung leitet Clerk auf `/ClerkCallback` (`src/pages/ClerkCallback.jsx`), das `POST /api/auth/clerk` aufruft und Clerk sofort wieder abmeldet — die App kennt danach **nur** `bb_token`/`bb_refresh`. Clerk ist also nur Anmelde-Zwischenschritt, kein vierter Session-Pfad.
- Backend (`backend/src/lib/clerkAuth.js`, `routes/auth.js`): prüft das Clerk-Session-Token (`authorizedParties` = `getAllowedOrigins()`), nimmt **nur die bei Clerk verifizierte primäre E-Mail** und ordnet sie dem Supabase-Nutzer zu (neu → `createUser` + dieselbe 24-h-Trial wie `/auth/register`). Die Sitzung entsteht per Admin-`generateLink` (Magic-Link, verschickt nichts) + direktem `POST /auth/v1/verify` — nie über den geteilten Client.
- Aktiv nur, wenn **beide** Keys gesetzt sind: `VITE_CLERK_PUBLISHABLE_KEY` (Build, `.env.production`) und `CLERK_SECRET_KEY` (Backend, optional `CLERK_JWT_KEY`). `GET /api/auth/clerk/config` meldet den Server-Teil; ohne ihn blendet die Login-Seite Clerk aus.
- Grenze: Google/Apple **über Clerk** scheitern im Android-WebView (Google sperrt eingebettete WebViews); dort bleibt der eigene Google-Button (externer Browser) der Weg. E-Mail-Code/Passwort über Clerk funktionieren.
- Bewusste, vom Betreiber gewünschte Ausnahme von „keine weiteren externen Dienste“.

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
  - Es gibt **kein** schwebendes Chat-Widget mehr (entfernt im BaitBuddy-2.0-Layout, wie in den Vorlagen). Der Buddy ist über „Hey Buddy“ im Command Center (`src/components/layout/CommandCenter.jsx`), die Dashboard-Schnellzugriffe und das Plus-Menü der Bottom-Nav erreichbar; Fragen werden per `/KiBuddyBeta?question=…` vorbefüllt.
  - `src/pages/KiBuddyBeta.jsx` — eigenständige Voice-Buddy-Seite
    - **Nicht scrollbar**: `useFitToViewport` (`src/hooks/useFitToViewport.js`) setzt die Seitenhöhe per JS (`--bb-fit-height`, kein `dvh` — fehlt in WebView 90/iOS 14) und sperrt das Dokument-Scrollen (`html.bb-no-page-scroll`); nur der Chatverlauf scrollt intern. Bei wenig Höhe blenden `max-height`-Media-Queries in `baitbuddy-v2.css` stufenweise Beiwerk, Buddy-Kreis und (Tastatur offen) Schnellaktionen/Freisprech-Leiste aus. Neue Elemente auf der Seite müssen in diese Höhenrechnung passen.
  - `src/components/ai/`, `src/components/chatbot/`, `src/components/home/MiniKiBuddy*.jsx`
  - `src/pages/VoiceChat.jsx` — Live-Gespräch (OpenAI Realtime per WebRTC). Ebenfalls **nicht scrollbar** (`useFitToViewport`, Klassen `bb-voice bb-live`); die Bedienleiste liegt in der Seite über der Bottom-Nav. Ohne Realtime (kein `OPENAI_API_KEY`, Netz-/Verbindungsabbruch) läuft das Gespräch turn-basiert weiter: Web Speech → `ai.chatStream` (Fallback `catchgbtChat`) → `createSpeechQueue`, mit lokaler FAQ-Sofortantwort, einem Retry, Offline-FAQ und Klartext bei 401/429/503 statt pauschalem „Verbindungsproblem".
  - Hooks: `useChatMessages`, `useSpeechRecognition`, `useElevenLabsVoice`
  - `src/lib/buddyGreetings.js` — Start-Begrüßungs-Generator: begrüßt per Sprechblase + TTS, variiert nach Tageszeit/Stimmung/Event-Status (Anti-Wiederholung via localStorage). Wiederholung gesteuert über **Zeitstempel-Cooldown** (`shouldGreet`/`markGreeted`, localStorage `bb_buddy_last_greeting`, Default 15 Min) statt eines Session-Flags — nötig, weil im Capacitor-WebView eine Sitzung das Wiederöffnen (Resume) überlebt. Seit dem Wegfall der schwebenden Buddy-Blase gibt es **keine automatische Start-Begrüßung** mehr; `KiBuddyBeta` nutzt `buildGreeting` beim Öffnen. Die Cooldown-Helfer bleiben für eine spätere Wiederverwendung erhalten. `getVariedPageBubble` rotiert die Seiten-Blase (Seitenfrage/Buddy-Frage/Funktions-Tipp).
  - `src/lib/audioUnlock.js` — `runWhenAudioReady(fn)`: Browser/WebView blockieren Audio-Wiedergabe ohne vorherige Nutzer-Geste (Autoplay-Policy). Die Start-Begrüßung wird deshalb **beim ersten Antippen** entsperrt/nachgeholt; alle Begrüßungs-TTS-Aufrufe laufen über diesen Helfer.
- **Backend**: `backend/src/routes/ai.js` (`POST /api/ai/chat` u. a.) mit `backend/src/lib/llm.js` für die LLM-Anbindung. (Es gibt **kein** `api/routes/kibuddy.js`.)
- **„Quasi live"-Sprachausgabe (Streaming-Pipeline)**: `KiBuddyBeta` streamt die Antwort, damit der erste Satz spricht, **bevor** die ganze Antwort fertig ist. Drei Schichten:
  1. **Gestreamte LLM-Antwort**: `POST /api/ai/chat/stream` (SSE) mit `invokeLLMStream` in `llm.js` (Anthropic Messages `stream:true`, SSE-Events `content_block_delta`/`text_delta`); der geteilte Prompt-Aufbau steckt in `buildChatPrompt(req)` (von `/ai/chat` und `/ai/chat/stream` genutzt). Der `<<ACTION>>`-Block wird am Stream-Ende aus dem Volltext extrahiert und im `done`-Event mitgeliefert. Client: `ai.chatStream(messages, userLocation, { onDelta, signal })` in `frontendClient.js` (SSE-Reader). **Fällt bei Stream-Fehler automatisch auf `ai.chat` zurück** (Vercel-SSE-Risiko abgesichert).
  2. **Satzweise TTS-Queue**: `createSpeechQueue`/`splitIntoSentences` in `elevenLabsTTS.js` — spricht Sätze in Reihenfolge und prefetcht den nächsten schon während der aktuelle läuft (Pipelining). `stripActionMarker` (`src/lib/streamingReply.js`) hält den Aktions-Block aus Anzeige und TTS heraus. Nutzt denselben Audio-Singleton/Generation-Token wie `speakWithElevenLabs` (neuer Turn/`cancelElevenLabs` bricht die Queue ab). `speakWithFallback` bleibt für Einzel-Ansagen (Begrüßungen, Offline-/Fehler-Fallbacks).
  3. **Schnelles ElevenLabs-Modell**: Default `eleven_flash_v2_5` (~75 ms statt Sekunden, spricht Deutsch) + kompaktes `output_format` in `multiProviderTTS.js`; per Env `ELEVENLABS_MODEL_ID`/`ELEVENLABS_OUTPUT_FORMAT` auf das Qualitätsmodell umschaltbar.
- **Wissensbasis**: `backend/src/lib/buddyKnowledge.js` — zentrale Praxis-Wissensbasis (Köderführung, Montagen, Unterwasser-Köderbox, Knoten, Drill, Saisonwissen), Gesprächsstil-Regeln (variierende Rückfragen: humorvoll/nachdenklich/neugierig/direkt) und App-Funktionswissen (der Buddy erklärt jede App-Funktion ausführlich und bietet passende Handgriffe aktiv an, z. B. „Sag einfach: Karpfen ins Fangbuch") plus verbindliche Anleitungs-Regeln: Bei „Wie benutze/montiere/führe ich X?"-Fragen erklärt der Buddy **immer selbst Schritt für Schritt** (Montage → Einsatz im Wasser → Führung → Bisserkennung → typische Fehler) und verweist **nie** nur auf Tutorials. Eingebunden in `POST /api/ai/chat` (System-Prompt) und `POST /api/ai/realtime-session` (Voice-Instructions). Wissens-Erweiterungen gehören in dieses Modul, nicht in einzelne Routen-Prompts.
- **Lokale FAQ-Datenbank (ohne API)**: `backend/src/lib/buddyFaq.data.js` (101 kuratierte Fragen/Antworten in Du-Form: Fischarten, Köder, Montagen, Knoten, Ausrüstung, Wetter, Jahreszeiten, Regeln, Handling, Sicherheit, App-Funktionen, Smalltalk) + Such-Engine `backend/src/lib/buddyFaq.js` (reines JS, keine Abhängigkeiten). Liegt unter `backend/`, weil das Backend-Image nur diesen Ordner kopiert; das Frontend importiert über `src/lib/buddyFaq.js`. Eine Quelle, drei Nutzer:
  1. **Sofort-Antwort** (`KiBuddyBeta`, online): `resolveLocalAnswer` antwortet ohne API-Aufruf, wenn die Frage eine allgemeine Standardfrage ist — Abdeckung ≥ 75 % der Inhaltswörter, ≤ 8 Inhaltswörter, **keine** App-Aktion (`isActionRequest`: „Trag … ein", „Öffne …", „Kannst du … zeigen"), **kein** Bezug auf Ort/Zeit/gespeicherte Daten (`needsPersonalContext`: „heute", „hier", „meine Fänge", „meinen Trip") und im laufenden Gespräch kein Rückbezug (`isFollowUpQuestion`: „und für Zander?", „dafür"). Alles andere geht weiter an die KI.
  2. **Offline** (`navigator.onLine === false` → sofort, ohne Timeouts/Retries; oder nach gescheitertem Request): jeder Treffer mit Abdeckung > 0 wird beantwortet, ist die Frage spezieller als der Eintrag, sagt die Antwort offen „nur allgemein". Kein Treffer → ehrliche Fallback-Nachricht mit den verfügbaren Themen.
  3. **LLM-Prompt**: `buildFaqPromptSection(lastMsg)` bettet nur die ≤ 3 passenden Einträge ein (früher: 199 Einträge / 30 000 Zeichen in *jedem* Prompt und in der Realtime-Session) — kürzerer Prompt, konsistente Antworten.
  - Regeln für neue Einträge: Begriffe normalisiert schreiben (ä→ae, ß→ss); `$`-Suffix = exaktes Wort (gegen Fehltreffer wie „Drilling"→Drill, „Regenbogenforelle"→Regen); gesetzliche Details nur allgemein + Verweis auf `RuleAssistant`; fachlich konsistent zu `FISHING_KNOWLEDGE`. Der Test `buddyFaq.test.js` verlangt, dass jeder Eintrag über seine eigene `question` sofort beantwortet wird.
- **Datenbank**: Supabase-Tabellen (`catches`, `spots`, `rule_entries` …) liefern den Kontext; Chat-Historie wird clientseitig gehalten.
- **LLM**: **Anthropic Claude über Anthropic Cloud API** — natives `fetch` gegen die Messages API (`https://api.anthropic.com/v1/messages`) in `backend/src/lib/llm.js`. EIN Modell für Text UND Vision, Default `claude-haiku-4-5` (schnellstes Modell, hält das < 2 Sek.-Latenz-Ziel), per Env `ANTHROPIC_MODEL` umschaltbar (z. B. `claude-opus-4-8`). Der Key wird über `getAnthropicKey()` tolerant gelesen (`ANTHROPIC_API_KEY` bzw. `sk-ant-…`-Varianten). Der Aufruf erfolgt serverseitig, nie direkt vom Frontend. **Anthropic Cloud API ist der einzige LLM-Provider; andere Anbieter sind nicht gestattet.**
  - ⚠️ **Regel: Nur Anthropic Cloud API als LLM-Quelle** — Alle LLM-Anfragen müssen über Backend-Endpoints mit Anthropic gehen (`POST /api/ai/chat`, `POST /api/ai/realtime-session`, `POST /api/ai/vision` u.ä.). Frontend darf keine LLM-Libraries direkt verwenden. Das verhindert API-Key-Exposure, reduziert Bundle-Size und zentralisiert Kontextverwaltung serverseitig.
- **TTS-Stimmen**: `POST /api/ai/tts` (ElevenLabs) kennt zwei Stimmen: männlich „Daniel" (Standard, alle Pläne) und weiblich „Matilda" (**nur Ultimate**, Plan-ID `elite`/Friends-Level). Das Plan-Gate sitzt **serverseitig** (`backend/src/lib/planResolver.js`, geteilt mit `premium.js`; `/ai/tts` ruft `resolveServerToolAccess` mit `requiredPlanRank: PLAN_RANK.elite` — Basic/Pro zählen dort nicht) — ohne Ultimate fällt der Server still auf die Standardstimme zurück. Die Auswahl liegt in den Audio-Einstellungen (`VoiceSettings.jsx`), gespeichert via `src/lib/ttsVoice.js` (localStorage `buddy-tts-voice`); `elevenLabsTTS.js` sendet die Wahl bei jedem TTS-Aufruf mit. Env-Overrides: `ELEVENLABS_VOICE_ID` (männlich), `ELEVENLABS_VOICE_ID_FEMALE` (weiblich).
  - ⚠️ **Regel: Nur natürliche Stimmen, nie Browser-TTS** — Die App spricht ausschließlich über die zentrale Utility `src/components/utils/elevenLabsTTS.js` (`speakWithFallback` = spricht und löst nach Wiedergabe-Ende auf; „Fallback" bedeutet **Stille** bei Fehlern, nicht Roboterstimme). Die frühere Browser-TTS (`speechSynthesis`, `browserTTS.jsx`) wurde komplett entfernt und darf **nicht** wieder eingeführt werden — schlägt ElevenLabs fehl (offline, kein API-Key), bleibt die Ausgabe still und der Text steht im Chat. Überlappende TTS-Aufrufe werden per Generation-Token in `elevenLabsTTS.js` verworfen (keine Doppelstimmen).
    **Welche natürliche Stimme spricht, entscheidet die Server-Kette**, nicht der
    Client: `buildProviderChain()` in `backend/src/lib/multiProviderTTS.js` reiht
    OPENAI_API_KEY → ELEVENLABS_API_KEY → GOOGLE_CLOUD_API_KEY → GEMINI_API_KEY
    und nimmt den ersten gesetzten Schlüssel. Ist `OPENAI_API_KEY` gesetzt (etwa
    für die Realtime-Voice-Session), spricht `/api/ai/tts` also mit einer
    OpenAI-Stimme. **Diese Reihenfolge ist so gewollt** — nicht "korrigieren".
    Wer ElevenLabs erzwingen will, lässt `OPENAI_API_KEY` leer.

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
- **Replay-Schutz über alle Zahlungen:** Webhook und `/premium/activate` führen
  `premium_processed_transactions` (letzte 50 Session-IDs/Play-Tokens). Eine
  bereits verbuchte Transaktion ist ein No-op — außer Play bestätigt ein
  späteres Ablaufdatum (`extendsRuntime`). Beide Wege haben dieselben
  Nebenwirkungen (Referral-Rabatt verbrauchen, Basic-Belohnung, `premium_trial=false`).
- **Checkout-Mindestpreis (9,99 €) begrenzt nur den Referral-Rabatt**, er ist
  kein Preisaufschlag für günstigere Pläne.
- **Plan-Rangfolge an zwei Stellen spiegeln:** `backend/src/lib/planResolver.js`
  (`PLAN_RANK`) und `src/components/premium/planHierarchy.jsx`
  (`PLAN_HIERARCHY`). Laufen sie auseinander, schaltet der Server etwas frei,
  das die UI sperrt (oder umgekehrt). Das bezahlte Einmalprodukt `trial_10_10`
  (10 Tage Vollzugriff) liegt auf Ultimate-Niveau.
- **Kauf direkt nach App-Start:** Play Billing verbindet sich asynchron. Ein
  Kaufwunsch, der auf Verbindung/Produktdetails wartet, wird in
  `BillingManager` gepuffert und ausgeführt, sobald die Details da sind
  (Timeout 15 s) — kein sofortiger „Billing service not ready"-Fehler.

## 📲 Android-App direkt installieren (APK)

`AndroidInstallButton` (Login-Auswahl in `LandingAuthPanel.jsx`) lädt die APK aus
dem neuesten GitHub-Release (Asset `baitbuddy.apk`, `src/lib/androidApk.js`, öffentliche
GitHub-API, 1 h Cache). Ohne Release/Asset erscheint kein Button; in der installierten
App und auf iOS nie. Das Release erzeugt `build-android.yml` (signierte Release-APK,
nur mit Keystore-Secret) bei `v*`-Tags bzw. manuellem Lauf. Die APK ist mit dem
Upload-Schlüssel signiert; mit Play App Signing (Standard bei AAB-Apps) signiert Google
die Play-Version mit einem eigenen Schlüssel — dann lassen sich Sideload- und
Play-Installation nicht gegenseitig aktualisieren (vorher deinstallieren).

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
- **Belohnung (Anmeldung)**: 7 Tage Ultimate als **Pass** in `app_metadata`
  (`premium_pass_expires_at`, von `resolvePlan` ausgewertet). Angehängt wird an
  eine laufende bezahlte Ultimate-Laufzeit bzw. einen laufenden Pass, sonst ab
  jetzt. Das eigentliche Abo (Basic/Pro inkl. Play-Ablaufdatum) bleibt dabei
  unangetastet, ein höherer Plan (`friends`) wird **nicht** herabgestuft. Der
  Server pflegt `referral_reward_count` in `app_metadata` des Referrers.
  ⚠️ Plan-Felder **nie** in `user_metadata` schreiben — die ist clientseitig
  beschreibbar und wird von `resolvePlan` ignoriert (so war die Belohnung
  früher wirkungslos).
- **Code-Vergabe nur serverseitig** (`GET /api/referrals/me`). `referral_code`
  ist nicht über `PATCH /auth/me` setzbar; ein Code, der im Lookup schon einem
  anderen Nutzer gehört, wird nie umgeschrieben.
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
2. Beendete Events, deren Ende länger als `EVENT_ARCHIVE_DAYS` (Default **7 Tage**)
   zurückliegt, wandern per **Soft-Delete** (`is_active=false`) ins **Archiv**:
   `GET /api/events` filtert nur `is_active=true`, `GET /api/events/archive`
   liefert `status='ended'` + `is_active=false` (Reiter „Archiv“ in `Events.jsx`).
   Kein Hard-Delete — `event_participants`/`event_submissions`/Punkte-Historie
   bleiben erhalten. Vom Superuser gelöschte Events tragen `status='deleted'` und
   fehlen auch im Archiv.

**Event-Countdown** (`src/components/header/EventTimer.jsx`): eigene Zeile unter
der Kopfzeile mit Event-Name + Restzeit bis `end_date` des laufenden Events, das
als nächstes endet (`GET /api/events/user/active-event`, nur sichtbare Events).
Die Restzeit wird jede Sekunde aus `end_date` berechnet, nicht hochgezählt.
Auf dem Voice Buddy (`KiBuddyBeta`) ist die Zeile ausgeblendet
(`hideEventTimer` in `pageTopBars.jsx`), damit die nicht scrollbare Seite Platz hat.

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

> ⚠️ **Regel: `USING (true)` ist bei personenbezogenen Daten ein Datenleck.**
> Eine SELECT-Policy ohne `to`-Klausel gilt für die Rolle `public` — also auch
> für `anon`. Der Anon-Key liegt im ausgelieferten Client-Bundle; wer ihn dort
> herauszieht, liest die ganze Tabelle. Dieser Fehler ist bereits **viermal**
> aufgetreten (`users`, `support_tickets`, `function_ratings`,
> `depth_data_points`) — dreimal trug die Policy sogar „own" im Namen, während
> ihre Bedingung `true` lautete. Der Name ist keine Zugriffskontrolle.
>
> Für jede Policy auf einer Tabelle mit Nutzerdaten deshalb: Rolle explizit
> setzen (`to authenticated`) und die Zeile am Nutzer festmachen
> (`auth.uid() = user_id` bzw. `user_email = auth.jwt() ->> 'email'`). Was nur
> das Backend liest, braucht gar keine Lese-Policy — die Service-Role umgeht RLS
> ohnehin. Prüfen lässt sich das direkt: `set local role anon;` und zählen.

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

## 🧭 App-Hülle (BaitBuddy 2.0, nach Referenz-Screenshots)

Die Hülle um jede Seite folgt den Vorlagen aus Issue #386:

- **Kein fester Header-Balken.** `src/components/layout/AppTopBar.jsx` ist Teil des
  Hero-Bereichs: Hauptseiten (`ROOT_SEGMENTS`) zeigen Logo links + Glocke + Avatar,
  Unterseiten runde Zurück-Taste + Logo mittig + Avatar. Der Avatar öffnet das
  **Command Center** (`CommandCenter.jsx`, ersetzt die alte Seitenleiste; jede
  frühere Menü-Route bleibt über die aufklappbaren Hauptbereiche erreichbar).
- **Seefoto-Hintergrund** (`.bb-backdrop`, `public/assets/buddy/lake-hero.png`) liegt
  im Layout hinter Kopfzeile und Seitentitel. Seiten-Wrapper dürfen ihn nicht mit
  opakem Hintergrund verdecken — verschachtelte `.bb-app` sind deshalb transparent.
  Vollflächige Seiten (Karte, AR, CatchCam) stehen in `NO_BACKDROP_PAGES`.
- **Titel in der Kopfzeile statt Logo**: `src/components/layout/pageTopBars.jsx` (`PAGE_TOP_BARS`) gibt einzelnen Unterseiten Titel + Aktion in `AppTopBar` (derzeit Voice Buddy mit Einstellungs-Zahnrad).
- **Seitentitel** über `PageTitle.jsx` (letztes Wort in Cyan, optional
  Script-Zeile); `SubPageHeader` ist nur noch ein Alias darauf.
- **Bottom-Nav**: Plus als Cyan-Ring. Icon/Label kommen aus `navigationItems`
  (die Tool-Registry liefert Icons nur als Namen-String).
- „Zuletzt verwendet“ im Command Center: `recordRecentPage` in `src/lib/pageMeta.js`
  (localStorage `bb_recent_pages`).
- Hintergrundfarbe `#0B1324` (Issue-Vorgabe), zentral in `baitbuddy-v2.css`.

## 🛡️ Admin-Bereich (Superuser)

- **Nur ein Konto:** `kaisaschnitt99@gmail.com` (per Env `SUPERUSER_EMAIL`
  überschreibbar). Gate serverseitig über `requireSuperuser`
  (`backend/src/middleware/auth.js`) für alle `/api/superadmin/*`-Routen
  (`backend/src/routes/superAdmin.js`); `/api/auth/me` liefert `is_superuser`.
  Der Superuser ist zusätzlich immer Admin (`isAdminEmail`); `ADMIN_EMAILS`
  gilt weiter für die älteren Admin-Werkzeuge, **nicht** für `/Admin`.
- **Seite `/Admin`** (`src/pages/Admin.jsx`, Einstieg im Command Center nur bei
  `is_superuser`): Top-10-Tools, Community-Beiträge löschen, Events löschen
  (weich, `status='deleted'`) und neu starten (neue Runde ab jetzt, gleiche
  Laufzeit/Regeln, altes Event bleibt im Archiv), Support-Tickets beantworten
  (Antwort geht per Mail an den Nutzer und erscheint in „Meine Tickets“),
  Status setzen, löschen, Rundmail an alle Nutzer (BCC-Pakete à 50).
- **Top-10-Tools** zählen Seitenaufrufe: `trackPageView` (`tracker.jsx`) legt pro
  Seitenwechsel angemeldeter Nutzer eine `usage_sessions`-Zeile mit
  `status='view'`, `feature_id='page:<Route>'` an; `Admin.jsx` ordnet Routen über
  `TOOLS` (`toolRegistry.ts`) Tools zu (ohne Einstellungs-/Rechtsseiten und ohne
  `?tab=`-Tools, die sich per Pfad nicht unterscheiden lassen).
- **Mailversand** zentral in `backend/src/lib/mailer.js` (SMTP_HOST/USER/PASSWORD).
  Support-Adresse `supportEmail()` = `SUPPORT_EMAIL` bzw. `kaisaschnitt99@gmail.com`,
  Frontend-Gegenstück `src/lib/supportContact.js`. Ticket-Benachrichtigungen gehen
  an `DEVELOPER_EMAIL`, sonst an die Support-Adresse.

## 🧩 Screens mit eigener Logik (BaitBuddy 2.0, Teil 2)

- **Hands-free Buddy** (`src/pages/HandsFreeBuddy.jsx`): nur mit aktivem Trip.
  Dauerhafte Web-Speech-Erkennung wartet auf „Hey Buddy“ (`src/lib/wakeWord.js`,
  tolerant gegen Hörfehler), stellt die Frage über `ai.chatStream` und spricht
  über `createSpeechQueue`. Während der Buddy spricht, ist die Erkennung aus.
  Ende nach 60 s ohne Sprache, beim Wechsel in den Hintergrund oder wenn der
  Schalter in `bb_privacy_prefs` aus ist. Datenaktionen (Fang, Spot) laufen
  direkt, `navigate` wird nur angeboten. **Nicht behaupten, die Erkennung sei
  lokal** — Web Speech läuft unter Android über den Google-Dienst.
  „Trip beenden“ übergibt an `/AnglerMode?end=1` (Zusammenfassung bleibt dort).
  `KiBuddyBeta` führt `<<ACTION>>`-Blöcke per `executeBuddyAction` aus.
- **Privatsphäre** (`src/pages/Privatsphaere.jsx`): echte Berechtigungszustände
  über `src/lib/devicePermissions.js`; „Zwischenspeicher löschen“
  (`clearLocalCaches` in `privacyPrefs.js`) löscht nie Anmeldung, Einstellungen
  oder noch nicht synchronisierte Daten.
- **Gastdaten übernehmen** (`src/pages/GastdatenUebernehmen.jsx`): Die Übernahme
  läuft weiter automatisch in `AuthContext`; `migrateGuestData` speichert das
  Ergebnis (`bb_guest_migration_result` + Event `guest-migration-finished`).
  Login/OAuth-Callback führen über `postLoginPath()` hierher, solange Gastdaten
  auf dem Gerät liegen.
- **Level & Rewards** (`GET /api/progress/me`, `backend/src/lib/progression.js`):
  XP, Level und Abzeichen werden bei jedem Abruf aus den echten Daten berechnet —
  **kein gespeicherter XP-Zähler**. Pro Tag zählen höchstens 20 Fänge.
- **Wettbewerb** (`src/pages/EventDetails.jsx`, `/events/:id`): Einreichungen
  laufen durch `backend/src/lib/submissionPlausibility.js` (harte Verstöße → 422,
  Auffälligkeiten → `review_status='pending'`). **Nur `confirmed`/`verified`
  zählt** — in `recalcParticipantTotals` und in `GET /events/:id/standings`.
  Einsprüche in `event_disputes` (nur Backend). Regeln (Zeitraum, Wertung,
  Zielarten, Freigabepflicht) sind ab Start per `PATCH` gesperrt.
  ⚠️ Teilnehmer-/Ranglisten-Endpunkte sind ohne Login abrufbar und geben deshalb
  **nie E-Mails** aus, sondern Anzeigenamen (`displayNames`) plus `is_me`.
- **Vereinsprofile** (`/api/clubs`, `src/pages/Vereinsprofil.jsx`): Das
  Verzeichnis (~700 Vereine) liegt nur im Frontend (`src/lib/clubDirectory.js`,
  lazy); das Backend-Image enthält `src/data` nicht. `fishing_clubs` ist
  öffentlich lesbar und enthält deshalb nur Vereinsangaben — Verwalter
  (`club_admins`) und Folgende (`club_followers`) liegen in Tabellen ohne
  Lese-Policy. Wer zuerst übernimmt, verwaltet; „Verifiziert“ setzt nur ein
  App-Admin (`POST /api/clubs/:id/verify`). Vereinsveranstaltungen (`events.club_id`)
  legt nur ein Vereinsverwalter an.
- **Backend-Tests** laufen über die Root-Konfiguration:
  `npx vitest run --project backend` (aus `backend/` heraus fehlt das Setup mit
  den Test-Env-Variablen, dann schlagen `llm`/`admin`-Tests scheinbar fehl).

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
- ⚠️ **Zwei Vercel-Projekte:** `BACKEND_URL` (`bait-buddy.vercel.app`, Konto „Sebastian's projects“) ist wegen der Abrechnung gesperrt und steht auf PR #368. Merges deployt das Projekt im Konto `ssbedburg` (`VERCEL_BACKEND_URL`, per Deployment Protection gesperrt). Der Worker schaltet erst dorthin, wenn das Worker-Secret `VERCEL_PROTECTION_BYPASS` gesetzt ist (`backendTarget` in `cloudflare/worker.js`). Symptom bei altem Backend: Features, die neue API-Felder brauchen (z. B. `is_superuser` → Admin-Bereich), fehlen trotz aktuellem Frontend. Prüfen: `/api/superadmin/stats` → 404 = altes Backend.
- ⏳ Backend-Container vorbereitet: eigener Worker `baitbuddy-api` (`cloudflare/backend/`, Workflow `deploy-cloudflare-backend.yml`). Braucht Workers Paid Plan + Secrets; Umschalten über `BACKEND_URL` in der Root-`wrangler.toml` (Schritte in `docs/CLOUDFLARE_MIGRATION.md`). Neue Backend-Env-Variablen auch in `cloudflare/backend/containerEnv.js` eintragen.
- ❌ **Keine** weiteren externen Dienste/Backends (kein Render, keine zusätzlichen MCP-Services) — einzige vom Betreiber freigegebene Ausnahme: Clerk als optionaler Zusatz-Login (siehe Auth-Architektur)

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

#### Weitere Backend-Regeln

- **Supabase-Query-Builder haben kein `.catch()`** — sie sind nur *thenable*.
  `supabase.from(…).insert(…).catch(…)` wirft einen TypeError (so waren
  Event-Einladungen und die Ad-Belohnung dauerhaft 500). Fehler über
  `{ error }` auswerten oder `Promise.resolve(builder).catch(…)` nutzen.
- **Metadaten-Read-Modify-Write immer auf frischem Stand:** `req.user` kommt aus
  dem Token-Cache (`middleware/auth.js`, bis 60 s alt). Vor jedem Merge in
  `user_metadata`/`app_metadata` `getFreshUser(req.user)` nutzen und nach dem
  Schreiben `invalidateCachedUser(id)` aufrufen — sonst sieht der Nutzer den
  gekauften Plan bis zu einer Minute nicht bzw. ein Merge dreht Änderungen zurück.
- **`req.protocol` nie zuweisen** (Getter; im Strict Mode TypeError → jede
  Anfrage hinter Nginx/Cloudflare 500). `trust proxy` liefert den Wert bereits.
- **Öffentliche Endpunkte liefern nur öffentliche Daten:** `/spots/public` und
  `/fishing/hotspots` filtern `is_public=true`; `publicRead`-Entities in
  `userEntities.js` entfernen fremde `user_email`/`created_by`.
- **Uploads** (`/api/files/upload`) nur mit erlaubten Medientypen; CSV/GPX
  werden als `text/plain` abgelegt (öffentlicher Bucket → kein HTML/SVG).

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

### ⚠️ `npm audit fix --force` bricht den Android-Build

`npm audit` meldet zwei offene Lücken in **`tar` 6.2.1**. Diese Version zieht
ausschließlich `@capacitor/cli` (devDependency, `dist/util/template.js`) und sie
läuft nur bei `cap add`/`cap update`/`cap migrate`, wo Capacitors **eigenes**
Plattform-Template aus dem npm-Paket entpackt wird — kein Nutzer-Input, kein
Laufzeitpfad der App, nichts davon landet im Bundle oder im AAB.

**Nicht "wegfixen".** Beide angebotenen Wege sind teurer als die Lücke:

- **`overrides: { "tar": "^7" }`** — verifiziert kaputt. tar 7 ist ESM mit
  `__esModule`-Flag und ohne Default-Export, deshalb liefert das
  `tslib.__importDefault(require("tar"))` in `template.js` ein Objekt, dessen
  `.default` `undefined` ist: `TypeError: Cannot read properties of undefined
  (reading 'extract')`. `cap add android` stirbt daran.
- **`@capacitor/cli@8`** — `6.2.2` ist die letzte 6er-CLI und verlangt
  `tar ^6.1.11`; die tar-6-Linie endet bei `6.2.1`, ein Fix existiert dort nicht.
  Ein CLI-Sprung auf 8 zwingt `@capacitor/core`, `@capacitor/android` und die
  drei Plugins mit — ein eigenes Vorhaben, kein Audit-Aufräumen.

Wer das dennoch angeht, verifiziert es gegen einen **echten Android-Build**
(SDK + `bundleRelease`), nicht nur gegen `npm audit`.

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
