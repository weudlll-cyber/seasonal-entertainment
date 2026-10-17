// ============================================================
// File:        sessionSweep.test.js
// Path:        server/test/sessionSweep.test.js
// Project:     Seasonal Entertainment
// Description: Guards the sweep of expired sessions (http/session.js): with background jobs it
//              deletes them every 15 minutes; without (tests, one-off scripts) no timer runs.
// ============================================================

import { afterEach, expect, it, vi } from 'vitest';
import { sessionMiddleware } from '../src/http/session.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => {
  vi.useRealTimers();
  t?.close();
});

const expiredSessions = () =>
  t.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE datetime('now') > datetime(expire)").get()
    .n;

function addExpiredSession() {
  t.db
    .prepare(
      "INSERT INTO sessions (sid, sess, expire) VALUES ('old', '{}', '2000-01-01T00:00:00.000Z')"
    )
    .run();
}

it.each([
  [true, 0],
  [false, 1],
])('background jobs %s: %i expired session left after 15 minutes', (backgroundJobs, left) => {
  t = makeTestApp();
  vi.useFakeTimers();
  sessionMiddleware(t.db, { ...t.config, backgroundJobs });
  addExpiredSession();
  vi.advanceTimersByTime(15 * 60_000);
  expect(expiredSessions()).toBe(left);
});
