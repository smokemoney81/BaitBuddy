# Cloudflare-Migration (Vercel -> Cloudflare)

Status: **in Arbeit**. Der Code ist Cloudflare-tauglich vorbereitet; der eigentliche
Deploy (Container-Provisioning, DNS/Domain, Secrets) erfolgt in der Cloudflare-Konsole
bzw. per Wrangler und ist noch nicht abgeschlossen. Bis zur Umstellung laeuft die
Live-Site unveraendert auf Vercel.

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

- `cloudflare/worker.js` — Front-Door: routet `/api/*` an das Backend im
  Cloudflare Container ueber das Durable-Object-Binding `env.BACKEND`
  (`getContainer(...).fetch`, SSE wird unveraendert durchgereicht), liefert sonst
  die SPA aus dem Assets-Binding und fuehrt die vier Crons aus. Enthaelt die
  Container-Klasse `Backend extends Container` (Port 3000), die die
  Backend-Secrets aus der Worker-Umgebung an den Container-Prozess reicht.
- `wrangler.toml` (Repo-Root) — **autoritative** Worker-Config, die die Cloudflare
  "Workers Builds"-Integration bzw. `wrangler deploy` liest: `main =
  cloudflare/worker.js`, Assets (`dist`), Cron Triggers und der `[[containers]]`-
  Block (Image `docker/backend.Dockerfile`, `image_build_context = "."`,
  DO-Binding `BACKEND`, SQLite-Migration). `CRON_SECRET` und die Backend-Secrets
  als Worker-Secrets setzen.
- `public/_headers` — Cache-Header (Aequivalent zu `vercel.json > headers`).
- `public/_redirects` — SPA-Fallback (bereits vorhanden).
- `docker/backend.Dockerfile` — Backend-Image fuer den Cloudflare-Container
  (wird von `wrangler deploy` gebaut und gepusht).

## Ziel-Domain

Die produktive Web-App-Domain ist **`catchgbt.com`** (Apex). Erwartete Origins:
`https://catchgbt.com`, `https://www.catchgbt.com` (beide bereits Default in
`backend/src/lib/allowedOrigins.js`).

## Deploy-Schritte

Voraussetzung: **Workers Paid Plan** (Cloudflare Containers ist zahlungspflichtig)
und lokal ein laufender **Docker-Daemon** fuer `wrangler deploy` (baut/pusht das
Image) — alternativ Cloudflare "Workers Builds", das den Image-Build uebernimmt.

1. Zone `catchgbt.com` aktivieren (Nameserver beim Registrar auf
   `rayden.ns.cloudflare.com` / `serenity.ns.cloudflare.com`), bis Status `active`.
   (Aktuell zeigt die Domain noch auf einen Nicht-Cloudflare-Host.)
2. Worker-Secrets setzen (Dashboard oder `wrangler secret put`): `CRON_SECRET`
   sowie die Backend-Secrets, die der Worker an den Container reicht (siehe
   `backendEnv()` in `cloudflare/worker.js`): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ALLOWED_ORIGINS`,
   `ELEVENLABS_*`/`OPENAI_API_KEY` (TTS/Voice), SMTP-Variablen, `KV_URL` (optional).
3. Deployen: `npx wrangler deploy` (baut das Image aus `docker/backend.Dockerfile`
   mit `image_build_context = "."`, pusht es, deployt Worker + Container +
   Cron Triggers) **oder** Cloudflare "Workers Builds" (Projekt `baitbuddy`,
   Build command `npm install --legacy-peer-deps && npm run build`, Deploy
   `npx wrangler deploy`).
4. Worker Custom Domain `catchgbt.com` (und `www` bzw. Redirect `www -> apex`)
   hinzufuegen; alten `www`-CNAME (manus.space) erst danach ersetzen.
5. `VITE_API_URL` bleibt **leer**: Die SPA ruft `/api` same-origin auf, der Worker
   routet es an den Container — kein Frontend-Rebuild bei Backend-Aenderungen.
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
