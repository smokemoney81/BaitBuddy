import { test, expect } from '@playwright/test';
import { installApiMocks, dismissSplash } from './fixtures/apiMock.js';

// E2E fuer die Hauptnavigation und das Verhalten ohne Netz. Der Route-Crawl
// (smoke.spec.js) ruft jede Route direkt auf; hier geht es um das Navigieren
// INNERHALB der laufenden SPA — also darum, dass der Router die Seiten-Chunks
// nachlaedt, ohne den Zustand zu verlieren oder abzustuerzen.

// Beschriftungen aus BottomTabs.jsx (aria-label = tab.name).
// Muss mit den Navigation-Items in der Test-Fixture (apiMock.js) übereinstimmen.
const TABS = [
  { name: 'Dashboard', url: /Dashboard/i },
  { name: 'Logbook', url: /Logbook/i },
  { name: 'Weather', url: /Weather/i },
  { name: 'Community', url: /Community/i },
];

// Die Tab-Leiste ist `md:hidden` — sie existiert nur im Mobil-Layout. Das ist
// auch der Fall, der zaehlt: die App laeuft als Capacitor-WebView auf dem
// Telefon. Deshalb testet diese Datei durchgehend im Mobil-Viewport.
test.use({ viewport: { width: 390, height: 844 } });

// BottomTabs.jsx setzt auf dem <nav> ein explizites role="tablist"; das
// ueberschreibt die implizite navigation-Rolle. Deshalb ueber die tablist-Rolle
// zugreifen, nicht ueber getByRole('navigation').
const mainNav = (page) => page.getByRole('tablist').filter({ has: page.getByLabel('Dashboard', { exact: true }) });

async function openDashboard(page) {
  await page.goto('/Dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await dismissSplash(page);
  await expect(mainNav(page)).toBeVisible({ timeout: 20_000 });
}

test.describe('Hauptnavigation', () => {
  test('wechselt ueber die Tab-Leiste zwischen den Hauptseiten', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await installApiMocks(page, { authenticated: true });
    await openDashboard(page);

    const nav = mainNav(page);
    for (const tab of TABS) {
      await nav.getByLabel(tab.name, { exact: true }).click();
      await page.waitForURL(tab.url, { timeout: 20_000 });
      // Nach jedem Wechsel muss die Navigation weiter stehen — sie ist Teil des
      // Layouts und darf beim Lazy-Load der Seite nicht verschwinden.
      await expect(nav).toBeVisible();
    }

    expect(pageErrors, 'Uncaught exceptions beim Navigieren').toEqual([]);
  });

  test('haelt den Zustand beim Zurueckspringen ueber die Browser-History', async ({ page }) => {
    await installApiMocks(page, { authenticated: true });
    await openDashboard(page);

    const nav = mainNav(page);
    await nav.getByLabel('Logbook', { exact: true }).click();
    await page.waitForURL(/Logbook/i, { timeout: 20_000 });

    await page.goBack();
    await page.waitForURL(/Dashboard/i, { timeout: 20_000 });
    await expect(nav).toBeVisible();

    await page.goForward();
    await page.waitForURL(/Logbook/i, { timeout: 20_000 });
    await expect(nav).toBeVisible();
  });
});

test.describe('Verhalten ohne Netz', () => {
  test('sperrt einen angemeldeten Nutzer offline nicht aus', async ({ page, context }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await installApiMocks(page, { authenticated: true });
    await openDashboard(page);

    // Erst nach dem Laden offline gehen: das entspricht dem realen Fall
    // (App laeuft, Funkloch am Wasser).
    await context.setOffline(true);
    const nav = mainNav(page);
    await nav.getByLabel('Logbook', { exact: true }).click();
    await page.waitForTimeout(2500);

    // Offline-Auth (frontendClient: isNetworkError + gecachter User) muss den
    // Nutzer angemeldet lassen — kein Rauswurf auf die Landing Page.
    expect(page.url()).not.toMatch(/\/$|Home/);
    expect(await page.evaluate(() => window.localStorage.getItem('bb_token'))).not.toBeNull();
    expect(pageErrors, 'Uncaught exceptions im Offline-Modus').toEqual([]);

    await context.setOffline(false);
  });
});
