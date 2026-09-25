import { describe, it, expect } from 'vitest';
import { containerEnv, FORWARDED_ENV } from './containerEnv.js';

describe('containerEnv', () => {
  it('reicht nur bekannte, gesetzte Werte durch', () => {
    const env = containerEnv({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      SMTP_PASSWORD: '',
      BACKEND: { binding: true },
      UNRELATED: 'nope',
    });
    expect(env).toEqual({
      NODE_ENV: 'production',
      PORT: '3000',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
  });

  it('deckt jede Variable aus backend/.env.example ab', async () => {
    const { readFileSync } = await import('node:fs');
    const example = readFileSync(new URL('../../backend/.env.example', import.meta.url), 'utf8');
    const names = [...example.matchAll(/^#?\s?([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
    // Vom Container selbst gesetzt bzw. nur für Vercel/lokal relevant.
    const notForwarded = new Set(['NODE_ENV', 'PORT', 'VERCEL']);
    const missing = names.filter((n) => !notForwarded.has(n) && !FORWARDED_ENV.includes(n));
    expect(missing).toEqual([]);
  });
});
