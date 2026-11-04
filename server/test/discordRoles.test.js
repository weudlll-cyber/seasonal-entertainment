// ============================================================
// File:        discordRoles.test.js
// Path:        server/test/discordRoles.test.js
// Project:     Seasonal Entertainment
// Description: Discord roles and their refresh (docs/AUTH.md, "Discord: steps"; SE-DISCORD-1
//              piece 2), against the pretend Discord: the roles read at login with the refresh
//              token sealed; the daily read rotating the token strictly (the new one stored with
//              the roles, the old one dead; the new one stored before the member read, so a stop
//              during that read loses nothing), never two refreshes at once, an unlink during a
//              read winning (no link brought back, the new token revoked), invalid_grant marking
//              the link "needs login" with its steps hidden until the next Discord login, 404
//              10004 meaning "not on the server", a rate limit postponing the read, the job
//              picking due links only, and a mapping change showing at once without a refresh.
// ============================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { discordApi } from '../src/discord/api.js';
import { refreshDue, refreshLink, startDailyRefresh } from '../src/discord/refresh.js';
import { openToken } from '../src/discord/tokenBox.js';
import { stepsOfUser } from '../src/discord/steps.js';
import { deleteLink } from '../src/discord/store.js';
import { DISCORD_TEST, fakeDiscord } from './helpers/fakeDiscord.js';
import { seedTestSteps } from './helpers/steps.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const DISCORD_ID = '906644507628535809';
const GOLDEN = '1110000000000000004';
const LEVEL_2 = '1120000000000000002';

// An app with the pretend Discord, one account made with Discord, and the handle refresh.js
// takes (as discord/index.js builds it).
async function setup(roles = [GOLDEN]) {
  const discord = fakeDiscord();
  discord.addUser(DISCORD_ID, 'weudlll', roles);
  t = makeTestApp({ discord: DISCORD_TEST }, { discordFetch: discord.fetch });
  const agent = t.client();
  const start = await agent.get('/api/auth/discord/start');
  await agent.get(discord.approve(start.headers.location, DISCORD_ID));
  const res = await agent
    .post('/api/auth/discord/register')
    .send({ username: 'weudlll', ageConfirmed: true });
  const changed = [];
  const handle = {
    api: discordApi(DISCORD_TEST, discord.fetch),
    key: t.config.secretKey,
    onChange: (id) => changed.push(id),
  };
  return { discord, agent, userId: res.body.userId, handle, changed };
}

const link = () => t.db.prepare('SELECT * FROM discord_links').get();
const mapStep = (name, roleId) =>
  t.db.prepare('UPDATE discord_steps SET role_id = ? WHERE name = ?').run(roleId, name);
const seed = () => seedTestSteps(t.db);
const due = () => t.db.prepare("UPDATE discord_links SET next_refresh_at = '2000-01-01'").run();

describe('at login', () => {
  it('reads the roles and stores the refresh token sealed', async () => {
    const { discord } = await setup();
    const row = link();
    expect(JSON.parse(row.role_ids)).toEqual([GOLDEN]);
    expect(row.status).toBe('member');
    expect(row.refresh_token).toMatch(/^enc1:/);
    for (const live of discord.liveRefreshTokens()) expect(row.refresh_token).not.toContain(live);
  });
});

