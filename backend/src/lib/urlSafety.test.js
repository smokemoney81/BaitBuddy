import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase.js', () => ({
  supabaseUrl: 'https://projekt.supabase.co',
}));

const { isAllowedFetchUrl } = await import('./urlSafety.js');

// Regressionstests zu "AI-URL-Sicherheit" (Meilenstein 4).
// Mehrere Routen fetchen serverseitig eine vom Client genannte URL. Ohne
// Host-Whitelist waere das ein SSRF-Gadget: auth-geschuetzt, aber der Server
// wuerde jede genannte Adresse abrufen — interne Dienste, Cloud-Metadaten.
describe('isAllowedFetchUrl', () => {
  it('erlaubt Dateien aus dem eigenen Supabase-Storage', () => {
    expect(isAllowedFetchUrl('https://projekt.supabase.co/storage/v1/object/public/catches/f.jpg')).toBe(true);
  });

  it('lehnt fremde Hosts ab', () => {
    expect(isAllowedFetchUrl('https://angreifer.example/bild.jpg')).toBe(false);
  });

  it('lehnt Cloud-Metadaten-Endpunkte ab', () => {
    expect(isAllowedFetchUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedFetchUrl('https://metadata.google.internal/computeMetadata/v1/')).toBe(false);
  });

  it('lehnt interne Adressen ab', () => {
    expect(isAllowedFetchUrl('http://localhost:3000/admin')).toBe(false);
    expect(isAllowedFetchUrl('https://127.0.0.1/')).toBe(false);
    expect(isAllowedFetchUrl('http://10.0.0.1/')).toBe(false);
  });

  it('verlangt HTTPS — auch beim eigenen Host', () => {
    expect(isAllowedFetchUrl('http://projekt.supabase.co/datei.jpg')).toBe(false);
  });

  it('lehnt andere Protokolle ab', () => {
    expect(isAllowedFetchUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedFetchUrl('ftp://projekt.supabase.co/datei')).toBe(false);
    expect(isAllowedFetchUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isAllowedFetchUrl('gopher://projekt.supabase.co/')).toBe(false);
  });

  it('laesst sich nicht durch aehnliche Hostnamen taeuschen', () => {
    expect(isAllowedFetchUrl('https://projekt.supabase.co.angreifer.example/f.jpg')).toBe(false);
    expect(isAllowedFetchUrl('https://boeseprojekt.supabase.co/f.jpg')).toBe(false);
    // Zugangsdaten im Autoritaetsteil: der echte Host ist hier angreifer.example.
    expect(isAllowedFetchUrl('https://projekt.supabase.co@angreifer.example/f.jpg')).toBe(false);
  });

  it('lehnt unbrauchbare Eingaben ab, statt zu werfen', () => {
    expect(isAllowedFetchUrl('')).toBe(false);
    expect(isAllowedFetchUrl(null)).toBe(false);
    expect(isAllowedFetchUrl(undefined)).toBe(false);
    expect(isAllowedFetchUrl('keine url')).toBe(false);
    expect(isAllowedFetchUrl('/relativ/pfad.jpg')).toBe(false);
  });
});
