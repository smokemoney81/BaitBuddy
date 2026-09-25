// BaitBuddy Cloudflare Worker
// --------------------------------------------------------------------------
// Vorgelagerter Worker fuer den Vercel -> Cloudflare Umzug. Er ersetzt die
// Aufgaben aus vercel.json:
//   1. Routing: /api/* geht an das Express-Backend (Cloudflare Container /
//      Node-Origin, Adresse in env.BACKEND_URL), alles andere wird als
//      statische SPA aus dem Assets-Binding (env.ASSETS, Verzeichnis dist/)
//      ausgeliefert. _headers/_redirects im dist/ steuern Cache & SPA-Fallback.
//   2. Cron: die vier vercel.json-Crons laufen als Cloudflare Cron Triggers
//      (siehe wrangler.toml) und rufen die Admin-Endpunkte mit dem
//      CRON_SECRET (Authorization: Bearer) auf.
//
// Erwartete Bindings/Variablen (in Cloudflare / wrangler.toml gesetzt):
//   - env.ASSETS      : Static-Assets-Binding (dist/)
//   - env.BACKEND_URL : Basis-URL des Backends, z. B. https://api.<domain>
//   - env.CRON_SECRET : Secret fuer die Cron-Authentifizierung (als Secret setzen)
//   - env.VERCEL_BACKEND_URL / env.VERCEL_PROTECTION_BYPASS : siehe backendTarget()

// Cron-Ausdruck -> Admin-Pfad. Muss synchron zu vercel.json > crons und
// docker/cron/crontab bleiben.
const CRON_ROUTES = {
  '0 3 * * *': '/api/admin/premium/check-expiry',
  '0 2 * * *': '/api/admin/events/auto-archive',
  '0 1 * * *': '/api/admin/rewards/auto-activate',
  '0 0 1 * *': '/api/admin/leaderboards/monthly/generate',
};

// Das aktuelle Vercel-Backend (Konto ssbedburg) ist per Vercel Deployment
// Protection gesperrt: ohne Freigabe antwortet es mit einem Redirect auf die
// Vercel-Anmeldung. Der Worker schaltet deshalb erst dorthin um, wenn das
// Secret VERCEL_PROTECTION_BYPASS ("Protection Bypass for Automation" aus dem
// Vercel-Projekt) gesetzt ist, und schickt es als Header mit. Ohne Secret
// bleibt BACKEND_URL das Ziel, und Entfernen des Secrets schaltet zurueck.
//
// Weist Vercel den Wert trotzdem ab (falsches Projekt, falsch kopiert) oder
// stuerzt das neue Backend ab (z. B. fehlende Env-Variablen dort), faellt der
// Worker auf BACKEND_URL zurueck (siehe isVercelFailure) — das neue Ziel darf
// nie die ganze API lahmlegen.
const VERCEL_REJECT_BACKOFF_MS = 5 * 60 * 1000;
let vercelRejectedUntil = 0;

function fallbackTarget(env) {
  const base = (env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('BACKEND_URL is not configured');
  return { base, headers: {}, canFallback: false };
}

export function backendTarget(env, now = Date.now()) {
  const bypass = (env.VERCEL_PROTECTION_BYPASS || '').trim();
  const vercelBase = (env.VERCEL_BACKEND_URL || '').replace(/\/+$/, '');
  if (bypass && vercelBase && now >= vercelRejectedUntil) {
    const hasFallback = Boolean((env.BACKEND_URL || '').trim());
    return { base: vercelBase, headers: { 'x-vercel-protection-bypass': bypass }, canFallback: hasFallback };
  }
  return fallbackTarget(env);
}

// Antworten, die nie von der App stammen:
// - nicht freigegeben: 401 (kein JSON) oder Redirect auf https://vercel.com/sso-api
// - Plattformfehler: Header x-vercel-error (FUNCTION_INVOCATION_FAILED beim
//   Absturz der Function, DEPLOYMENT_NOT_FOUND …). Fehler der App selbst kommen
//   als JSON aus Express und tragen diesen Header nicht.
export function isVercelFailure(res) {
  if (res.headers.get('x-vercel-error')) return true;
  if (res.status === 401 && (res.headers.get('server') || '').toLowerCase() === 'vercel'
    && !(res.headers.get('content-type') || '').includes('application/json')) return true;
  if (res.status < 300 || res.status >= 400) return false;
  const location = res.headers.get('location') || '';
  return location.startsWith('https://vercel.com/sso-api') || location.startsWith('https://vercel.com/login');
}

function markVercelRejected() {
  vercelRejectedUntil = Date.now() + VERCEL_REJECT_BACKOFF_MS;
  console.error('[backend] VERCEL_BACKEND_URL nicht nutzbar (Bypass abgewiesen oder Function-Absturz) — nutze BACKEND_URL.');
}

// Nur fuer Tests.
export function _resetVercelRejection() {
  vercelRejectedUntil = 0;
}

function proxyRequest(target, request, url) {
  const proxied = new Request(target.base + url.pathname + url.search, request);
  // Ein vom Client mitgeschickter Bypass-Header darf nie durchgereicht werden.
  proxied.headers.delete('x-vercel-protection-bypass');
  for (const [name, value] of Object.entries(target.headers)) proxied.headers.set(name, value);
  // Original-Host fuer korrekte Absolut-URLs / Logging erhalten.
  proxied.headers.set('X-Forwarded-Host', url.host);
  proxied.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
  return proxied;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API-Verkehr an das Backend weiterreichen (inkl. SSE-Streaming: der
    // Response-Body wird unveraendert durchgereicht, Cloudflare puffert SSE nicht).
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = backendTarget(env);
      if (!target.canFallback) return fetch(proxyRequest(target, request, url));
      // Kopie vor dem ersten Versuch: der Body laesst sich nur einmal lesen.
      const retry = request.clone();
      const res = await fetch(proxyRequest(target, request, url));
      if (!isVercelFailure(res)) return res;
      markVercelRejected();
      return fetch(proxyRequest(fallbackTarget(env), retry, url));
    }

    // Alles andere: statische SPA aus dem Assets-Binding.
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    const path = CRON_ROUTES[event.cron];
    if (!path) {
      console.error('[cron] Unbekannter Cron-Ausdruck:', event.cron);
      return;
    }
    const run = (async () => {
      const call = ({ base, headers }) => fetch(base + path, {
        method: 'GET',
        // Nicht folgen: sonst endet ein abgewiesener Aufruf als 200 auf der Vercel-Anmeldeseite.
        redirect: 'manual',
        headers: { ...headers, Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      const target = backendTarget(env);
      let res = await call(target);
      if (target.canFallback && isVercelFailure(res)) {
        markVercelRejected();
        res = await call(fallbackTarget(env));
      }
      const body = await res.text();
      console.log(`[cron] ${path} -> HTTP ${res.status} ${body.slice(0, 300)}`);
      if (!res.ok) throw new Error(`Cron ${path} failed with HTTP ${res.status}`);
    })();
    ctx.waitUntil(run);
    return run;
  },
};
