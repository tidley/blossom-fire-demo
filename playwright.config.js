// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.DEMO_BASEURL || 'http://127.0.0.1:5173',
    headless: true,
  },
  webServer: process.env.PW_NO_WEBSERVER
    ? undefined
    : {
        command: 'docker compose up -d',
        url: (process.env.DEMO_BASEURL || 'http://127.0.0.1:5173'),
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
