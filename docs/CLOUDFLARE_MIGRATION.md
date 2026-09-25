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
  Region WEUR), nicht-geheime Vars (`SUPABASE_URL`, `APP_URL`, `APP_BASE_URL`).
- `cloudflare/backend/worker.js` — reicht jede Anfrage an die Container-Instanz
  `primary` weiter (eine Instanz: In-Memory-Caches/Rate-Limit bleiben konsistent).
- `cloudflare/backend/containerEnv.js` — welche Worker-Secrets als Umgebung in den
  Container gehen (Test prüft, dass `backend/.env.example` vollständig abgedeckt ist).
- `.github/workflows/deploy-cloudflare-backend.yml` — manuell oder (mit Repo-Variable
  `CLOUDFLARE_BACKEND_ENABLED=true`) bei Backend-Änderungen auf `main`; prüft danach
  `https://baitbuddy-api.kaisaschnitt99.workers.dev/api/health`.

**Nicht `ALLOWED_ORIGINS` setzen**, solange die Android-App `capacitor://localhost`
braucht: die Variable ersetzt die Standardliste komplett.

### Umschalten (in dieser Reihenfolge)

1. Workers Paid Plan im Cloudflare-Konto aktivieren.
2. Secrets am Worker setzen (Dashboard → Workers → `baitbuddy-api` → Settings →
   Variables, oder `npx wrangler secret put NAME --config cloudflare/backend/wrangler.toml`):
   mindestens `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`
   (identisch zum Front-Door-Worker), dazu je nach Funktion `STRIPE_*`,
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ELEVENLABS_*`/`OPENAI_API_KEY`, `SMTP_*`.
3. GitHub → Actions → „Deploy Backend to Cloudflare“ → Run workflow. Grün heißt:
   `/api/health` antwortet aus dem Container.
4. Login, KI-Chat (auch Streaming) und einen Kauf-Check gegen
   `https://baitbuddy-api.kaisaschnitt99.workers.dev` testen.
5. `BACKEND_URL` in der Root-`wrangler.toml` auf
   `https://baitbuddy-api.kaisaschnitt99.workers.dev` umstellen und mergen.
   Rückweg bei Problemen: denselben Wert zurück auf `https://bait-buddy.vercel.app`.
6. Repo-Variable `CLOUDFLARE_BACKEND_ENABLED=true` setzen, damit Backend-Änderungen
   automatisch deployt werden. Stripe-Webhook-URL erst danach umziehen.

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
3. Am Worker setzen: Secret `CRON_SECRET` (identisch zum Backend) und das Backend-Ziel.
   **Stand 2026-09-25:** `BACKEND_URL` (`bait-buddy.vercel.app`) gehoert zum alten
   Vercel-Konto, das wegen der Abrechnung gesperrt ist und seit PR #368 (2026-08-02)
   nicht mehr deployt. Jeder Merge landet im **neuen Projekt** (Konto `ssbedburg`,
   Alias `VERCEL_BACKEND_URL` in `wrangler.toml`), das per Deployment Protection
   gesperrt ist. Umschalten:
   1. Vercel (Konto ssbedburg) → Projekt `bait-buddy` → Settings → Deployment
      Protection → **Protection Bypass for Automation** → Secret erzeugen.
   2. Cloudflare → Worker `baitbuddy` → Settings → Variables and Secrets →
      Secret **`VERCEL_PROTECTION_BYPASS`** mit diesem Wert anlegen.
   3. Pruefen: `https://catchgbt.com/api/superadmin/stats` antwortet mit 401
      (vorher 404 = altes Backend).
   Der Worker (`backendTarget` in `cloudflare/worker.js`) nutzt den neuen Alias nur mit
   gesetztem Secret und schickt es als `x-vercel-protection-bypass` mit (auch bei den
   Crons). Secret loeschen = sofort zurueck auf `BACKEND_URL`.
   Spaeter ersetzt die Container-URL beide.
   Hinweis: Der Backend-Container (`docker/backend.Dockerfile`, `[[containers]]`)
   ist die Ziel-Architektur, aber **zurueckgestellt** — er braucht den Workers
   Paid Plan. Bis dahin proxyt der Front-Door `/api/*` an das Vercel-Backend.
4. Worker Custom Domain `catchgbt.com` (und `www` bzw. Redirect `www -> apex`)
   hinzufuegen; alten `www`-CNAME (manus.space) erst danach ersetzen.
5. Spaeter: Backend-Container (`docker/backend.Dockerfile`) deployen, Secrets aus
   `backend/.env.example` setzen (`SUPABASE_*`, `ANTHROPIC_API_KEY`, `ELEVENLABS_*`,
   `STRIPE_*`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `KV_URL` optional, `ALLOWED_ORIGINS`,
   `CRON_SECRET`), dann `BACKEND_URL` am Worker darauf umstellen.
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
