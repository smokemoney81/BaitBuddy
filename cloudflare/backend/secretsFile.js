// Baut die Secrets-Datei fuer `wrangler deploy --secrets-file` aus den
// GitHub-Secrets (JSON, als Env GH_SECRETS). Uebernommen werden nur Namen aus
// FORWARDED_ENV, die nicht schon als [vars] in wrangler.toml stehen — sonst
// lehnt Cloudflare die doppelte Bindung ab. Secrets, die nur am Worker
// (Dashboard) gesetzt sind, bleiben unberuehrt: --secrets-file wirkt additiv.
//
// Aufruf (Workflow): node cloudflare/backend/secretsFile.js <ausgabe.json>
// Ausgabe auf stdout: nur die NAMEN der uebernommenen Secrets, nie Werte.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORWARDED_ENV } from './containerEnv.js';

export function varsFromWranglerToml(toml) {
  const names = new Set();
  let inVars = false;
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) inVars = line === '[vars]';
    else if (inVars) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=/);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

export function buildSecrets(ghSecrets, varNames) {
  const out = {};
  for (const name of FORWARDED_ENV) {
    if (varNames.has(name)) continue;
    const value = ghSecrets[name];
    if (typeof value === 'string' && value !== '') out[name] = value;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error('Aufruf: node cloudflare/backend/secretsFile.js <ausgabe.json>');
    process.exit(2);
  }
  const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
  const secrets = buildSecrets(JSON.parse(process.env.GH_SECRETS || '{}'), varsFromWranglerToml(toml));
  writeFileSync(target, JSON.stringify(secrets), { mode: 0o600 });
  console.log(`Secrets aus GitHub: ${Object.keys(secrets).join(', ') || '(keine)'}`);
}
