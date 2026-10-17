// ============================================================
// File:        playwright.config.js
// Path:        playwright.config.js
// Project:     Seasonal Entertainment
// Description: Playwright browser tests. Most run against the production shape: the built
//              client served by the real server, one process, on test port 3810, with its OWN
//              temporary database (never the dev one). A Vite dev server on 5390 proxies to
//              that server, so devProxy.spec.js tests the development path too. scripts/e2e.mjs
//              creates and deletes the database directory; a direct "npx playwright test" gets
//              one of its own in the system temp folder.
// ============================================================

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { DEV_PROXY_PORT, DEV_PROXY_URL, SERVER_PORT as port } from './client/e2e/ports.js';

// Without a build the server answers the API only, and every page check would fail obscurely.
if (!existsSync('client/dist/index.html')) {
  throw new Error('client/dist is missing: run "npm run build" before the browser tests.');
}

// This file is loaded by the runner and again by every worker; the env var makes them all
// agree on one directory per run.
process.env.SE_E2E_DIR ??= mkdtempSync(path.join(tmpdir(), 'se-e2e-'));

export default defineConfig({
  testDir: 'client/e2e',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // Creates the run's admin (with 2FA) once, after the server is up.
  globalSetup: './client/e2e/globalSetup.js',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node server/src/index.js',
      url: `http://127.0.0.1:${port}/api/health`,
      // Set explicitly so a local .env (dev database, bootstrap token) can never leak in.
      env: {
        HOST: '127.0.0.1',
        PORT: String(port),
        DATABASE_PATH: path.join(process.env.SE_E2E_DIR, 'e2e.db'),
        SESSION_SECRET: 'e2e-session-secret',
        // A token only test runs know: the admin spec creates its admin through the real
        // bootstrap route. Not a secret: it only ever unlocks this throw-away database.
        BOOTSTRAP_TOKEN: 'e2e-bootstrap-token',
        BCRYPT_COST: '4',
        COOKIE_SECURE: 'false',
        PUBLIC_ORIGIN: '',
      },
      // Always a fresh server, so a stale process can never answer for this build.
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // The development setup: Vite serving the client source and proxying /api and /ws.
      command: 'npm run dev --workspace client',
      url: DEV_PROXY_URL,
      env: { CLIENT_PORT: String(DEV_PROXY_PORT), API_ORIGIN: `http://127.0.0.1:${port}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
