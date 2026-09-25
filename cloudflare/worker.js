// BaitBuddy Cloudflare Worker
// --------------------------------------------------------------------------
// Vorgelagerter Worker fuer den Vercel -> Cloudflare Umzug. Er ersetzt die
// Aufgaben aus vercel.json:
//   1. Routing: /api/* geht an das Express-Backend, alles andere wird als
//      statische SPA aus dem Assets-Binding (env.ASSETS, Verzeichnis dist/)
//      ausgeliefert. _headers/_redirects im dist/ steuern Cache & SPA-Fallback.
//   2. Cron: die vier vercel.json-Crons laufen als Cloudflare Cron Triggers
//      (siehe wrangler.toml) und rufen die Admin-Endpunkte mit dem
//      CRON_SECRET (Authorization: Bearer) auf.
//
// Backend-Weg (in dieser Reihenfolge):
//   - env.API         : Service Binding auf den Container-Worker `baitbuddy-api`
//                       (cloudflare/backend/). Pflicht fuer das Cloudflare-Backend:
//                       ein globales fetch() auf einen anderen Worker derselben
//                       Zone (auch *.workers.dev) scheitert mit Fehler 1042.
//   - env.BACKEND_URL : Basis-URL eines externen Backends (Vercel), solange kein
//                       Binding gesetzt ist — und Rueckweg, falls es entfernt wird.
// Weitere Bindings/Variablen:
//   - env.ASSETS      : Static-Assets-Binding (dist/)
//   - env.CRON_SECRET : Secret fuer die Cron-Authentifizierung (als Secret setzen)

// Cron-Ausdruck -> Admin-Pfad. Muss synchron zu vercel.json > crons und
// docker/cron/crontab bleiben.
export const CRON_ROUTES = {
  '0 3 * * *': '/api/admin/premium/check-expiry',
  '0 2 * * *': '/api/admin/events/auto-archive',
  '0 1 * * *': '/api/admin/rewards/auto-activate',
  '0 0 1 * *': '/api/admin/leaderboards/monthly/generate',
};

// Liefert { name, send(pathAndQuery, init) } fuer das konfigurierte Backend
// oder null, wenn weder Binding noch BACKEND_URL gesetzt ist.
export function resolveBackend(env) {
  if (env.API && typeof env.API.fetch === 'function') {
    // Beim Service Binding zaehlt nur Pfad + Query; der Host ist beliebig.
    return {
      name: 'service-binding',
      send: (pathAndQuery, init) => env.API.fetch(new Request(`https://baitbuddy-api${pathAndQuery}`, init)),
    };
  }
  const base = (env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  return {
    name: base,
    send: (pathAndQuery, init) => fetch(new Request(base + pathAndQuery, init)),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API-Verkehr an das Backend weiterreichen (inkl. SSE-Streaming: der
    // Response-Body wird unveraendert durchgereicht, Cloudflare puffert SSE nicht).
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const backend = resolveBackend(env);
      if (!backend) {
        console.error('[api] Weder Service Binding API noch BACKEND_URL konfiguriert');
        return Response.json({ error: 'Backend nicht konfiguriert' }, { status: 503 });
      }
      // new Request(url, request) uebernimmt Methode, Header (inkl.
      // cf-connecting-ip fuer das Rate-Limiting) und Body-Stream.
      const proxied = new Request(url.toString(), request);
      // Original-Host fuer korrekte Absolut-URLs / Logging erhalten.
      proxied.headers.set('X-Forwarded-Host', url.host);
      proxied.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      return backend.send(url.pathname + url.search, proxied);
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
    const backend = resolveBackend(env);
    if (!backend) throw new Error('Cron: weder Service Binding API noch BACKEND_URL konfiguriert');
    const run = (async () => {
      const res = await backend.send(path, {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      const body = await res.text();
      console.log(`[cron] ${path} via ${backend.name} -> HTTP ${res.status} ${body.slice(0, 300)}`);
      if (!res.ok) throw new Error(`Cron ${path} failed with HTTP ${res.status}`);
    })();
    ctx.waitUntil(run);
    return run;
  },
};
