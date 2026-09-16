// Mock-Backend fuer die E2E-Tests.
//
// Faengt alle Aufrufe an das eigene Backend (/api/**) ab, damit die Tests ohne
// laufenden Express-Server auskommen (im Checkout fehlen die Secrets). Externe
// Hosts (unpkg-CDN) werden ebenfalls gestubbt, damit die Tests nicht von
// Internetzugriff im Sandbox-Netzwerk abhaengen.
//
// `installApiMocks(page, { authenticated, data, handlers })`:
//   authenticated — legt bb_token/bb_refresh vor dem Laden der Seite an
//   data          — ueberschreibt Fixture-Datensaetze (catches, spots, plan …)
//   handlers      — pro Pfad ein eigener Handler, gewinnt vor den Defaults;
//                   Wert ist entweder ein Playwright-Route-Callback oder
//                   { status, body } fuer eine feste Antwort

export const FIXTURE_TOKEN = 'e2e-fixture-token';
export const FIXTURE_REFRESH = 'e2e-fixture-refresh';

export const FIXTURE_USER = {
  id: 'e2e-user-id',
  email: 'e2e-tester@baitbuddy.test',
  full_name: 'E2E Tester',
  oauth_linked: true,
  user_metadata: { role: 'user' },
  settings: {
    navigation: {
      bottomNavigation: ['Dashboard', 'Logbook', 'Weather', 'Community'],
    },
  },
};

export const FIXTURE_PLAN = {
  plan: 'free',
  status: 'active',
  credits: 0,
  expires_at: null,
};

// Zwei Faenge mit festen Werten — die Tests pruefen sichtbare Zahlen/Texte,
// deshalb duerfen sie sich nicht zufaellig aendern.
export const FIXTURE_CATCHES = [
  {
    id: 'catch-1',
    species: 'Hecht',
    species_name: 'Hecht',
    weight_kg: 4.2,
    length_cm: 82,
    location_name: 'Rheinaue Nord',
    catch_date: '2026-05-14T06:30:00.000Z',
    created_date: '2026-05-14T06:30:00.000Z',
    notes: 'Auf Gummifisch am Jigkopf',
    bait_used: 'Gummifisch',
    created_by: FIXTURE_USER.email,
  },
  {
    id: 'catch-2',
    species: 'Zander',
    species_name: 'Zander',
    weight_kg: 2.7,
    length_cm: 61,
    location_name: 'Hafenbecken Sued',
    catch_date: '2026-05-02T19:05:00.000Z',
    created_date: '2026-05-02T19:05:00.000Z',
    notes: 'Faulenzermethode in der Daemmerung',
    bait_used: 'Gummifisch',
    created_by: FIXTURE_USER.email,
  },
];

export const FIXTURE_SPOTS = [
  {
    id: 'spot-1',
    name: 'Rheinaue Nord',
    latitude: 50.9375,
    longitude: 6.9603,
    water_type: 'Fluss',
    description: 'Kante am Prallhang',
    created_by: FIXTURE_USER.email,
  },
];

function fulfillJson(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installApiMocks(page, options = {}) {
  const { authenticated = false, data = {}, handlers = {} } = options;

  const state = {
    user: data.user ?? FIXTURE_USER,
    plan: data.plan ?? FIXTURE_PLAN,
    catches: data.catches ?? FIXTURE_CATCHES,
    spots: data.spots ?? FIXTURE_SPOTS,
    // Beide Zahlwege konfiguriert: sonst sperrt PremiumPlans den Kauf-Button
    // (dokumentierte Regel "vor dem Kauf pruefen, ob der Server verifizieren
    // kann"). Einzelne Tests stellen das ueber `data.paymentMethods` um.
    paymentMethods: data.paymentMethods ?? { google_play: true, stripe: true },
  };

  if (authenticated) {
    await page.addInitScript(
      ([token, refresh]) => {
        window.localStorage.setItem('bb_token', token);
        window.localStorage.setItem('bb_refresh', refresh);
      },
      [FIXTURE_TOKEN, FIXTURE_REFRESH]
    );
  }

  await page.route('**/unpkg.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );

  // Nur echte Backend-Aufrufe (Pfad beginnt mit /api/) abfangen. Das fruehere
  // Glob '**/api/**' matchte auch Vite-Modul-URLs wie /src/api/frontendClient.js
  // und beantwortete sie mit JSON — die App lud dann gar nicht (weisse Seite),
  // was die Crawl-Assertions nicht bemerkten.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      // Test-spezifische Handler haben Vorrang.
      const override = handlers[path] ?? handlers[`${method} ${path}`];
      if (override) {
        if (typeof override === 'function') return override(route, request);
        return fulfillJson(route, override.body ?? {}, override.status ?? 200);
      }

      if (path === '/api/auth/me') {
        // Check if token is present (either from initial auth or from login)
        const token = await page.evaluate(() => window.localStorage.getItem('bb_token'));
        return token
          ? fulfillJson(route, state.user)
          : fulfillJson(route, { error: 'Kein Token' }, 401);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        const { email, password } = request.postDataJSON() ?? {};
        if (!email || !password) {
          return fulfillJson(route, { error: 'E-Mail und Passwort sind erforderlich' }, 400);
        }
        return fulfillJson(route, {
          token: FIXTURE_TOKEN,
          refresh_token: FIXTURE_REFRESH,
          user: { ...state.user, email, oauth_linked: true },
        });
      }
      if (path === '/api/auth/register' && method === 'POST') {
        const { email, password, full_name } = request.postDataJSON() ?? {};
        if (!email || !password) {
          return fulfillJson(route, { error: 'E-Mail und Passwort sind erforderlich' }, 400);
        }
        return fulfillJson(route, {
          token: FIXTURE_TOKEN,
          refresh_token: FIXTURE_REFRESH,
          user: { ...state.user, email, full_name: full_name ?? '', oauth_linked: true },
        });
      }
      if (path === '/api/auth/refresh') {
        return fulfillJson(route, { error: 'Ungueltiger Refresh-Token' }, 401);
      }
      if (path === '/api/premium/status') {
        return fulfillJson(route, state.plan);
      }
      if (path === '/api/premium/config') {
        return fulfillJson(route, { ok: true, payment_methods: state.paymentMethods });
      }
      if (path === '/api/health') {
        return fulfillJson(route, { ok: true, app: 'BaitBuddy', version: 'e2e' });
      }
      if (path === '/api/referrals/me') {
        // E2E-Tests: keine Referral-Daten, damit das Popup nicht erscheint.
        return fulfillJson(route, { ok: false }, 200);
      }
      if (path === '/api/referrals/redeem' && method === 'POST') {
        return fulfillJson(route, { ok: true });
      }
      if (path === '/api/catches') {
        if (method === 'GET') return fulfillJson(route, state.catches);
        return fulfillJson(route, { ...(request.postDataJSON() ?? {}), id: 'catch-neu' });
      }
      if (path === '/api/spots') {
        if (method === 'GET') return fulfillJson(route, state.spots);
        return fulfillJson(route, { ...(request.postDataJSON() ?? {}), id: 'spot-neu' });
      }
      if (method === 'GET') {
        return fulfillJson(route, []);
      }
      return fulfillJson(route, { ok: true });
    }
  );
}

// Wartet, bis das Splash-Intro abgeraeumt ist. Solange es liegt, faengt es
// jeden Klick ab — ohne dieses Warten schlagen Interaktionstests sporadisch fehl.
export async function dismissSplash(page) {
  await page
    .locator('.bb-splash')
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => {});
}
