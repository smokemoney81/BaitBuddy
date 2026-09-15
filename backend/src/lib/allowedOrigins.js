// Zentrale Quelle der erlaubten Web-Origins (CORS + Origin-Validierung als
// Defense-in-depth). Wird von server.js (cors) und middleware/security.js
// (validateOrigin) gemeinsam genutzt, damit die Liste nur an EINER Stelle lebt.
//
// Steuerung:
// - ALLOWED_ORIGINS (Komma-Liste vollstaendiger Origins) hat Vorrang und ersetzt
//   die Defaults komplett. Nach dem Cloudflare-Umzug wird die neue Domain hier
//   gesetzt (z. B. "https://app.baitbuddy.example,capacitor://localhost").
// - Ohne ALLOWED_ORIGINS greift eine Standardliste: lokale Dev-/Capacitor-Origins
//   plus die aktuell produktiven Domains. APP_URL/APP_BASE_URL werden – falls
//   gesetzt – zusaetzlich aufgenommen, sodass eine neue Domain ohne Codeaenderung
//   erlaubt ist.
//
// Die frueher an zwei Stellen hartkodierte Vercel-Domain bleibt uebergangsweise
// als Default erlaubt und faellt weg, sobald ALLOWED_ORIGINS gesetzt ist.

const STATIC_DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'capacitor://localhost',
  'https://bait-buddy.vercel.app',
  'https://catchgbt.com',
  'https://www.catchgbt.com',
];

export function getAllowedOrigins() {
  const explicit = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;

  const dynamic = [process.env.APP_URL, process.env.APP_BASE_URL]
    .map((s) => (s || '').trim())
    .filter(Boolean);

  return [...new Set([...dynamic, ...STATIC_DEFAULT_ORIGINS])];
}