describe('the daily read', () => {
  it('rotates strictly: the new token is stored with the roles, the old one is dead', async () => {
    const { discord, userId, handle, changed } = await setup();
    const before = link();
    const liveBefore = discord.liveRefreshTokens();
    discord.setRoles(DISCORD_ID, [GOLDEN, LEVEL_2]);
    expect(await refreshLink(t.db, handle, userId, { onChange: handle.onChange })).toBe('done');
    const after = link();
    expect(after.refresh_token).not.toBe(before.refresh_token);
    expect(JSON.parse(after.role_ids)).toEqual([GOLDEN, LEVEL_2]);
    expect(after.refreshing_since).toBeNull();
    // The token the link held before is gone at Discord; exactly one live one is left.
    expect(discord.liveRefreshTokens()).toHaveLength(1);
    expect(discord.liveRefreshTokens()[0]).not.toBe(liveBefore[0]);
    expect(changed).toEqual([userId]);
    // And the stored one works: a second read succeeds.
    expect(await refreshLink(t.db, handle, userId)).toBe('done');
  });

  it('stores the new token before reading the member: a stop during that read loses nothing', async () => {
    const { discord, userId, handle } = await setup();
    let heldDuringRead;
    const stopping = {
      ...handle,
      api: {
        ...handle.api,
        // The server stops while the member read is on its way: what the database holds then.
        memberRoles: async () => {
          heldDuringRead = link().refresh_token;
          throw new Error('stopped');
        },
      },
    };
    await refreshLink(t.db, stopping, userId);
    expect(await openToken(heldDuringRead, handle.key)).toBe(discord.liveRefreshTokens()[0]);
  });

  it('never runs two refreshes of one account at once', async () => {
    const { discord, userId, handle } = await setup();
    let release;
    discord.refreshGate = new Promise((resolve) => {
      release = resolve;
    });
    const first = refreshLink(t.db, handle, userId);
    const second = await refreshLink(t.db, handle, userId);
    expect(second).toBe('busy');
    release();
    expect(await first).toBe('done');
    expect(discord.calls.refresh).toBe(1);
    discord.refreshGate = null;
    expect(await refreshLink(t.db, handle, userId)).toBe('done');
  });

  it('an unlink while Discord answers wins: no link comes back, the new token is revoked', async () => {
    const { discord, userId, handle } = await setup();
    let release;
    discord.refreshGate = new Promise((resolve) => {
      release = resolve;
    });
    const reading = refreshLink(t.db, handle, userId);
    deleteLink(t.db, userId); // as DELETE /api/auth/discord or the account's deletion do
    release();
    expect(await reading).toBe('gone');
    expect(link()).toBeUndefined();
    expect(discord.liveRefreshTokens()).toEqual([]);
  });

  it('marks the link "needs login" on invalid_grant and hides the steps until a login', async () => {
    const { discord, agent, userId, handle } = await setup();
    await seed();
    mapStep('Golden', GOLDEN);
    expect(stepsOfUser(t.db, userId).map((s) => s.name)).toEqual(['Golden']);
    // The member removed the app in Discord: every token of the grant is dead.
    for (const token of discord.liveRefreshTokens())
      await handle.api.revoke(token, 'refresh_token');
    expect(await refreshLink(t.db, handle, userId)).toBe('needs_login');
    expect(link()).toMatchObject({ status: 'needs_login', refresh_token: null });
    expect(stepsOfUser(t.db, userId)).toEqual([]);
    expect((await agent.get('/api/auth/session')).body.user.discord.status).toBe('needs_login');
    // Logging in with Discord again brings them back.
    const start = await agent.get('/api/auth/discord/start?intent=confirm');
    await agent.get(discord.approve(start.headers.location, DISCORD_ID));
    expect(link().status).toBe('member');
    expect(stepsOfUser(t.db, userId).map((s) => s.name)).toEqual(['Golden']);
  });

  it('shows no steps for someone not on the server (404 code 10004)', async () => {
    const { discord, userId, handle } = await setup();
    await seed();
    mapStep('Golden', GOLDEN);
    discord.leaveServer(DISCORD_ID);
    expect(await refreshLink(t.db, handle, userId)).toBe('done');
    expect(link()).toMatchObject({ status: 'not_member', role_ids: '[]' });
    expect(stepsOfUser(t.db, userId)).toEqual([]);
  });

  it('keeps the old token and tries later when Discord is busy', async () => {
    const { discord, userId, handle } = await setup();
    const before = link();
    discord.rateLimitNext = 30;
    expect(await refreshLink(t.db, handle, userId)).toBe('later');
    const after = link();
    expect(after.refresh_token).toBe(before.refresh_token);
    expect(after.refreshing_since).toBeNull();
    const wait = Date.parse(after.next_refresh_at) - Date.now();
    expect(wait).toBeGreaterThan(25_000);
    expect(wait).toBeLessThan(35_000);
  });

  it('a sweep that fails does not stop the role reads', async () => {
    const { userId, handle } = await setup();
    due();
    // A damaged session row: the held sign-ups' sweep fails on it.
    t.db.prepare("INSERT INTO sessions (sid, sess, expire) VALUES ('broken', 'not json', 0)").run();
    const logged = [];
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const stop = startDailyRefresh(t.db, handle, { log: (line) => logged.push(line) });
      await vi.advanceTimersByTimeAsync(60_000);
      stop();
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(link().next_refresh_at > '2000-01-01').toBe(true));
    expect(link().user_id).toBe(userId);
    expect(logged.some((line) => line.includes('sweeping held sign-ups failed'))).toBe(true);
  });

  it('reads only the links that are due', async () => {
    const { discord, handle } = await setup();
    expect(await refreshDue(t.db, handle, { gapMs: 0 })).toBe(0);
    expect(discord.calls.refresh).toBe(0);
    due();
    expect(await refreshDue(t.db, handle, { gapMs: 0 })).toBe(1);
    expect(discord.calls.refresh).toBe(1);
    // The next read is about a day away again.
    const next = Date.parse(link().next_refresh_at) - Date.now();
    expect(next).toBeGreaterThan(23 * 60 * 60_000);
  });
});

describe('the mapping', () => {
  it('takes effect at once, without asking Discord again', async () => {
    const { discord, userId } = await setup([GOLDEN, LEVEL_2]);
    await seed();
    const reads = discord.calls.member;
    expect(stepsOfUser(t.db, userId)).toEqual([]);
    mapStep('Golden', GOLDEN);
    mapStep('Level 2', LEVEL_2);
    expect(stepsOfUser(t.db, userId).map((s) => [s.ladder, s.name])).toEqual([
      ['holder', 'Golden'],
      ['investor', 'Level 2'],
    ]);
    // Only the highest step of a ladder shows.
    mapStep('Level 2', null);
    mapStep('Silver', LEVEL_2);
    expect(stepsOfUser(t.db, userId).map((s) => s.name)).toEqual(['Golden']);
    expect(discord.calls.member).toBe(reads);
  });
});
