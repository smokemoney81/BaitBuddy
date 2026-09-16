// Lokaler Datenspeicher für den Gastmodus.
//
// Ein Gast hat kein `bb_token` und kann die geschützten Backend-Endpunkte damit
// nicht nutzen — jeder Schreibvorgang lief vorher in einen 401. Fänge und Spots,
// die ein Gast anlegt, landen deshalb hier im localStorage und werden beim
// späteren Anmelden bzw. Registrieren einmalig ins Konto übernommen
// (`migrateGuestData`), damit der Nutzer nichts doppelt erfassen muss.

const PREFIX = 'bb_guest_entity_';
const MIGRATION_LOCK_KEY = 'bb_guest_migration_running';

// Entities, die ein Gast lokal anlegen darf. Alles andere bleibt am Backend —
// Community, Käufe oder Events ergeben ohne Konto keinen Sinn.
export const GUEST_ENTITIES = ['Catch', 'Spot'];

export function isGuestEntity(entityName) {
  return GUEST_ENTITIES.includes(entityName);
}

function storageKey(entityName) {
  return `${PREFIX}${entityName}`;
}

function readAll(entityName) {
  try {
    const raw = localStorage.getItem(storageKey(entityName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entityName, records) {
  try {
    localStorage.setItem(storageKey(entityName), JSON.stringify(records));
    return true;
  } catch {
    // Quota voll oder Storage gesperrt (Private Mode). Der Aufrufer erfährt das
    // über den Rückgabewert und kann es dem Nutzer melden, statt einen
    // vermeintlich gespeicherten Datensatz vorzutäuschen.
    return false;
  }
}

function newId() {
  const uid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `guest_${uid}`;
}

export function guestList(entityName) {
  return readAll(entityName);
}

export function guestGet(entityName, id) {
  return readAll(entityName).find((r) => r.id === id) || null;
}

export function guestFilter(entityName, filters = {}) {
  const entries = Object.entries(filters).filter(([, v]) => v != null);
  if (entries.length === 0) return readAll(entityName);
  return readAll(entityName).filter((record) =>
    entries.every(([key, value]) => String(record[key]) === String(value))
  );
}

export function guestCreate(entityName, data) {
  const now = new Date().toISOString();
  const record = {
    ...data,
    id: newId(),
    created_date: data?.created_date || now,
    updated_date: now,
  };
  const records = readAll(entityName);
  records.unshift(record);
  if (!writeAll(entityName, records)) {
    throw new Error('Gerätespeicher voll — der Eintrag konnte nicht gesichert werden.');
  }
  return record;
}

export function guestUpdate(entityName, id, data) {
  const records = readAll(entityName);
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;
  records[index] = { ...records[index], ...data, id, updated_date: new Date().toISOString() };
  if (!writeAll(entityName, records)) {
    throw new Error('Gerätespeicher voll — die Änderung konnte nicht gesichert werden.');
  }
  return records[index];
}

export function guestDelete(entityName, id) {
  const records = readAll(entityName);
  const remaining = records.filter((r) => r.id !== id);
  writeAll(entityName, remaining);
  return { ok: true };
}

export function clearGuestData() {
  for (const entityName of GUEST_ENTITIES) {
    try {
      localStorage.removeItem(storageKey(entityName));
    } catch {
      // Ohne Storage gibt es auch nichts zu löschen.
    }
  }
}

export function hasGuestData() {
  return GUEST_ENTITIES.some((entityName) => readAll(entityName).length > 0);
}

// Die lokal vergebene `id` und die Zeitstempel gehören zum Gast-Speicher, nicht
// zum Datensatz — das Backend vergibt beim Anlegen eigene.
function stripLocalFields(record) {
  const { id, updated_date, ...rest } = record;
  return rest;
}

/**
 * Überträgt alle Gast-Datensätze in das jetzt angemeldete Konto.
 *
 * Läuft bewusst pro Datensatz und entfernt nur die tatsächlich übernommenen aus
 * dem lokalen Speicher: bricht die Übertragung in der Mitte ab (Netz weg,
 * Serverfehler), bleibt der Rest erhalten und wird beim nächsten Anmelden erneut
 * versucht. Ein Alles-oder-nichts-Löschen würde Nutzerdaten verlieren.
 *
 * @param {Record<string, { create: (data: any) => Promise<any> }>} entityClients
 * @returns {Promise<{ migrated: number, failed: number }>}
 */
export async function migrateGuestData(entityClients) {
  // Ein zweiter Durchlauf (z. B. weil der Auth-Listener zweimal feuert) würde
  // dieselben Datensätze ein zweites Mal anlegen.
  if (typeof sessionStorage !== 'undefined') {
    try {
      if (sessionStorage.getItem(MIGRATION_LOCK_KEY)) return { migrated: 0, failed: 0 };
      sessionStorage.setItem(MIGRATION_LOCK_KEY, '1');
    } catch {
      // Ohne sessionStorage läuft die Migration ohne Sperre — der Aufrufer in
      // AuthContext ruft sie ohnehin nur einmal pro Anmeldung auf.
    }
  }

  let migrated = 0;
  let failed = 0;
  try {
    for (const entityName of GUEST_ENTITIES) {
      const records = readAll(entityName);
      if (records.length === 0) continue;

      const client = entityClients?.[entityName];
      if (!client?.create) {
        failed += records.length;
        continue;
      }

      const remaining = [];
      for (const record of records) {
        try {
          await client.create(stripLocalFields(record));
          migrated += 1;
        } catch {
          remaining.push(record);
          failed += 1;
        }
      }
      writeAll(entityName, remaining);
    }
  } finally {
    try {
      sessionStorage?.removeItem(MIGRATION_LOCK_KEY);
    } catch {
      // ignore
    }
  }

  return { migrated, failed };
}
