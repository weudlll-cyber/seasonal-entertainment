// ============================================================
// File:        testApp.js
// Path:        server/test/helpers/testApp.js
// Project:     Seasonal Entertainment
// Description: Test helper: an app on its own temporary database (deleted by close()), with
//              fast bcrypt, no background timers and rate limits high enough not to interfere
//              unless a test lowers them. client() returns a cookie-keeping agent that sends
//              the site's Origin, as a browser would.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { readConfig } from '../../src/config.js';
import { openDatabase } from '../../src/db/database.js';

export const ORIGIN = 'http://se.test';
const ROOMY = { windowMs: 60_000, max: 1000 };

export function makeTestApp(overrides = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'se-test-'));
  const base = readConfig({ SESSION_SECRET: 'test-secret', BCRYPT_COST: '4' });
  const config = {
    ...base,
    databasePath: path.join(dir, 'test.db'),
    clientDist: path.join(dir, 'no-client'),
    publicOrigin: ORIGIN,
    backgroundJobs: false,
    ...overrides,
    rateLimits: {
      login: ROOMY,
      register: ROOMY,
      passwordChange: ROOMY,
      bootstrap: ROOMY,
      ...overrides.rateLimits,
    },
  };
  const db = openDatabase(config.databasePath);
  const app = createApp({ buildInfo: { version: '9.9.9', commit: 'abc123def456' }, config, db });
  return {
    app,
    db,
    config,
    client: () => request.agent(app).set('Origin', ORIGIN),
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Registers an account through the real route; returns the logged-in agent and the user.
export async function registerUser(t, name = 'anna', password = 'correct-horse-1') {
  const agent = t.client();
  const res = await agent.post('/api/auth/register').send({
    username: name,
    email: `${name}@example.org`,
    password,
    ageConfirmed: true,
  });
  if (res.status !== 201) throw new Error(`register ${name} failed: ${res.status} ${res.text}`);
  return { agent, user: res.body.user, password };
}
