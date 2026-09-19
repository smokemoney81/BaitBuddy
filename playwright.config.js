import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import fs from 'fs';

// Feste sandbox-lokale Chromium-Installation (siehe Entwicklungsumgebung).
// In CI (GitHub Actions) installiert `npx playwright install chromium` den
// Browser an Playwrights eigenem Standardort — dort existiert dieser Pfad
// nicht, daher nur setzen, wenn er tatsaechlich vorhanden ist.
const SANDBOX_CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const executablePath = fs.existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined;

// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY werden von supabaseClient.js beim
// Modul-Import zwingend gebraucht (throws sonst). `npm run dev` laedt per
// Vite-Konvention nur .env(.local)/.env.development(.local), nicht
// .env.production — deshalb hier explizit nachladen und an den Dev-Server
// durchreichen. Beide Werte sind oeffentliche, im Client verwendete Werte,
// kein Secret.
loadEnv({ path: '.env.production' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
    },
  },
});
