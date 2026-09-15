// BaitBuddy Cloudflare Worker (Front-Door + Backend-Container)
// --------------------------------------------------------------------------
// Vorgelagerter Worker fuer den Vercel -> Cloudflare Umzug. Er ersetzt die
// Aufgaben aus vercel.json:
//   1. Routing: /api/* geht an das Express-Backend, das als Cloudflare
//      Container (docker/backend.Dockerfile, backend/src/server.js auf Port
//      3000) laeuft und ueber das Durable-Object-Binding env.BACKEND
//      angesprochen wird. Alles andere wird als statische SPA aus dem
//      Assets-Binding (env.ASSETS, Verzeichnis dist/) ausgeliefert.
//      _headers/_redirects im dist/ steuern Cache & SPA-Fallback.
//   2. Cron: die vier vercel.json-Crons laufen als Cloudflare Cron Triggers
//      (siehe wrangler.toml) und rufen die Admin-Endpunkte im Container mit
//      dem CRON_SECRET (Authorization: Bearer) auf.
//
// Erwartete Bindings/Variablen (in Cloudflare / wrangler.toml gesetzt):
//   - env.ASSETS      : Static-Assets-Binding (dist/)
//   - env.BACKEND     : Durable-Object-Binding auf die Container-Klasse Backend
//   - env.CRON_SECRET : Secret fuer die Cron-Authentifizierung (als Secret setzen)
//   - Backend-Secrets (SUPABASE_*, ANTHROPIC_API_KEY, STRIPE_*, ...) werden aus
//     der Worker-Umgebung in den Container durchgereicht (siehe backendEnv()).

import { Container, getContainer } from '@cloudflare/containers';

// Cron-Ausdruck -> Admin-Pfad. Muss synchron zu vercel.json > crons,
// docker/cron/crontab und wrangler.toml [triggers] bleiben.
const CRON_ROUTES = {
  '0 3 * * *': '/api/admin/premium/check-expiry',
  '0 2 * * *': '/api/admin/events/auto-archive',
  '0 1 * * *': '/api/admin/rewards/auto-activate',
  '0 0 1 * *': '/api/admin/leaderboards/monthly/generate',
};

// Backend-Variablen/-Secrets, die aus der Worker-Umgebung an den
// Container-Prozess durchgereicht werden. Nur gesetzte, nicht-leere Strings
// werden uebergeben, damit die serverseitigen Feature-Gates (z. B. Stripe nur
// bei gesetztem Key) unveraendert greifen.
const BACKEND_ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLIC_URL',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'CLAUDE_API_KEY',
  'OPENAI_API_KEY', 'OPENAI_REALTIME_MODEL', 'OPENAI_REALTIME_VOICE',
  'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_VOICE_ID_FEMALE',
  'ELEVENLABS_MODEL_ID', 'ELEVENLABS_OUTPUT_FORMAT',
  'GOOGLE_CLOUD_API_KEY', 'GEMINI_API_KEY', 'GEMINI_TTS_MODEL',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  'CRON_SECRET', 'ALLOWED_ORIGINS', 'APP_BASE_URL', 'APP_URL',
  'ADMIN_API_KEY', 'ADMIN_EMAILS', 'DEVELOPER_EMAIL', 'SUPPORT_EMAIL',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD',
  'KV_URL', 'REDIS_URL', 'SENTRY_DSN', 'SENTRY_TRACES_SAMPLE_RATE',
  'LOG_LEVEL', 'EVENT_AUTO_DELETE_DAYS',
];

function backendEnv(env) {
  // NODE_ENV/PORT sind bereits im Dockerfile gesetzt; hier nur bekraeftigen.
  const out = { NODE_ENV: 'production', PORT: '3000' };
  for (const key of BACKEND_ENV_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

// Feste Instanz-ID: Das Express-Backend ist zustandslos (der Zustand liegt in
// Supabase), deshalb genuegt eine geteilte Container-Instanz fuer den gesamten
// /api-Verkehr. Skalierung ueber max_instances in wrangler.toml.
const BACKEND_INSTANCE = 'backend';

export class Backend extends Container {
  defaultPort = 3000; // backend/src/server.js: app.listen(PORT), Default 3000
  sleepAfter = '15m'; // Idle-Instanz nach 15 Minuten schlafen legen
  enableInternet = true; // Supabase/Anthropic/Stripe/SMTP brauchen Outbound

  constructor(ctx, env) {
    super(ctx, env);
    // Secrets/Variablen aus der Worker-Umgebung an den Container-Prozess geben.
    this.envVars = backendEnv(env);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API-Verkehr an das Backend im Container weiterreichen. getContainer(...)
    // .fetch reicht den Body unveraendert durch (inkl. SSE-Streaming). Die
    // Express-App mountet alle Routen unter /api, der Original-Pfad bleibt also
    // erhalten und muss nicht umgeschrieben werden.
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return getContainer(env.BACKEND, BACKEND_INSTANCE).fetch(request);
    }

    // Alles andere: statische SPA aus dem Assets-Binding (dist/).
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    const path = CRON_ROUTES[event.cron];
    if (!path) {
      console.error('[cron] Unbekannter Cron-Ausdruck:', event.cron);
      return;
    }
    const run = (async () => {
      const res = await getContainer(env.BACKEND, BACKEND_INSTANCE).fetch(
        new Request(`http://backend${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
        }),
      );
      const body = await res.text();
      console.log(`[cron] ${path} -> HTTP ${res.status} ${body.slice(0, 300)}`);
      if (!res.ok) throw new Error(`Cron ${path} failed with HTTP ${res.status}`);
    })();
    ctx.waitUntil(run);
    return run;
  },
};
