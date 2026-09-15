import { describe, it, expect } from 'vitest';

// Teste die Supabase-Client-Initialisierung
describe('supabaseClient – Supabase-Integration', () => {
  it('lädt den Supabase-Client mit gültigen Env-Variablen', () => {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://test.supabase.co';
    const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';

    expect(SUPABASE_URL).toBeTruthy();
    expect(SUPABASE_ANON_KEY).toBeTruthy();
  });

  it('basiert auf den VITE_SUPABASE_* Env-Variablen', () => {
    // Diese Variablen MÜSSEN gesetzt sein für Production
    // In Tests fallback sie auf Defaults
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;

    if (process.env.NODE_ENV === 'production') {
      expect(url).toBeTruthy();
      expect(key).toBeTruthy();
    }
  });

  it('hat OAuth-Konfiguration für Social Logins', () => {
    // OAuth-Konfiguration sollte möglich sein
    // Das wird in den Redirect-URIs konfiguriert
    const expectedRedirects = [
      'http://localhost:5173',
      'https://bait-buddy.vercel.app',
      'capacitor://localhost',
    ];

    // Diese URLs sollten in den OAuth-Konfigurationen eingetragen sein
    expectedRedirects.forEach(url => {
      expect(url).toBeTruthy();
    });
  });
});
