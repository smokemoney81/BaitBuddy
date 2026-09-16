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
  user_metadata: { role: 'user' },
  settings: {
    navigation: {
      bottomNavigation: ['Dashboard', 'Logbook', 'Weather', 'Community'],
    },
    // Der Fixture-Nutzer ist ein eingerichtetes Konto, kein Neuzugang. Ohne
    // diesen Abschnitt oeffnet OnboardingFlow beim Dashboard-Aufruf seinen
    // Dialog; Radix nimmt den uebrigen Seiteninhalt dann per aria-hidden aus
    // dem Accessibility-Baum und die Tab-Leiste ist ueber ihre Rolle nicht
    // mehr auffindbar. Dass ein NEUER Nutzer das Onboarding bekommt, deckt
    // onboarding.spec.js ab.
    onboarding: {
      completed: true,
      skipped: false,
      stepIndex: 15,
      completedAt: '2026-01-01T00:00:00.000Z',
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
        return authenticated
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
          user: { ...state.user, email },
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
          user: { ...state.user, email, full_name: full_name ?? '' },
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
      // Aggregierte Dashboard-Daten (BFF). Ohne eigenen Eintrag fiele der
      // Aufruf auf die GET-Default-Antwort `[]` zurueck — das entspricht nicht
      // dem Vertrag aus useDashboardData.ts und laesst das Dashboard in einem
      // undefinierten Zustand rendern.
      if (path === '/api/dashboard') {
        if (method === 'GET') {
          return fulfillJson(route, {
            data: {
              next_trip: null,
              recent_catches: [],
              top_spots: [],
              weather: null,
              buddy_suggestion: null,
              statistics: {
                total_catches: state.catches.length,
                total_weight: 6.9,
                personal_best: 4.2,
                species_count: 2,
                weeks_active: 2,
              },
              timestamp: '2026-05-14T06:30:00.000Z',
            },
            metadata: { plan: state.plan.plan, cached_at: '2026-05-14T06:30:00.000Z', ttl_seconds: 300 },
          });
        }
        return route.fulfill({ status: 204, body: '' });
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
