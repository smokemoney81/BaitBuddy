# Cloudflare-Migration (Vercel -> Cloudflare)

**Status: Phase 1 abgeschlossen (2026-09-17)** ✅
- ✅ `wrangler.toml` optimiert & finalisiert
- ✅ GitHub Actions Deploy-Pipeline (`deploy-cloudflare.yml`) konfiguriert
- ✅ SPA-Fallback via `not_found_handling = "single-page-application"` in `wrangler.toml` (kein `_redirects` nötig)
- ✅ Backend-CORS für `catchgbt.com` vorkonfiguriert
- ✅ Rate-Limiter auf Cloudflare-Header (`cf-connecting-ip`) angepasst

**Status Phase 2 (Ausstehend):** Dashboard-Setup & Domain-Umschaltung
- ⏳ Zone `catchgbt.com` aktivieren (Nameserver beim Registrar ändern)
- ⏳ Worker-Secrets in Cloudflare setzen (`CRON_SECRET`, `BACKEND_URL`)
- ⏳ Custom Domain `catchgbt.com` dem Worker zuordnen
- ⏳ Container-Backend (Phase 3, später, benötigt Paid Plan)

Produktives Go-Live nach Nameserver-Umschaltung. Bis dahin: Vercel läuft parallel mit
Übergangslösung (`BACKEND_URL` -> neues Vercel-Projekt in `wrangler.toml`).

## Zielarchitektur

| Schicht | Vorher (Vercel) | Nachher (Cloudflare) |
|--------|-----------------|----------------------|
| Frontend (SPA) | Vercel Static + `vercel.json` rewrites/headers | Static Assets (`dist/`) ueber den Front-Door-Worker bzw. Cloudflare Pages |
| Backend (Express) | Eine Serverless-Function (`api/[...path].mjs`) | Cloudflare **Container** (dieselbe App via `docker/backend.Dockerfile`) |
| Routing | `vercel.json` rewrites | `cloudflare/worker.js` (`/api/*` -> Container, sonst SPA) |
| Cron | `vercel.json` crons | Cloudflare **Cron Triggers** im Worker |
| Rate-Limit-Store | Vercel KV | Redis/Upstash ueber `KV_URL` (Fail-Open) |

Begruendung fuer den Container statt reiner Workers: Das Backend nutzt Full-Node-APIs
(`fs`/`child_process` in `maps.js`, `Buffer`-Aufbau in `multiProviderTTS.js`, `ioredis`
ueber TCP, SSE ueber Node-Streams). Der Container laesst die identische Express-App
laufen (minimaler Umbau); ein reiner Workers-Port waere ein grosser Rewrite am
umsatzkritischen Premium-/KI-Pfad.

## Dateien in diesem Repo

- `cloudflare/worker.js` — Front-Door: proxyt `/api/*` an `BACKEND_URL` (SSE wird
  unveraendert durchgereicht), liefert sonst die SPA aus dem Assets-Binding und
  fuehrt die vier Crons aus.
- `wrangler.toml` (Repo-Root) — **autoritative** Worker-Config, die die Cloudflare
  "Workers Builds"-Integration liest: `main = cloudflare/worker.js`, Assets (`dist`),
  Cron Triggers, `BACKEND_URL`-Var; `CRON_SECRET` als Secret setzen.
- `public/_headers` — Cache-Header (Aequivalent zu `vercel.json > headers`).
- `docker/backend.Dockerfile` — Backend-Image fuer den Cloudflare-Container.

## Backend-Container (Phase 3) — im Repo vorbereitet

Das Express-Backend läuft als **eigener Worker `baitbuddy-api`** mit Container,
getrennt vom Front-Door-Worker. So hängt die Live-Seite nicht am Container, und
ein fehlender Paid Plan bricht den Frontend-Deploy nicht.

- `cloudflare/backend/wrangler.toml` — Worker + `[[containers]]` (Image aus
  `docker/backend.Dockerfile`, Build-Kontext Repo-Root, `instance_type = "basic"`,
  Region WEUR), nicht-geheime Vars (`SUPABASE_URL`, `APP_URL`, `APP_BASE_URL`,
  `READ_ONLY_FS=1` — die Container-Platte ist flüchtig, der Kartendownload
  antwortet dort mit 501).
- `cloudflare/backend/worker.js` — reicht jede Anfrage an die Container-Instanz
  `primary` weiter (eine Instanz: In-Memory-Caches/Rate-Limit bleiben konsistent).
- `cloudflare/backend/containerEnv.js` — welche Worker-Secrets als Umgebung in den
  Container gehen (Test prüft, dass `backend/.env.example` vollständig abgedeckt ist).
- `cloudflare/backend/secretsFile.js` — übernimmt beim Deploy genau diese Namen aus
  den GitHub-Repository-Secrets (`wrangler deploy --secrets-file`, additiv).
- `.github/workflows/deploy-cloudflare-backend.yml` — manuell oder (mit Repo-Variable
  `CLOUDFLARE_BACKEND_ENABLED=true`) bei Backend-Änderungen auf `main`; bricht vor
  dem Deploy ab, wenn `SUPABASE_SERVICE_ROLE_KEY` weder als GitHub-Secret noch am
  Worker existiert (ohne ihn beendet sich die App sofort), und prüft danach
  `https://baitbuddy-api.kaisaschnitt99.workers.dev/api/health`.

**Warum ein Service Binding statt `BACKEND_URL`:** Ein `fetch()` von einem Worker
auf einen anderen Worker derselben Zone scheitert mit Fehler **1042** — das gilt
auch für zwei Worker unter `*.kaisaschnitt99.workers.dev`. `BACKEND_URL` auf die
workers.dev-Adresse zu setzen, würde jede `/api`-Anfrage brechen. Der Front-Door
(`cloudflare/worker.js`) nimmt deshalb das Binding `API`, sobald es gesetzt ist,
und fällt sonst auf `BACKEND_URL` (Vercel) zurück.

