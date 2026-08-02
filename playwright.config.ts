import { defineConfig, devices } from '@playwright/test';

const sitePort = Number(process.env.PLAYWRIGHT_SITE_PORT || 43173);
const siteUrl = `http://127.0.0.1:${sitePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: siteUrl,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node tests/e2e/serve-site.js',
    url: siteUrl,
    env: {
      PLAYWRIGHT_SITE_PORT: String(sitePort),
    },
    reuseExistingServer: false,
    timeout: 10_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
