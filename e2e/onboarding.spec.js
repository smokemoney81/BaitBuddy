import { test, expect } from '@playwright/test';
import { installApiMocks, dismissSplash, FIXTURE_USER } from './fixtures/apiMock.js';

// Das Onboarding entscheidet sich an `settings.onboarding` im Nutzerprofil.
// Der Standard-Fixture-Nutzer hat es abgeschlossen (siehe apiMock.js); hier
// geht es um den Neuzugang, der es bekommen MUSS, und darum, dass es nach dem
// Abschluss nicht erneut auftaucht.

test.use({ viewport: { width: 390, height: 844 } });

// Ein Konto ohne `settings.onboarding` — so sieht ein frisch registrierter
// Nutzer aus.
const NEW_USER = {
  ...FIXTURE_USER,
  settings: { navigation: FIXTURE_USER.settings.navigation },
};

async function openDashboard(page) {
  await page.goto('/Dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await dismissSplash(page);
}

test.describe('Onboarding', () => {
  test('ein neuer Nutzer bekommt das gefuehrte Onboarding', async ({ page }) => {
    await installApiMocks(page, { authenticated: true, data: { user: NEW_USER } });
    await openDashboard(page);

    const dialog = page.getByRole('dialog').filter({ hasText: 'Schritt 1 von' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('progressbar', { name: 'Onboarding-Fortschritt' })).toBeVisible();
    // Auf dem ersten Schritt gibt es kein Zurueck.
    await expect(dialog.getByRole('button', { name: 'Zurück' })).toBeDisabled();
  });

  test('speichert den Fortschritt beim Weitergehen im Profil', async ({ page }) => {
    const saved = [];
    await installApiMocks(page, {
      authenticated: true,
      data: { user: NEW_USER },
      handlers: {
        'PATCH /api/auth/me': async (route, request) => {
          const body = JSON.parse(request.postData() || '{}');
          saved.push(body);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(NEW_USER),
          });
        },
      },
    });
    await openDashboard(page);

    const dialog = page.getByRole('dialog').filter({ hasText: 'Schritt 1 von' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Weiter' }).click();

    await expect.poll(() => saved.some((b) => b?.settings?.onboarding), { timeout: 15_000 }).toBe(true);
    const onboarding = saved.find((b) => b?.settings?.onboarding).settings.onboarding;
    expect(onboarding.stepIndex).toBe(1);
    expect(onboarding.completed).toBe(false);
  });

  test('ein eingerichtetes Konto sieht es nicht und behaelt seine Tab-Leiste', async ({ page }) => {
    await installApiMocks(page, { authenticated: true });
    await openDashboard(page);

    const nav = page.getByRole('tablist').filter({ has: page.getByLabel('Dashboard', { exact: true }) });
    await expect(nav).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('dialog').filter({ hasText: 'Schritt 1 von' })).toHaveCount(0);
  });
});
