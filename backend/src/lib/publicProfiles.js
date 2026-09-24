// Öffentliche Autoren-Angaben statt E-Mail-Adressen.
// ============================================================================
// Community-, Voting-, Clan- und Event-Tabellen führen den Autor als E-Mail
// (`created_by`, teils `user_id`). Diese Werte gingen bisher unverändert an
// jeden Aufrufer — viele Endpunkte sind sogar ohne Anmeldung erreichbar. Damit
// konnte jeder die E-Mail-Adressen aller aktiven Nutzer einsammeln.
//
// Stattdessen bekommt jede Zeile ein öffentliches Profil
//   { id, name, avatar_url, badges }
// und ein Flag, ob sie dem Aufrufer selbst gehört. Die E-Mail-Spalten werden
// entfernt. Der Anzeigename wird NIE aus der E-Mail abgeleitet (auch der
// lokale Teil enthält oft den Klarnamen).
//
// Die Zuordnung E-Mail → Profil kommt aus der Auth-Nutzerliste (Service-Role)
// und wird kurz zwischengespeichert, damit nicht jede Liste alle Nutzer lädt.

import { supabase } from './supabase.js';
import { listAllUsers } from './adminUsers.js';
import { MemoryCache } from './memoryCache.js';

const DIRECTORY_TTL_MS = 5 * 60 * 1000;
const directoryCache = new MemoryCache({ defaultTtlMs: DIRECTORY_TTL_MS, maxEntries: 1 });
const DIRECTORY_KEY = 'profiles';
const MAX_NAME_CHARS = 60;

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Anzeigename aus dem Profil — Spitzname vor Klarname, sonst neutraler Platzhaltername. */
export function displayNameOf(user) {
  const meta = user?.user_metadata || {};
  const name = firstText(meta.nickname, meta.full_name, meta.name);
  if (name) return name.slice(0, MAX_NAME_CHARS);
  const suffix = String(user?.id || '').replace(/-/g, '').slice(0, 4).toUpperCase();
  return suffix ? `Angler ${suffix}` : 'Angler';
}

export function toPublicProfile(user) {
  const meta = user?.user_metadata || {};
  return {
    id: user?.id || null,
    name: displayNameOf(user),
    avatar_url: firstText(meta.profile_picture_url, meta.profile_image_url, meta.avatar_url),
    badges: Array.isArray(meta.badges) ? meta.badges.filter((b) => typeof b === 'string') : [],
  };
}

const UNKNOWN_AUTHOR = Object.freeze({ id: null, name: 'Angler', avatar_url: null, badges: [] });

/**
 * Lädt die Zuordnung E-Mail (kleingeschrieben) → öffentliches Profil.
 * Schlägt das Laden fehl, kommt eine leere Zuordnung zurück: Die Liste wird
 * dann mit neutralen Namen ausgeliefert, E-Mails bleiben trotzdem entfernt.
 * @returns {Promise<Map<string, ReturnType<typeof toPublicProfile>>>}
 */
export async function loadProfileDirectory() {
  try {
    return await directoryCache.wrap(DIRECTORY_KEY, async () => {
      const { users, error } = await listAllUsers(supabase);
      if (error) throw error;
      const map = new Map();
      for (const user of users) {
        if (user?.email) map.set(String(user.email).toLowerCase(), toPublicProfile(user));
      }
      return map;
    });
  } catch (error) {
    console.error('[publicProfiles] Nutzerverzeichnis nicht ladbar:', error?.message || error);
    return new Map();
  }
}

/** Nach Profiländerungen (Name, Avatar) den Cache verwerfen. */
export function invalidateProfileDirectory() {
  directoryCache.delete(DIRECTORY_KEY);
}

export function publicAuthor(email, directory) {
  if (!email) return { ...UNKNOWN_AUTHOR };
  return directory?.get(String(email).toLowerCase()) || { ...UNKNOWN_AUTHOR };
}

const sameEmail = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Ersetzt in jeder Zeile die E-Mail in `field` durch ein Profil-Objekt.
 * @param {object[]} rows
 * @param {object} options
 * @param {string} options.field     Spalte mit der E-Mail (z. B. 'created_by').
 * @param {string} options.as        Name des Profil-Felds (z. B. 'author').
 * @param {string} options.ownFlag   Name des Eigentümer-Flags (z. B. 'is_own').
 * @param {string|null|undefined} options.viewerEmail E-Mail des Aufrufers.
 * @param {Map} options.directory    Ergebnis von loadProfileDirectory().
 * @param {string[]} [options.alsoStrip] Weitere E-Mail-Spalten, die entfernt werden.
 */
export function replaceEmails(rows, { field, as, ownFlag, viewerEmail, directory, alsoStrip = [] }) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const email = row[field];
    const copy = { ...row };
    delete copy[field];
    for (const col of alsoStrip) delete copy[col];
    copy[as] = publicAuthor(email, directory);
    copy[ownFlag] = sameEmail(email, viewerEmail);
    return copy;
  });
}

/** Ersetzt eine Liste von E-Mails (z. B. Clan-Mitglieder) durch Profile. */
export function replaceEmailList(emails, directory) {
  return (Array.isArray(emails) ? emails : []).map((email) => publicAuthor(email, directory));
}

// Nur für Tests.
export function __resetProfileDirectory() {
  directoryCache.clear?.();
  directoryCache.delete(DIRECTORY_KEY);
}
