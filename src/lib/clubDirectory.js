// Vereinsverzeichnis aus den mitgelieferten Datendateien (src/data). Wird erst
// bei Bedarf geladen (eigener Chunk), damit die ~180 KB nicht im Start-Bundle
// landen. Ein gepflegtes Vereinsprofil (Backend /api/clubs) ergänzt bzw.
// überschreibt diese Grunddaten.

let cache = null;

function normalize(entry) {
  const address = entry.address || {};
  return {
    ref: String(entry.id),
    name: entry.name,
    city: entry.city || address.city || null,
    postal_code: entry.postal_code || address.postal_code || null,
    street: entry.street || address.street || null,
    phone: entry.phone || null,
    email: entry.email || null,
    website: entry.website || null,
    latitude: entry.coordinates?.lat ?? null,
    longitude: entry.coordinates?.lng ?? null,
  };
}

export function buildDirectory(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list : []) {
      if (!entry?.id || !entry?.name || entry.category !== 'club') continue;
      const key = String(entry.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalize(entry));
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function loadClubDirectory() {
  if (!cache) {
    cache = Promise.all([
      import('@/data/fishingClubsCSVExport.json'),
      import('@/data/angelparks-export.json'),
    ]).then(([clubs, parks]) => buildDirectory(clubs.default, parks.default));
  }
  return cache;
}

export function searchDirectory(entries, query, limit = 30) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  return entries
    .filter(e => e.name.toLowerCase().includes(q) || (e.city || '').toLowerCase().includes(q) || (e.postal_code || '').startsWith(q))
    .slice(0, limit);
}
