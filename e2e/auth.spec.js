import { test, expect } from '@playwright/test';
import { installApiMocks, dismissSplash, FIXTURE_TOKEN } from './fixtures/apiMock.js';

// E2E fuer den Anmelde-Pfad auf der Landing Page. Die Unit-Tests
// (LandingAuthPanel.test.jsx) pruefen die Handler isoliert; hier laeuft der
// echte Weg durch: Formular ausfuellen, Backend-Antwort verarbeiten, Token in
// localStorage schreiben, ins Dashboard navigieren.

async function openLanding(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await dismissSplash(page);
  await expect(page.getByPlaceholder('E-Mail Adresse')).toBeVisible({ timeout: 15_000 });
}

test.describe('Anmeldung', () => {
  test('meldet mit E-Mail und Passwort an, speichert das Token und landet im Dashboard', async ({ page }) => {
    await installApiMocks(page, { authenticated: false });
    await openLanding(page);

    await page.getByPlaceholder('E-Mail Adresse').fill('angler@baitbuddy.test');
    await page.getByPlaceholder('Passwort').fill('geheim123');

    const loginRequest = page.waitForRequest(
      (req) => req.url().includes('/api/auth/login') && req.method() === 'POST'
    );
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

    // Das Passwort darf nur im Body stehen, nie in der URL (Logs/Referrer).
    const request = await loginRequest;
    expect(request.url()).not.toContain('geheim123');
    expect(request.postDataJSON()).toMatchObject({
      email: 'angler@baitbuddy.test',
      password: 'geheim123',
    });

    // OAuth-Migrations-Modal könnte angezeigt werden - klick "Später"
    const laterButton = page.getByRole('button', { name: 'Später' });
    if (await laterButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await laterButton.click();
    }

    await page.waitForURL(/Dashboard/i, { timeout: 20_000 });
    const token = await page.evaluate(() => window.localStorage.getItem('bb_token'));
    expect(token).toBe(FIXTURE_TOKEN);
  });

  test('zeigt die Server-Fehlermeldung bei falschen Zugangsdaten und navigiert nicht', async ({ page }) => {
    await installApiMocks(page, {
      authenticated: false,
      handlers: {
        'POST /api/auth/login': { status: 401, body: { error: 'Invalid login credentials' } },
      },
    });
    await openLanding(page);

    await page.getByPlaceholder('E-Mail Adresse').fill('angler@baitbuddy.test');
    await page.getByPlaceholder('Passwort').fill('falsch');
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid login credentials', { timeout: 15_000 });
    expect(page.url()).not.toMatch(/Dashboard/i);
    const token = await page.evaluate(() => window.localStorage.getItem('bb_token'));
    expect(token).toBeNull();
  });

  test('erzwingt E-Mail und Passwort ueber die Formularvalidierung', async ({ page }) => {
    await installApiMocks(page, { authenticated: false });
    await openLanding(page);

    let loginCalled = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/login')) loginCalled = true;
    });

    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await page.waitForTimeout(500);

    expect(loginCalled, 'Leeres Formular darf keinen Login-Request ausloesen').toBe(false);
    // Das E-Mail-Feld ist required -> Browser-Validierung schlaegt an.
    const valid = await page
      .getByPlaceholder('E-Mail Adresse')
      .evaluate((el) => el.checkValidity());
    expect(valid).toBe(false);
  });
});

