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

// Cron-Ausdruck -> Admin-Pfad. Muss synchron zu vercel.json > crons und
// docker/cron/crontab bleiben.
const CRON_ROUTES = {
  '0 3 * * *': '/api/admin/premium/check-expiry',
  '0 2 * * *': '/api/admin/events/auto-archive',
  '0 1 * * *': '/api/admin/rewards/auto-activate',
  '0 0 1 * *': '/api/admin/leaderboards/monthly/generate',
};

function backendBase(env) {
  const base = (env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('BACKEND_URL is not configured');
  return base;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API-Verkehr an das Backend weiterreichen (inkl. SSE-Streaming: der
    // Response-Body wird unveraendert durchgereicht, Cloudflare puffert SSE nicht).
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = backendBase(env) + url.pathname + url.search;
      const proxied = new Request(target, request);
      // Original-Host fuer korrekte Absolut-URLs / Logging erhalten.
      proxied.headers.set('X-Forwarded-Host', url.host);
      proxied.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      return fetch(proxied);
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
      const res = await fetch(backendBase(env) + path, {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      const body = await res.text();
      console.log(`[cron] ${path} -> HTTP ${res.status} ${body.slice(0, 300)}`);
      if (!res.ok) throw new Error(`Cron ${path} failed with HTTP ${res.status}`);
    })();
    ctx.waitUntil(run);
    return run;
  },
};
