// Clerk als zusätzlicher Anmeldeweg (neben E-Mail/Passwort und Supabase-OAuth).
//
// Clerk ersetzt die Supabase-Auth NICHT: Konten, Plan, Referral, Superuser und
// RLS hängen weiter am Supabase-Nutzer. POST /api/auth/clerk prüft hier das
// Clerk-Session-Token, liest die bei Clerk VERIFIZIERTE E-Mail und stellt für
// den Supabase-Nutzer mit dieser E-Mail eine normale bb_token-Sitzung aus
// (routes/auth.js). Danach läuft die App exakt wie nach einem Passwort-Login.
//
// Env:
//   CLERK_SECRET_KEY  (Pflicht)  Backend-API-Key (sk_live_… / sk_test_…)
//   CLERK_JWT_KEY     (optional) PEM-Public-Key → Token-Prüfung ohne Netzwerk
import { verifyToken, createClerkClient } from '@clerk/backend';
import { getAllowedOrigins } from './allowedOrigins.js';

export function isClerkConfigured() {
  return Boolean((process.env.CLERK_SECRET_KEY || '').trim());
}

let client = null;
function clerkClient() {
  if (!client) client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
  return client;
}

export class ClerkAuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Liefert die primäre E-Mail nur, wenn Clerk ihre Inhaberschaft bestätigt hat.
// Eine unbestätigte Adresse darf nie einem bestehenden Konto zugeordnet werden —
// sonst könnte jeder mit einer fremden E-Mail dessen Konto übernehmen.
export function verifiedPrimaryEmail(user) {
  const primary = (user?.emailAddresses || []).find((e) => e.id === user?.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified') return null;
  return String(primary.emailAddress || '').trim().toLowerCase() || null;
}

export async function resolveClerkIdentity(sessionToken) {
  if (!isClerkConfigured()) throw new ClerkAuthError('Clerk-Anmeldung ist nicht eingerichtet', 503);
  if (!sessionToken || typeof sessionToken !== 'string') throw new ClerkAuthError('Token fehlt', 400);

  let payload;
  try {
    payload = await verifyToken(sessionToken, {
      secretKey: process.env.CLERK_SECRET_KEY.trim(),
      jwtKey: (process.env.CLERK_JWT_KEY || '').trim() || undefined,
      // Nur Tokens, die auf unseren eigenen Seiten ausgestellt wurden (azp).
      authorizedParties: getAllowedOrigins(),
    });
  } catch {
    throw new ClerkAuthError('Clerk-Sitzung ungültig oder abgelaufen', 401);
  }
  if (!payload?.sub) throw new ClerkAuthError('Clerk-Sitzung ungültig oder abgelaufen', 401);

  const user = await clerkClient().users.getUser(payload.sub);
  const email = verifiedPrimaryEmail(user);
  if (!email) throw new ClerkAuthError('Deine E-Mail-Adresse ist bei Clerk nicht bestätigt', 403);

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return { email, fullName };
}

// Nur für Tests: den zwischengespeicherten Client verwerfen.
export function _resetClerkClient() {
  client = null;
}