test.describe('Registrierung', () => {
  test('wechselt in den Registrierungsmodus und legt ein Konto an', async ({ page }) => {
    await installApiMocks(page, { authenticated: false });
    await openLanding(page);

    // Im Anmeldemodus gibt es kein Namensfeld.
    await expect(page.getByPlaceholder('Vollständiger Name')).toHaveCount(0);

    await page.getByRole('button', { name: 'Registrieren', exact: true }).click();
    await expect(page.getByPlaceholder('Vollständiger Name')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Konto erstellen' })).toBeVisible();

    await page.getByPlaceholder('Vollständiger Name').fill('Neuer Angler');
    await page.getByPlaceholder('E-Mail Adresse').fill('neu@baitbuddy.test');
    await page.getByPlaceholder('Passwort').fill('geheim123');

    const registerRequest = page.waitForRequest(
      (req) => req.url().includes('/api/auth/register') && req.method() === 'POST'
    );
    await page.getByRole('button', { name: 'Registrieren', exact: true }).click();

    expect((await registerRequest).postDataJSON()).toMatchObject({
      email: 'neu@baitbuddy.test',
      full_name: 'Neuer Angler',
    });

    // OAuth-Migrations-Modal könnte angezeigt werden - klick "Später"
    const laterButton = page.getByRole('button', { name: 'Später' });
    if (await laterButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await laterButton.click();
    }

    await page.waitForURL(/Dashboard/i, { timeout: 20_000 });
  });

  test('meldet eine bereits registrierte E-Mail zurueck', async ({ page }) => {
    await installApiMocks(page, {
      authenticated: false,
      handlers: {
        'POST /api/auth/register': {
          status: 409,
          body: { error: 'Diese E-Mail ist bereits registriert' },
        },
      },
    });
    await openLanding(page);

    await page.getByRole('button', { name: 'Registrieren', exact: true }).click();
    await page.getByPlaceholder('Vollständiger Name').fill('Doppelt');
    await page.getByPlaceholder('E-Mail Adresse').fill('schon-da@baitbuddy.test');
    await page.getByPlaceholder('Passwort').fill('geheim123');
    await page.getByRole('button', { name: 'Registrieren', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('bereits registriert', { timeout: 15_000 });
  });
});

test.describe('Passwort und Gastzugang', () => {
  test('verlangt vor dem Zuruecksetzen eine E-Mail-Adresse', async ({ page }) => {
    await installApiMocks(page, { authenticated: false });
    await openLanding(page);

    await page.getByRole('button', { name: 'Passwort vergessen?' }).click();
    await expect(page.getByRole('alert')).toContainText('E-Mail-Adresse', { timeout: 10_000 });
  });

  test('schaltet die Passwort-Sichtbarkeit um', async ({ page }) => {
    await installApiMocks(page, { authenticated: false });
    await openLanding(page);

    const field = page.getByPlaceholder('Passwort');
    await field.fill('geheim123');
    await expect(field).toHaveAttribute('type', 'password');

    await page.getByLabel('Passwort anzeigen').click();
    await expect(field).toHaveAttribute('type', 'text');
    // Der eingegebene Wert darf beim Umschalten nicht verloren gehen.
    await expect(field).toHaveValue('geheim123');

    await page.getByLabel('Passwort verbergen').click();
    await expect(field).toHaveAttribute('type', 'password');
  });

  test('startet eine Gastsitzung ohne Anmeldung', async ({ page }) => {
    await installApiMocks(page, { authenticated: false });
    await openLanding(page);

    await page.getByRole('button', { name: 'Als Gast fortfahren' }).click();
    await page.waitForURL(/Dashboard/i, { timeout: 20_000 });

    // Gastsitzung heisst: kein Auth-Token, aber eine Gast-Markierung. Die
    // liegt bewusst im sessionStorage (guestMode.jsx) — sie soll den Tab-Schluss
    // nicht ueberleben.
    expect(await page.evaluate(() => window.localStorage.getItem('bb_token'))).toBeNull();
    const guestSession = await page.evaluate(() =>
      window.sessionStorage.getItem('catchgbt_guest_session')
    );
    expect(guestSession, 'Gast-Session im sessionStorage').toBeTruthy();
    expect(JSON.parse(guestSession)).toMatchObject({ is_guest: true });
  });
});

test.describe('Angemeldeter Zustand', () => {
  test('zeigt statt des Login-Panels den Weg ins Dashboard', async ({ page }) => {
    await installApiMocks(page, { authenticated: true });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await dismissSplash(page);

    await expect(page.getByRole('button', { name: 'Zum Dashboard' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('E-Mail Adresse')).toHaveCount(0);
  });
});
