import { test, expect } from '@playwright/test';
import { installApiMocks } from './fixtures/apiMock.js';

// Der KI-Buddy hat kein schwebendes Chat-Widget mehr (BaitBuddy-2.0-Layout).
// Einstieg ist "Hey Buddy" im Command Center, das der Avatar in der Kopfzeile
// öffnet. Abgesichert wird, dass das Command Center wirklich OBEN liegt
// (Hit-Test statt nur DOM-Sichtbarkeit — ein früherer Bug liess ein Overlay
// im DOM "visible", aber verdeckt und unklickbar) und dass der Einstieg auf
// der KI-Buddy-Seite landet.

test.use({ viewport: { width: 390, height: 844 } });

test.describe('KI-Buddy Einstieg', () => {
  test('Hey Buddy im Command Center öffnet den KI-Buddy', async ({ page }) => {
    await installApiMocks(page, { authenticated: true });
    await page.goto('/Dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Splash-Intro abwarten — solange es liegt, faengt es jeden Klick ab.
    await page
      .locator('[data-testid="splash-intro"]')
      .waitFor({ state: 'detached', timeout: 15_000 })
      .catch(() => {});

    await page.getByRole('button', { name: 'Command Center öffnen' }).click();

    const heyBuddy = page.getByRole('link', { name: /Hey Buddy/ });
    await expect(heyBuddy).toBeVisible({ timeout: 15_000 });

    // Einblend-Animation abwarten, sonst misst der Hit-Test mitten im Slide-in.
    await page.locator('.bb-cc').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));

    const hitInsideCommandCenter = await heyBuddy.evaluate(link => {
      const r = link.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!el && link.contains(el);
    });
    expect(hitInsideCommandCenter, 'Command Center liegt sichtbar ueber dem Seiteninhalt').toBe(true);

    await heyBuddy.click();
    await page.waitForURL(/KiBuddyBeta/i, { timeout: 20_000 });
    await expect(page.getByRole('link', { name: /Hey Buddy/ })).toHaveCount(0);
  });

  test('Schliessen-Taste schliesst das Command Center', async ({ page }) => {
    await installApiMocks(page, { authenticated: true });
    await page.goto('/Dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page
      .locator('[data-testid="splash-intro"]')
      .waitFor({ state: 'detached', timeout: 15_000 })
      .catch(() => {});

    await page.getByRole('button', { name: 'Command Center öffnen' }).click();
    const close = page.getByRole('button', { name: 'Command Center schließen' });
    await expect(close).toBeVisible({ timeout: 15_000 });
    await close.click();
    await expect(page.getByRole('link', { name: /Hey Buddy/ })).toHaveCount(0);
  });
});
