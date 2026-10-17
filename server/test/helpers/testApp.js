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
    // Every limiter roomy (derived from the real list, so new ones are covered too).
    rateLimits: {
      ...Object.fromEntries(Object.keys(base.rateLimits).map((name) => [name, ROOMY])),
      ...overrides.rateLimits,
    },
    chat: { ...base.chat, rate: { member: ROOMY, guest: ROOMY }, ...overrides.chat },
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

// Gives an existing account a role directly in the database.
export function setRole(t, userId, role) {
  t.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
}

// A staff account that passes the 2FA gate: registered, given the role, 2FA marked enabled.
export async function makeStaff(t, name, role) {
  const account = await registerUser(t, name);
  setRole(t, account.user.id, role);
  t.db
    .prepare(
      "INSERT INTO two_factor (user_id, secret, enabled_at) VALUES (?, 'JBSWY3DPEHPK3PXP', 'now')"
    )
    .run(account.user.id);
  return account;
}
