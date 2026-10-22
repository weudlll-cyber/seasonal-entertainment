// ============================================================
// File:        sessionIdle.test.js
// Path:        server/test/sessionIdle.test.js
// Project:     Seasonal Entertainment
// Description: Guards the 7-day rule for signed-in sessions (http/session.js, decided
//              2026-10-22): a session unused for more than 7 days is rejected; one used within
//              7 days stays valid past 7 days from login; the renewal writes at most once a
//              minute; signed-in sessions from the old 30-day rule are capped at 7 days.
// ============================================================

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDLE_LIMIT_MS, sessionMiddleware } from '../src/http/session.js';
import { cookieOf } from './helpers/chatSocket.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

const DAY = 24 * 60 * 60 * 1000;
let t;
afterEach(() => {
  vi.useRealTimers();
  t?.close();
});

// The cookie is sent by hand: the agent's jar would drop an expired cookie itself, and the
// test is about the server's rule.
const sessionUser = async (cookie) =>
  (await request(t.app).get('/api/auth/session').set('Cookie', cookie)).body.user;

async function signedIn() {
  vi.useFakeTimers({ toFake: ['Date'] });
  t = makeTestApp();
  const { agent } = await registerUser(t, 'mia');
  return cookieOf(agent);
}

const stored = () => JSON.parse(t.db.prepare('SELECT sess FROM sessions').get().sess);

describe('sessions end after 7 days without use', () => {
  it('a session unused for more than 7 days is rejected', async () => {
    const cookie = await signedIn();
    vi.setSystemTime(Date.now() + 7 * DAY + 60_000);
    expect(await sessionUser(cookie)).toBeNull();
  });

  it('a session used within 7 days stays valid past 7 days from login', async () => {
    const cookie = await signedIn();
    vi.setSystemTime(Date.now() + 6 * DAY);
    expect(await sessionUser(cookie)).toMatchObject({ username: 'mia' });
    vi.setSystemTime(Date.now() + 4 * DAY); // 10 days after login, 4 after the last use
    expect(await sessionUser(cookie)).toMatchObject({ username: 'mia' });
  });

  it('renews at most once a minute', async () => {
    const cookie = await signedIn();
    const first = stored().usedAt;
    vi.setSystemTime(Date.now() + 30_000);
    await sessionUser(cookie);
    expect(stored().usedAt).toBe(first);
    vi.setSystemTime(Date.now() + 31_000);
    await sessionUser(cookie);
    expect(stored().usedAt).toBe(first + 61_000);
    expect(stored().cookie.originalMaxAge).toBe(IDLE_LIMIT_MS);
  });

  it("signed-in sessions from the 30-day rule are capped at 7 days; a guest's is not", () => {
    t = makeTestApp();
    const in30 = new Date(Date.now() + 30 * DAY).toISOString();
    const add = t.db.prepare('INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)');
    add.run('member', JSON.stringify({ userId: 1 }), in30);
    add.run('guest', JSON.stringify({ guestName: 'Guest-a' }), in30);
    sessionMiddleware(t.db, t.config);
    const expire = (sid) =>
      Date.parse(t.db.prepare('SELECT expire FROM sessions WHERE sid = ?').get(sid).expire);
    expect(expire('member')).toBeLessThanOrEqual(Date.now() + IDLE_LIMIT_MS);
    expect(expire('guest')).toBe(Date.parse(in30));
  });
});