**Nicht `ALLOWED_ORIGINS` setzen**, solange die Android-App `capacitor://localhost`
braucht: die Variable ersetzt die Standardliste komplett.

### Umschalten (in dieser Reihenfolge)

1. Workers Paid Plan im Cloudflare-Konto aktivieren.
2. Secrets hinterlegen — **einer** der beiden Wege:
   - GitHub → Settings → Secrets and variables → Actions → Repository secrets,
     Namen wie in `containerEnv.js` (mindestens `SUPABASE_SERVICE_ROLE_KEY`,
     `ANTHROPIC_API_KEY`, `CRON_SECRET` identisch zum Front-Door-Worker, je nach
     Funktion `STRIPE_*`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ELEVENLABS_*`/
     `OPENAI_API_KEY`, `SMTP_*`). Der Workflow übernimmt sie bei jedem Deploy.
   - oder nach einem ersten Deploy am Worker (Dashboard → Workers →
     `baitbuddy-api` → Settings → Variables bzw.
     `npx wrangler secret put NAME --config cloudflare/backend/wrangler.toml`).
3. GitHub → Actions → „Deploy Backend to Cloudflare“ → Run workflow. Grün heißt:
   `/api/health` antwortet aus dem Container.
4. Login, KI-Chat (auch Streaming) und einen Kauf-Check gegen
   `https://baitbuddy-api.kaisaschnitt99.workers.dev` testen.
5. In der Root-`wrangler.toml` den Block `[[services]] binding = "API"` einkommentieren
   und mergen. Ab dann gehen `/api/*` und die Crons an den Container.
   **Nicht** `BACKEND_URL` auf die workers.dev-Adresse setzen (Fehler 1042, s. o.).
   Rückweg bei Problemen: Block wieder auskommentieren — `BACKEND_URL` zeigt
   weiter auf `https://bait-buddy.vercel.app`.
6. Repo-Variable `CLOUDFLARE_BACKEND_ENABLED=true` setzen, damit Backend-Änderungen
   automatisch deployt werden. Stripe-Webhook-URL erst danach umziehen.
7. Wenn Vercel abgeschaltet wird: die `crons` in `vercel.json` entfallen mit. Bis
   dahin laufen die vier Crons doppelt (Vercel + Cloudflare Cron Trigger) — die
   Endpunkte sind idempotent (Upserts, `claimed`-Status bleibt erhalten), das
   kostet nur Aufrufe.

## Ziel-Domain

Die produktive Web-App-Domain ist **`catchgbt.com`** (Apex). Erwartete Origins:
`https://catchgbt.com`, `https://www.catchgbt.com` (beide bereits Default in
`backend/src/lib/allowedOrigins.js`).

## Deploy-Schritte

1. Zone `catchgbt.com` aktivieren (Nameserver beim Registrar auf
   `rayden.ns.cloudflare.com` / `serenity.ns.cloudflare.com`), bis Status `active`.
2. Cloudflare "Workers Builds" (Projekt `baitbuddy`) konfigurieren:
   Build command `npm install --legacy-peer-deps && npm run build`, Deploy ueber
   die Root-`wrangler.toml` (`npx wrangler deploy`).
3. Am Worker setzen: Variable `BACKEND_URL` (aktuell das **neue Vercel-Projekt**,
   Konto `ssbedburg` — exakten Produktions-Alias im Vercel-Dashboard verifizieren;
   fuer das Cloudflare-Backend stattdessen das Service Binding `API`, siehe oben)
   und Secret `CRON_SECRET` (identisch zum Backend).
   Hinweis: Der Backend-Container (`docker/backend.Dockerfile`, `[[containers]]`)
   ist die Ziel-Architektur, aber **zurueckgestellt** — er braucht den Workers
   Paid Plan. Bis dahin proxyt der Front-Door `/api/*` an das Vercel-Backend.
4. Worker Custom Domain `catchgbt.com` (und `www` bzw. Redirect `www -> apex`)
   hinzufuegen; alten `www`-CNAME (manus.space) erst danach ersetzen.
5. Spaeter: Backend-Container deployen und per Service Binding umschalten
   (Abschnitt „Umschalten“ oben).
6. DNS-Hygiene: `_dmarc` (TXT), `autodiscover`, `_domainconnect` auf **DNS only**.

## Was NACH der Domain-Aktivierung noch zu tun ist (Android-AAB)

Die Android-App laedt die Live-Site remote von `catchgbt.com`. Bereits im Repo
gesetzt (dieser PR): `capacitor.config.json` (`server.url`), App-Links-Host im
`AndroidManifest.xml`, `versionCode`/`versionName`. Offen:

- App-Links-Verifizierung: `assetlinks.json` mit dem Play-Signatur-Fingerprint
  (SHA-256) unter `public/.well-known/assetlinks.json` ablegen (Fingerprint aus
  der Play Console) — der Worker liefert es dann aus.
- AAB-Build erst **nach** Zonenaktivierung anstossen (sonst weisse Seite fuer Tester):
  `build-android.yml` per `workflow_dispatch` (`version_code` > letzter Play-Upload).

## Verifikation

- `/api/health` liefert `{ ok: true }` ueber die neue Domain.
- Ein authentifizierter Endpunkt funktioniert (Login-Flow).
- SSE-Stream `/api/ai/chat/stream` streamt (kein Puffern durch den Worker).
- Ein Cron manuell: `curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<domain>/api/admin/premium/check-expiry` -> HTTP 200.
- Rate-Limit greift pro Client (Key aus `cf-connecting-ip`).
