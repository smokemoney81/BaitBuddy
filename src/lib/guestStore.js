// Lokaler Datenspeicher für den Gastmodus.
//
// Ein Gast hat kein `bb_token` und kann die geschützten Backend-Endpunkte damit
// nicht nutzen — jeder Schreibvorgang lief vorher in einen 401. Fänge und Spots,
// die ein Gast anlegt, landen deshalb hier im localStorage und werden beim
// späteren Anmelden bzw. Registrieren einmalig ins Konto übernommen
// (`migrateGuestData`), damit der Nutzer nichts doppelt erfassen muss.

const PREFIX = 'bb_guest_entity_';
const MIGRATION_LOCK_KEY = 'bb_guest_migration_running';
const MIGRATION_RESULT_KEY = 'bb_guest_migration_result';
export const GUEST_MIGRATION_EVENT = 'guest-migration-finished';

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

// Anzahl lokaler Gast-Datensätze je Entity, z. B. { Catch: 3, Spot: 1, total: 4 }.
export function guestDataSummary() {
  const summary = { total: 0 };
  for (const entityName of GUEST_ENTITIES) {
    const count = readAll(entityName).length;
    summary[entityName] = count;
    summary.total += count;
  }
  return summary;
}

// Wohin nach Login/Registrierung: Liegen noch Gastdaten auf dem Gerät, zeigt
// die Übernahme-Seite, was ins Konto wandert (und ob es geklappt hat).
export function postLoginPath() {
  return hasGuestData() ? '/GastdatenUebernehmen' : '/Dashboard';
}

export function isGuestMigrationRunning() {
  try {
    return typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(MIGRATION_LOCK_KEY);
  } catch {
    return false;
  }
}

export function readGuestMigrationResult() {
  try {
    const raw = JSON.parse(localStorage.getItem(MIGRATION_RESULT_KEY) || 'null');
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function writeGuestMigrationResult(result) {
  try {
    localStorage.setItem(MIGRATION_RESULT_KEY, JSON.stringify(result));
  } catch {
    // Ohne Storage fehlt nur die Rückmeldung, die Daten sind übertragen.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GUEST_MIGRATION_EVENT, { detail: result }));
  }
}

// Die lokal vergebene `id` und die Zeitstempel gehören zum Gast-Speicher, nicht
// zum Datensatz — das Backend vergibt beim Anlegen eigene.
function stripLocalFields(record) {
  const { id: _id, updated_date: _updated_date, ...rest } = record;
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
 * @returns {Promise<{ migrated: number, failed: number, byEntity: Record<string, number> }>}
 */
export async function migrateGuestData(entityClients) {
  // Ein zweiter Durchlauf (z. B. weil der Auth-Listener zweimal feuert) würde
  // dieselben Datensätze ein zweites Mal anlegen.
  if (typeof sessionStorage !== 'undefined') {
    try {
      if (sessionStorage.getItem(MIGRATION_LOCK_KEY)) return { migrated: 0, failed: 0, byEntity: {} };
      sessionStorage.setItem(MIGRATION_LOCK_KEY, '1');
    } catch {
      // Ohne sessionStorage läuft die Migration ohne Sperre — der Aufrufer in
      // AuthContext ruft sie ohnehin nur einmal pro Anmeldung auf.
    }
  }

  let migrated = 0;
  let failed = 0;
  const byEntity = {};
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
          byEntity[entityName] = (byEntity[entityName] || 0) + 1;
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

  const result = { migrated, failed, byEntity };
  if (migrated > 0 || failed > 0) writeGuestMigrationResult({ ...result, at: new Date().toISOString() });
  return result;
}
