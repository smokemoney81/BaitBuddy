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
- `cloudflare/wrangler.toml` — Worker-Config: Assets (`../dist`), Cron Triggers,
  `BACKEND_URL`-Var; `CRON_SECRET` als Secret setzen.
- `public/_headers` — Cache-Header (Aequivalent zu `vercel.json > headers`).
- `public/_redirects` — SPA-Fallback (bereits vorhanden).
- `docker/backend.Dockerfile` — Backend-Image fuer den Cloudflare-Container.

## Deploy-Schritte

1. Backend-Container bauen/deployen (Basis: `docker/backend.Dockerfile`) und unter
   einer Adresse erreichbar machen — diese wird `BACKEND_URL`.
2. Frontend bauen: `npm run build` (erzeugt `dist/` inkl. `_headers`/`_redirects`).
3. Worker deployen: `npx wrangler deploy --config cloudflare/wrangler.toml`
   (in `cloudflare/wrangler.toml` `BACKEND_URL` eintragen; zeigt auf Schritt 1).
4. Secret setzen: `npx wrangler secret put CRON_SECRET --config cloudflare/wrangler.toml`.
5. Alle Backend-Secrets am Container hinterlegen (siehe `backend/.env.example`):
   `SUPABASE_*`, `ANTHROPIC_API_KEY`, `ELEVENLABS_*`, `OPENAI_*` (optional),
   `STRIPE_*`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `KV_URL` (optional),
   `ALLOWED_ORIGINS`, `CRON_SECRET`, `SENTRY_DSN` (optional).
6. `ALLOWED_ORIGINS` auf die neue Domain setzen (ersetzt die transitionalen Defaults).
7. Domain/DNS in Cloudflare auf den Worker richten.

## Was NACH der Domain noch zu tun ist (Android-AAB)

Die Android-App laedt die Live-Site remote. Nach dem Umzug muss die neue Domain an
drei Stellen stehen, danach neuer AAB-Build (siehe `AAB_BUILD_GUIDE.md`):

- `capacitor.config.json` -> `server.url`
- `android/app/src/main/AndroidManifest.xml` -> App-Links-Host (`autoVerify`)
- `ALLOWED_ORIGINS` / `APP_URL` (CORS) am Backend

## Verifikation

- `/api/health` liefert `{ ok: true }` ueber die neue Domain.
- Ein authentifizierter Endpunkt funktioniert (Login-Flow).
- SSE-Stream `/api/ai/chat/stream` streamt (kein Puffern durch den Worker).
- Ein Cron manuell: `curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<domain>/api/admin/premium/check-expiry` -> HTTP 200.
- Rate-Limit greift pro Client (Key aus `cf-connecting-ip`).
