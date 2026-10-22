// ============================================================
// File:        playwright.config.js
// Path:        playwright.config.js
// Project:     Seasonal Entertainment
// Description: Playwright browser tests. Most run against the production shape: the built
//              client served by the real server, one process, on test port 3810, with its OWN
//              temporary database (never the dev one). A Vite dev server on 5390 proxies to
//              that server, so devProxy.spec.js tests the development path too. scripts/e2e.mjs
//              creates and deletes the database directory; a direct "npx playwright test" gets
//              one of its own in the system temp folder. Calls use the run's own LiveKit server
//              in development mode (scripts/calls-dev.mjs, pinned and checksum-checked binary);
//              the event bot is the run's own fake database (scripts/build-bot-fixtures.mjs).
// ============================================================

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  CALLS_PORT,
  CALLS_URL,
  DEV_PROXY_PORT,
  DEV_PROXY_URL,
  SERVER_PORT as port,
} from './client/e2e/ports.js';

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
  // Every password form derives keys with Argon2id in the browser (about 64 MiB,
  // docs/AUTH.md); with several browsers busy at once on a heavily loaded machine that can pass
  // the default 5 s wait many times over. A real failure still fails, just later.
  expect: { timeout: 20_000 },
  timeout: 90_000,
  // Creates the run's admin (with 2FA) once, after the server is up.
  globalSetup: './client/e2e/globalSetup.js',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/calls-dev.mjs',
      // LiveKit answers "OK" on its HTTP port once it is up.
      url: `http://127.0.0.1:${CALLS_PORT}`,
      env: { CALLS_DEV_PORT: String(CALLS_PORT) },
      // Development mode logs every packet at debug level: far too much for the test output.
      stdout: 'ignore',
      stderr: 'ignore',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // The bots' fake data first (the run's own folder), then the server reading it.
      command: 'node scripts/build-bot-fixtures.mjs && node server/src/index.js',
      url: `http://127.0.0.1:${port}/api/health`,
      // Set explicitly so a local .env (dev database, bootstrap token) can never leak in.
      env: {
        HOST: '127.0.0.1',
        PORT: String(port),
        DATABASE_PATH: path.join(process.env.SE_E2E_DIR, 'e2e.db'),
        // The starter stickers and GIFs are copied here on start (first-start seed).
        MEDIA_DIR: path.join(process.env.SE_E2E_DIR, 'media'),
        SESSION_SECRET: 'e2e-session-secret',
        // 2FA secrets at rest (docs/AUTH.md): a fixed test key, so no development-key warning.
        SECRET_ENCRYPTION_KEY: 'ZTJlLW9ubHktc2VjcmV0LWVuY3J5cHRpb24ta2V5ISE=',
        // A token only test runs know: the admin spec creates its admin through the real
        // bootstrap route. Not a secret: it only ever unlocks this throw-away database.
        BOOTSTRAP_TOKEN: 'e2e-bootstrap-token',
        // Every test browser comes from 127.0.0.1 and many share the run's admin account, in
        // parallel workers: the chat connection limits (docs/CHAT.md) would count them as one.
        CHAT_MAX_CONNECTIONS_PER_MEMBER: '100',
        CHAT_MAX_GUEST_CONNECTIONS_PER_IP: '1000',
        BCRYPT_COST: '4',
        COOKIE_SECURE: 'false',
        PUBLIC_ORIGIN: '',
        // LiveKit's development pair: accepted outside production only (docs/CALLS.md).
        CALLS_URL,
        CALLS_API_KEY: 'devkey',
        CALLS_API_SECRET: 'secret',
        // The event bot, read-only (docs/BOTS.md): the fixture built just before. The price
        // bot stays off, so the home page keeps its season marks (seasonMarks.spec.js).
        BOT_FIXTURE_DIR: path.join(process.env.SE_E2E_DIR, 'bots'),
        EVENT_BOT_DB: path.join(process.env.SE_E2E_DIR, 'bots', 'stannouncebot.db'),
      },
      // Always a fresh server, so a stale process can never answer for this build.
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // The development setup: Vite serving the client source and proxying /api and /ws.
      command: 'npm run dev --workspace client',
      url: DEV_PROXY_URL,
      env: { CLIENT_PORT: String(DEV_PROXY_PORT), API_ORIGIN: `http://127.0.0.1:${port}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
