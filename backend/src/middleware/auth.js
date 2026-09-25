import { supabase } from '../lib/supabase.js';

// Kurzlebiger Cache für die Token-Verifikation. supabase.auth.getUser(token)
// ist ein Netzwerk-Roundtrip zu GoTrue — ohne Cache passiert der bei JEDEM
// authentifizierten Request. Innerhalb einer warmen Serverless-Instanz, die
// mehrere Requests desselben Nutzers bedient, spart der Cache diese Roundtrips.
// Bewusst kurze TTL, damit ein widerrufenes Token nur maximal TTL-lang gültig
// bleibt. Der Cache ist pro Instanz (wie das Rate-Limiting) — kein globaler
// Zustand nötig, da er nur ein Optimierung ist, keine Sicherheitsgrenze.
const TOKEN_CACHE_TTL_MS = 60 * 1000;
const TOKEN_CACHE_MAX = 1000;
const tokenCache = new Map(); // token -> { user, expires }

function getCachedUser(token) {
  const hit = tokenCache.get(token);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    tokenCache.delete(token);
    return null;
  }
  return hit.user;
}

function setCachedUser(token, user) {
  // Einfache Größenbegrenzung: ältesten Eintrag entfernen (Map ist
  // insertion-ordered), damit der Cache nicht unbegrenzt wächst.
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
  tokenCache.set(token, { user, expires: Date.now() + TOKEN_CACHE_TTL_MS });
}

async function resolveUser(token) {
  const cached = getCachedUser(token);
  if (cached) return cached;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  setCachedUser(token, data.user);
  return data.user;
}

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Kein Token' });

  const user = await resolveUser(token);
  if (!user) return res.status(401).json({ error: 'Ungültiger Token' });

  req.user = user;
  next();
}

export async function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const user = await resolveUser(token);
    if (user) req.user = user;
  }
  next();
}

// Nach jeder serverseitigen Änderung an den Metadaten eines Nutzers aufrufen.
// Sonst liefert requireAuth bis zu TOKEN_CACHE_TTL_MS lang das alte
// Nutzerobjekt aus — etwa einen noch nicht freigeschalteten Plan direkt nach
// dem Kauf. Wirkt nur auf diese Instanz (wie der Cache selbst).
export function invalidateCachedUser(userId) {
  if (!userId) return;
  for (const [token, entry] of tokenCache) {
    if (entry.user?.id === userId) tokenCache.delete(token);
  }
}

// Liefert den aktuellen Stand eines Nutzers direkt aus GoTrue. Für jedes
// Read-Modify-Write auf user_metadata/app_metadata Pflicht: req.user kann aus
// dem Token-Cache stammen und bis zu einer Minute alt sein. Ein Merge auf
// diesem Stand würde zwischenzeitliche Änderungen (Plan-Aktivierung per
// Webhook, parallele Einstellungs-Speicherung) still zurückdrehen.
// Fällt bei einem Lesefehler auf das übergebene Objekt zurück.
export async function getFreshUser(user) {
  if (!user?.id) return user;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(user.id);
    if (!error && data?.user) return data.user;
  } catch {
    // Fallback unten
  }
  return user;
}

// Nur für Tests: Cache leeren, damit sich Testfälle nicht gegenseitig
// beeinflussen.
export function __clearTokenCache() {
  tokenCache.clear();
}

// Muss NACH requireAuth in der Middleware-Kette stehen (braucht req.user).
// Admin-Status ist eine Allowlist per E-Mail statt eines DB-Flags — es gibt
// aktuell keine Rollen-Spalte, die vom Backend gepflegt wird.
// Auch von /api/auth/me genutzt, damit die Oberfläche denselben Maßstab
// anlegt wie das Gate hier. Vorher prüfte AdminUsers.jsx ein `role`-Feld, das
// es nirgends gibt — die Seite sperrte damit auch echte Admins aus.
// Superuser: das einzige Konto mit Zugriff auf den Admin-Bereich
// (/api/superadmin/*, Seite /Admin). Per Env überschreibbar, damit eine andere
// Installation (Self-Hosting) ihren eigenen Betreiber eintragen kann.
const DEFAULT_SUPERUSER_EMAIL = 'kaisaschnitt99@gmail.com';

export function superuserEmail() {
  return String(process.env.SUPERUSER_EMAIL || DEFAULT_SUPERUSER_EMAIL).trim().toLowerCase();
}

export function isSuperuserEmail(email) {
  if (!email) return false;
  return String(email).trim().toLowerCase() === superuserEmail();
}

export function requireSuperuser(req, res, next) {
  if (!isSuperuserEmail(req.user?.email)) {
    return res.status(403).json({ error: 'Nur für den Superuser' });
  }
  next();
}

export function isAdminEmail(email) {
  if (!email) return false;
  // Der Superuser ist immer auch Admin (Karten-Downloads, Vereins-Verifizierung …).
  if (isSuperuserEmail(email)) return true;
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(String(email).toLowerCase());
}

export function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: 'Admin-Berechtigung erforderlich' });
  }
  next();
}
