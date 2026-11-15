import { defineConfig, devices } from '@playwright/test';

const CI = process.env['CI'] !== undefined;
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:8080';

/** Runs against the compose stack (docker compose up -d --build), never against the demo seed */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'en-US',
    timezoneId: 'Europe/Kyiv',
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: 'errandly-locale', value: 'en' }] }],
    },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
