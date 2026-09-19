import { test, expect } from '@playwright/test';
import { installApiMocks, dismissSplash } from './fixtures/apiMock.js';

// E2E fuer den Kaufpfad. Abgesichert wird die dokumentierte Regel "vor dem Kauf
// pruefen, ob der Server verifizieren kann": ohne konfiguriertes Zahlungs-Secret
// muss die UI den Kauf sperren, sonst zahlt der Nutzer erst und bekommt danach
// einen 501. Ein Ausfall der Config-Abfrage muss ebenfalls sperren
// (fail-closed), damit kein Kauf ohne bestätigte Verfügbarkeit startet.
//
// Die Tests laufen im Browser, also greift der Stripe-Zweig (kein
// window.AndroidBilling).

// Beschriftung des Web-Checkout-Buttons (WebCheckoutButton.jsx). Im Browser
// ist das der einzige Kaufweg; "Im Play Store kaufen" erscheint nur in der App.
const CHECKOUT_BUTTON = 'Karte / Google Pay / Apple Pay';

async function openPremium(page) {
  await page.goto('/PremiumPlans', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await dismissSplash(page);
  // Warten, bis die Zahlungs-Config verarbeitet ist: genau einer der beiden
  // Hinweisbloecke steht dann. .first(), weil jeder Block aus Ueberschrift und
  // Fliesstext besteht und der Text damit zweimal matcht.
  await expect(
    page.getByText('Kauf derzeit nicht moeglich').or(page.getByText('Bezahlung im Browser')).first()
  ).toBeVisible({ timeout: 25_000 });
}

test.describe('Premium-Kaufpfad', () => {
  test('gibt den Kauf frei, wenn Stripe serverseitig konfiguriert ist', async ({ page }) => {
    await installApiMocks(page, {
      authenticated: true,
      data: { paymentMethods: { google_play: false, stripe: true } },
    });
    await openPremium(page);

    await expect(page.getByText('Bezahlung im Browser')).toBeVisible();
    await expect(page.getByText('Kauf derzeit nicht moeglich')).toHaveCount(0);
  });

  test('sperrt den Kauf, wenn der Server Stripe nicht verifizieren kann', async ({ page }) => {
    await installApiMocks(page, {
      authenticated: true,
      data: { paymentMethods: { google_play: true, stripe: false } },
    });
    await openPremium(page);

    await expect(page.getByText('Kauf derzeit nicht moeglich')).toBeVisible();
    await expect(page.getByText('Die Bezahlung im Browser ist gerade nicht verfuegbar')).toBeVisible();

    // Jede sichtbare Kauf-Schaltflaeche muss deaktiviert sein.
    const buyButtons = page.getByRole('button', { name: CHECKOUT_BUTTON });
    const count = await buyButtons.count();
    expect(count, 'Kauf-Buttons vorhanden').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const button = buyButtons.nth(i);
      if (await button.isVisible()) await expect(button).toBeDisabled();
    }
  });

  test('sperrt den Kauf, wenn die Config-Abfrage fehlschlaegt', async ({ page }) => {
    await installApiMocks(page, {
      authenticated: true,
      handlers: { '/api/premium/config': { status: 500, body: { error: 'Config nicht ladbar' } } },
    });
    await openPremium(page);

    await expect(page.getByText('Kauf derzeit nicht moeglich')).toBeVisible();
  });

  test('startet den Stripe-Checkout serverseitig und sendet nur die plan_id', async ({ page }) => {
    let checkoutPayload = null;
    await installApiMocks(page, {
      authenticated: true,
      data: { paymentMethods: { google_play: false, stripe: true } },
      handlers: {
        'POST /api/premium/checkout': (route, request) => {
          checkoutPayload = request.postDataJSON();
          // Keine echte Weiterleitung zu Stripe im Test.
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ url: '' }),
          });
        },
      },
    });
    await openPremium(page);

    const buyButton = page.getByRole('button', { name: CHECKOUT_BUTTON }).first();
    await buyButton.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(buyButton).toBeEnabled();
    await buyButton.click();
    await expect.poll(() => checkoutPayload, { timeout: 15_000 }).not.toBeNull();

    // Preise gehoeren ausschliesslich auf den Server: der Client darf nur die
    // plan_id schicken, keinen Betrag.
    expect(checkoutPayload).toHaveProperty('plan_id');
    expect(JSON.stringify(checkoutPayload)).not.toMatch(/"(amount|price|amount_cents|betrag)"/i);
  });
});

for (const planId of ['basic','pro','elite','friends']) {
  test(`bestätigt ${planId} nach Checkout und erneutem Seitenaufruf`, async ({ page }) => {
    let activated = false;
    let calls = 0;
    await installApiMocks(page, { authenticated: true, data: { paymentMethods: { stripe: true, google_play: false } }, handlers: {
      'POST /api/premium/activate': async (route, request) => {
        expect(request.postDataJSON().plan_id).toBe(planId);
        calls++; activated = true;
        return route.fulfill({ json: { ok: true, updated: calls === 1 } });
      },
      '/api/premium/status': async route => route.fulfill({ json: { ok: true, plan: { id: activated ? planId : 'free', name: activated ? planId : 'Free', is_active: activated } } }),
    }});
    await page.goto(`/PremiumPlans?checkout=success&plan_id=${planId}&session_id=cs_fixture_${planId}`);
    await dismissSplash(page);
    await expect.poll(() => activated).toBe(true);
    await expect(page.getByText(`Aktueller Plan: ${planId}`)).toBeVisible();
    await page.reload(); await dismissSplash(page);
    await expect(page.getByText(`Aktueller Plan: ${planId}`)).toBeVisible();
    expect(calls).toBe(1);
  });
}

test('Free bleibt als Tarif sichtbar', async ({ page }) => {
  await installApiMocks(page, { authenticated: true, data: { paymentMethods: { stripe: true } } });
  await openPremium(page);
  await expect(page.getByText('Kostenlos verfügbar')).toBeVisible();
});
