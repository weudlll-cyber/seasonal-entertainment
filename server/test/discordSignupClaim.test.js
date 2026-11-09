// ============================================================
// File:        discordSignupClaim.test.js
// Path:        server/test/discordSignupClaim.test.js
// Project:     Seasonal Entertainment
// Description: A held Discord sign-up is taken either by the registration or by the sweep, never
//              by both (discord/droppedGrants.js, claimSignup and sweepSignups; docs/AUTH.md,
//              "Discord: grants not kept"), on a faked clock: a registration whose request read
//              the session a second before the timeout while the sweep took the sign-up at the
//              timeout fails cleanly (start again) and stores no account; one that claimed first
//              keeps a live grant however late the sweep runs.
// ============================================================

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { discordApi } from '../src/discord/api.js';
import { claimSignup, sweepSignups } from '../src/discord/droppedGrants.js';
import { DISCORD_TEST, fakeDiscord } from './helpers/fakeDiscord.js';
import { makeTestApp } from './helpers/testApp.js';

const ANNA = '906644507628535809';
const TIMEOUT = 15 * 60_000;
let t;
let discord;
let handle;
let start;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  start = Date.now();
  discord = fakeDiscord();
  discord.addUser(ANNA, 'anna', []);
  t = makeTestApp({ discord: DISCORD_TEST }, { discordFetch: discord.fetch });
  handle = { api: discordApi(DISCORD_TEST, discord.fetch), key: t.config.secretKey };
});
afterEach(() => {
  t.close();
  vi.useRealTimers();
});

async function heldSignup() {
  const agent = t.client();
  const begin = await agent.get('/api/auth/discord/start?intent=login');
  await agent.get(discord.approve(begin.headers.location, ANNA));
  return agent;
}
const register = (agent) =>
  agent.post('/api/auth/discord/register').send({ username: 'anna', ageConfirmed: true });
const heldRow = () =>
  t.db
    .prepare(
      "SELECT sid, sess FROM sessions WHERE json_extract(sess, '$.discordSignup') IS NOT NULL"
    )
    .get();
const accounts = () => t.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

// Runs `during` right after the next read of a session row, the way a sweep tick lands between
// the moment a request read its session and the moment the route uses it.
function afterNextSessionRead(during) {
  const prepare = t.db.prepare.bind(t.db);
  const spy = vi.spyOn(t.db, 'prepare').mockImplementation((sql) => {
    const statement = prepare(sql);
    if (!/SELECT sess\s+FROM sessions/.test(sql)) return statement;
    spy.mockRestore();
    return {
      get: (...args) => {
        const row = statement.get(...args);
        during();
        return row;
      },
    };
  });
}

it('a sweep that takes the sign-up mid-request makes the registration fail cleanly', async () => {
  const agent = await heldSignup();
  vi.setSystemTime(start + TIMEOUT - 1000);
  let sweeping;
  afterNextSessionRead(() => (sweeping = sweepSignups(t.db, handle, start + TIMEOUT)));
  const res = await register(agent);
  await sweeping;
  expect(res.status).toBe(409);
  expect(res.body.error).toBe('signup_expired');
  // No account with a revoked grant: nothing stored, the grant gone at Discord.
  expect(accounts()).toBe(0);
  expect(discord.liveRefreshTokens()).toEqual([]);
  expect(discord.revoked).toHaveLength(1);
  // The browser's copy is gone too: it does not come back, and starting again works.
  expect((await agent.get('/api/auth/discord/signup')).status).toBe(404);
  const again = await heldSignup();
  expect((await register(again)).status).toBe(201);
});

it('a registration that claimed first keeps a live grant, however late the sweep runs', async () => {
  const agent = await heldSignup();
  vi.setSystemTime(start + TIMEOUT - 1000);
  expect((await register(agent)).status).toBe(201);
  await sweepSignups(t.db, handle, start + 2 * TIMEOUT);
  expect(discord.revoked).toEqual([]);
  expect(discord.liveRefreshTokens()).toHaveLength(1);
});

it('a claim and a sweep exclude each other on the session row', async () => {
  await heldSignup();
  const { sid, sess } = heldRow();
  const signup = JSON.parse(sess).discordSignup;
  // Timed out: no claim, whatever the row holds.
  expect(claimSignup(t.db, sid, signup, start + TIMEOUT)).toBe(false);
  expect(claimSignup(t.db, sid, signup, start + TIMEOUT - 1)).toBe(true);
  // Taken: the sweep finds nothing, even with no account holding the grant yet.
  await sweepSignups(t.db, handle, start + 2 * TIMEOUT);
  expect(discord.revoked).toEqual([]);
  expect(heldRow()).toBeUndefined();
  // And the other way round: once the sweep took one, it cannot be claimed.
  await heldSignup();
  const row = heldRow();
  await sweepSignups(t.db, handle, start + TIMEOUT);
  expect(claimSignup(t.db, row.sid, JSON.parse(row.sess).discordSignup, start)).toBe(false);
  expect(discord.revoked).toHaveLength(1);
});
