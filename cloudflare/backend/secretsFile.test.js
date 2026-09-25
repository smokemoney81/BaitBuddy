import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSecrets, varsFromWranglerToml } from './secretsFile.js';

describe('varsFromWranglerToml', () => {
  it('liest nur Namen aus dem [vars]-Abschnitt', () => {
    const toml = 'name = "x"\n[vars]\nAPP_URL = "a"\n# KOMMENTAR = "b"\nREAD_ONLY_FS = "1"\n[[migrations]]\ntag = "v1"\n';
    expect([...varsFromWranglerToml(toml)]).toEqual(['APP_URL', 'READ_ONLY_FS']);
  });

  it('erkennt die Vars der echten Backend-Konfiguration', () => {
    const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
    const vars = varsFromWranglerToml(toml);
    expect(vars.has('SUPABASE_URL')).toBe(true);
    expect(vars.has('READ_ONLY_FS')).toBe(true);
    expect(vars.has('SUPABASE_SERVICE_ROLE_KEY')).toBe(false);
  });
});

describe('buildSecrets', () => {
  it('übernimmt nur weitergereichte, gesetzte Namen, die keine Vars sind', () => {
    const secrets = buildSecrets(
      {
        SUPABASE_SERVICE_ROLE_KEY: 'srk',
        ANTHROPIC_API_KEY: 'ak',
        SMTP_PASSWORD: '',
        SUPABASE_URL: 'https://doppelt.supabase.co',
        CLOUDFLARE_API_TOKEN: 'fremd',
        github_token: 'fremd',
      },
      new Set(['SUPABASE_URL']),
    );
    expect(secrets).toEqual({ SUPABASE_SERVICE_ROLE_KEY: 'srk', ANTHROPIC_API_KEY: 'ak' });
  });
});
