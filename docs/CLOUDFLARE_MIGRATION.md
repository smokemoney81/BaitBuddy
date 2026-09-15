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

- `cloudflare/worker.js` — Front-Door: proxyt `/api/*` an `BACKEND_URL` (SSE wird
  unveraendert durchgereicht), liefert sonst die SPA aus dem Assets-Binding und
  fuehrt die vier Crons aus.
- `wrangler.toml` (Repo-Root) — **autoritative** Worker-Config, die die Cloudflare
  "Workers Builds"-Integration liest: `main = cloudflare/worker.js`, Assets (`dist`),
  Cron Triggers, `BACKEND_URL`-Var; `CRON_SECRET` als Secret setzen.
- `public/_headers` — Cache-Header (Aequivalent zu `vercel.json > headers`).
- `public/_redirects` — SPA-Fallback (bereits vorhanden).
- `docker/backend.Dockerfile` — Backend-Image fuer den Cloudflare-Container.

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
3. Am Worker setzen: Variable `BACKEND_URL` (Uebergang: `https://bait-buddy.vercel.app`,
   spaeter Container-URL) und Secret `CRON_SECRET` (identisch zum Backend).
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
