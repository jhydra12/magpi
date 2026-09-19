import { defineConfig } from '@playwright/test';

const external = process.env.PLAYWRIGHT_BASE_URL;

/** Exercise the actual Next production route, locally or after deployment. */
export default defineConfig({
  testDir: './tests',
  testMatch: 'production-graph.spec.ts',
  globalSetup: './tests/global-setup.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    baseURL: external ?? 'http://127.0.0.1:3107',
    screenshot: 'only-on-failure',
  },
  webServer: external
    ? undefined
    : {
        command: 'pnpm --dir web build && pnpm --dir web start --port 3107',
        url: 'http://127.0.0.1:3107',
        reuseExistingServer: false,
        timeout: 120_000,
        env: { ...process.env },
      },
});
