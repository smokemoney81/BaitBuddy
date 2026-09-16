import { test, expect } from '@playwright/test';
import { installApiMocks } from './fixtures/apiMock.js';

// Regressionstest fuer den KI-Buddy: Ein Klick auf den schwebenden KI-Buddy-Avatar
// muss den Chat sichtbar oeffnen. Der Bug dahinter: `contain: layout style paint`
// auf [role="region"] (globals.css) clippte die absolut positionierte Chat-Blase
// auf die 56x56px-Box des Widget-Wrappers — der Chat war im DOM "visible", wurde
// aber weder gezeichnet noch war er klickbar. jsdom-Unit-Tests koennen das nicht
// erkennen (kein Paint/Hit-Testing), deshalb hier als Browser-Test.

test.describe('KI-Buddy Widget', () => {
  test('Klick auf den Avatar oeffnet den Chat sichtbar ueber dem Seiteninhalt', async ({ page }) => {
    await installApiMocks(page, { authenticated: true });
    await page.goto('/Dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Splash-Intro abwarten — solange es liegt, faengt es jeden Klick ab.
    await page
      .locator('.bb-splash')
      .waitFor({ state: 'detached', timeout: 15_000 })
      .catch(() => {});

    // Avatar des Widget-Stubs (schwebt unten rechts). Klick per Koordinaten:
    // Die Endlos-Schwebe-Animation (framer-motion) laesst Playwrights
    // Stabilitaets-Check bei element.click() sonst haengen.
    // BuddyAvatar.jsx rendert ein <img>-Tag mit alt="{name}, dein KI-Buddy".
    // Prefix-Match auf alt-Text, damit bei Buddy-Umbenennung der Selector nicht bricht.
    const avatar = page.locator('.fixed.z-50 img[alt$="dein KI-Buddy"]').last();
    await avatar.waitFor({ state: 'visible', timeout: 15_000 });
    const box = await avatar.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // Erster Klick laedt den Widget-Chunk nach und oeffnet den Chat direkt.
    const input = page.getByPlaceholder('Schreib eine Frage...');
    await expect(input).toBeVisible({ timeout: 15_000 });

    // Hit-Test: Die Chat-Blase muss wirklich OBEN liegen (nicht nur im DOM
    // existieren). elementFromPoint am Schliessen-Button muss ins Widget
    // aufloesen — bei geclippter/verdeckter Blase traefe es den Seiteninhalt.
    const hitInsideWidget = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Chat schließen"]');
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!el && !!el.closest('[aria-label="KI-Buddy Chat Widget"]');
    });
    expect(hitInsideWidget, 'Chat-Blase liegt sichtbar ueber dem Seiteninhalt').toBe(true);

    // Schliessen ueber X muss klickbar sein (war zuvor vom Content verdeckt).
    await page.getByLabel('Chat schließen').click();
    await expect(input).toBeHidden();

    // Erneuter Klick auf den Avatar oeffnet den Chat wieder.
    const box2 = await avatar.boundingBox();
    await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await expect(input).toBeVisible({ timeout: 10_000 });
  });
});
