// BaitBuddy-Backend auf Cloudflare: eigener Worker `baitbuddy-api`, der jede
// Anfrage an die unveränderte Express-App im Container weiterreicht
// (docker/backend.Dockerfile). Getrennt vom Front-Door-Worker (cloudflare/worker.js),
// damit die Live-Seite nicht vom Container abhängt: Umgeschaltet wird erst, wenn
// dieser Worker nachweislich antwortet — über BACKEND_URL in der Root-wrangler.toml.
//
// Container brauchen den Workers Paid Plan. Deploy: .github/workflows/deploy-cloudflare-backend.yml
import { Container, getContainer } from '@cloudflare/containers';
import { containerEnv, CONTAINER_PORT } from './containerEnv.js';

export class BackendContainer extends Container {
  defaultPort = CONTAINER_PORT;
  // Nicht zu kurz: ein Kaltstart kostet Sekunden, und das KI-Latenzziel ist < 2 s.
  sleepAfter = '30m';

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = containerEnv(env);
  }
}

export default {
  async fetch(request, env) {
    // Eine benannte Instanz: Das Backend hält Caches und (ohne KV_URL) den
    // Rate-Limit-Zähler im Speicher — mehrere Instanzen würden die aufteilen.
    return getContainer(env.BACKEND, 'primary').fetch(request);
  },
};
