// ============================================================
// File:        playwright.config.js
// Path:        playwright.config.js
// Project:     Seasonal Entertainment
// Description: Playwright browser tests. They run against the production shape: the built
//              client served by the real server, one process, on test port 3810.
// ============================================================

import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const port = 3810;

// Without a build the server answers the API only, and every page check would fail obscurely.
if (!existsSync('client/dist/index.html')) {
  throw new Error('client/dist is missing: run "npm run build" before the browser tests.');
}

export default defineConfig({
  testDir: 'client/e2e',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server/src/index.js',
    url: `http://127.0.0.1:${port}/api/health`,
    env: { HOST: '127.0.0.1', PORT: String(port) },
    // Always a fresh server, so a stale process can never answer for this build.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
