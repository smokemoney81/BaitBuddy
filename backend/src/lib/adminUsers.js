// Gemeinsamer Zugriff auf die Supabase-Nutzerliste (Service-Role).
// ============================================================================
// Zwei Fallen, die hier zentral erledigt werden:
//
//  1. `supabase.auth.admin.listUsers()` liefert NICHT direkt ein Array, sondern
//     `{ data: { users: [...], nextPage, lastPage, total }, error }`. Ein
//     `const { data: users } = ...` gefolgt von `for (const u of users)` wirft
//     deshalb "users is not iterable" — genau daran ist der tägliche
//     Premium-Ablauf-Cron bei jedem Lauf gescheitert.
//  2. Die Liste ist seitenweise (Default 50 Einträge). Ohne Paginierung würde
//     der Cron nur die ersten 50 Konten prüfen und alle weiteren stillschweigend
//     übergehen.

const PER_PAGE = 200;
// Deckel gegen eine Endlosschleife, falls die API dauerhaft eine volle Seite
// meldet. 100 Seiten * 200 = 20.000 Konten.
const MAX_PAGES = 100;

/**
 * Liest alle Nutzer über alle Seiten hinweg.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ users: any[], error: any }>}
 */
export async function listAllUsers(supabase) {
  const all = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return { users: all, error };

    const batch = Array.isArray(data?.users) ? data.users : [];
    all.push(...batch);

    if (batch.length < PER_PAGE) break;
  }

  return { users: all, error: null };
}

/**
 * Reduziert einen Supabase-Auth-User auf die Felder, die die Admin-Oberfläche
 * tatsächlich anzeigt. Bewusst schmal: der rohe User enthält Tokens,
 * Identitäten und App-Metadaten, die im Frontend nichts verloren haben.
 */
export function toAdminUserSummary(user) {
  const meta = user?.app_metadata || {};
  // Name/Spitzname liegen in user_metadata (PATCH /auth/me, Registrierung),
  // Plan-Felder in app_metadata. Früher wurde der Name aus app_metadata
  // gelesen — die Admin-Liste zeigte deshalb bei niemandem einen Namen.
  const profile = user?.user_metadata || {};
  return {
    id: user.id,
    email: user.email || '',
    full_name: profile.full_name || profile.nickname || '',
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    premium_plan_id: meta.premium_plan_id || 'free',
    premium_expires_at: meta.premium_expires_at || null,
  };
}
