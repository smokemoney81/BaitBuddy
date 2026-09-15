import { vi } from 'vitest';

// Generischer chainbarer Query-Builder-Mock für den Supabase-JS-Client.
// Jede Methode (.select/.eq/.order/.insert/...) gibt sich selbst zurück, damit
// beliebige Aufruf-Ketten funktionieren; `resolveWith`/`rejectWith` legen fest,
// was ein `await` auf die Kette liefert (Supabase-Client-Antworten sind
// thenable, kein echtes Promise-Objekt).
export function createQueryBuilderMock(result = { data: null, error: null }) {
  let pendingResult = result;

  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    or: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(pendingResult).then(resolve, reject),
    __setResult(next) {
      pendingResult = next;
      return builder;
    },
  };

  return builder;
}

// Fabrik für einen kompletten `supabase`-Client-Mock. `authUser` steuert, was
// `supabase.auth.getUser(token)` zurückgibt (requireAuth/optionalAuth-Middleware);
// `fromResult` ist der Default für jede `.from(table)`-Kette, überschreibbar
// pro Tabelle über `fromResults`.
//
// `adminUsers` speist die Service-Role-API (`supabase.auth.admin.*`). Die
// Antwortform ist bewusst exakt die echte: `listUsers()` liefert
// `{ data: { users: [...] } }` und ist seitenweise — beides hatte der
// Produktivcode falsch angenommen.
export function createSupabaseMock({
  authUser = null,
  authError = null,
  fromResults = {},
  adminUsers = [],
  adminPerPage = 200,
} = {}) {
  const builders = {};
  const users = [...adminUsers];

  const from = vi.fn((table) => {
    if (!builders[table]) {
      builders[table] = createQueryBuilderMock(fromResults[table] || { data: [], error: null });
    }
    return builders[table];
  });

  const listUsers = vi.fn(async ({ page = 1, perPage = adminPerPage } = {}) => {
    const start = (page - 1) * perPage;
    return {
      data: { users: users.slice(start, start + perPage), total: users.length },
      error: null,
    };
  });

  const getUserById = vi.fn(async (id) => {
    const user = users.find((u) => u.id === id);
    return user
      ? { data: { user }, error: null }
      : { data: { user: null }, error: null };
  });

  const updateUserById = vi.fn(async (id, attrs) => {
    const user = users.find((u) => u.id === id);
    if (!user) return { data: { user: null }, error: { message: 'not found' } };
    if (attrs?.user_metadata) user.user_metadata = attrs.user_metadata;
    if (attrs?.app_metadata) user.app_metadata = attrs.app_metadata;
    return { data: { user }, error: null };
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authUser },
        error: authError,
      })),
      admin: { listUsers, getUserById, updateUserById },
    },
    from,
    __builders: builders,
    __adminUsers: users,
  };
}
