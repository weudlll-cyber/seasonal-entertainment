// ============================================================
// File:        discordGrants.test.js
// Path:        server/test/discordGrants.test.js
// Project:     Seasonal Entertainment
// Description: Grants the site does not keep are revoked at Discord (discord/droppedGrants.js;
//              docs/AUTH.md, "Discord: grants not kept"), against the pretend Discord: a login
//              callback for someone already logged in, a sign-up while registration is closed,
//              a link refused, a held sign-up replaced, timed out and seen again, or timed out
//              and never seen (the sweep). A grant a linked account holds is never revoked.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { discordApi } from '../src/discord/api.js';
import { sweepSignups } from '../src/discord/droppedGrants.js';
import { setSetting } from '../src/settings/store.js';
import { DISCORD_TEST, fakeDiscord } from './helpers/fakeDiscord.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const ANNA = '906644507628535809';
const BOB = '200000000000000002';

function setup() {
  const discord = fakeDiscord();
  discord.addUser(ANNA, 'anna', []);
  discord.addUser(BOB, 'bob', []);
  t = makeTestApp({ discord: DISCORD_TEST }, { discordFetch: discord.fetch });
  return discord;
}

async function discordFlow(agent, discord, discordId, query = 'intent=login') {
  const start = await agent.get(`/api/auth/discord/start?${query}`);
  return agent.get(discord.approve(start.headers.location, discordId));
}

// A held sign-up made older than its 15 minutes.
const ageSignups = () =>
  t.db.prepare("UPDATE sessions SET sess = json_set(sess, '$.discordSignup.at', 0)").run();

describe('grants that are not kept', () => {
  it('are revoked when someone already logged in comes back from a Discord login', async () => {
    const discord = setup();
    const { agent } = await registerUser(t, 'carl');
    const back = await discordFlow(agent, discord, ANNA);
    expect(back.headers.location).toBe('/account');
    expect(discord.liveRefreshTokens()).toEqual([]);
    expect(discord.revoked).toHaveLength(1);
  });

  it('are revoked when registration is closed', async () => {
    const discord = setup();
    setSetting(t.db, 'accounts.registrationOpen', false);
    const back = await discordFlow(t.client(), discord, ANNA);
    expect(back.headers.location).toBe('/login?discord=closed');
    expect(discord.liveRefreshTokens()).toEqual([]);
  });

  it('are revoked when a link is refused for another Discord user', async () => {
    const discord = setup();
    const { agent } = await registerUser(t, 'carl');
    await discordFlow(agent, discord, ANNA, 'intent=link');
    const kept = discord.liveRefreshTokens();
    const other = await discordFlow(agent, discord, BOB, 'intent=link');
    expect(other.headers.location).toBe('/account?discord=other_user');
    // Bob's new grant is gone; Anna's link keeps hers.
    expect(discord.liveRefreshTokens()).toEqual(kept);
    expect(discord.revoked).toHaveLength(1);
  });

  it('are revoked when a held sign-up is replaced by another Discord user', async () => {
    const discord = setup();
    const agent = t.client();
    await discordFlow(agent, discord, ANNA);
    const annas = discord.liveRefreshTokens();
    await discordFlow(agent, discord, BOB);
    expect(discord.revoked).toEqual(annas);
    expect(discord.liveRefreshTokens()).toHaveLength(1);
  });

  it('are revoked when a timed-out sign-up is seen again', async () => {
    const discord = setup();
    const agent = t.client();
    await discordFlow(agent, discord, ANNA);
    ageSignups();
    const res = await agent.get('/api/auth/discord/signup');
    expect(res.status).toBe(404);
    expect(discord.liveRefreshTokens()).toEqual([]);
    // Gone from the session: a second look revokes nothing more.
    await agent.get('/api/auth/discord/signup');
    expect(discord.revoked).toHaveLength(1);
  });

  it('are revoked by the sweep when a timed-out sign-up is never seen again', async () => {
    const discord = setup();
    const handle = { api: discordApi(DISCORD_TEST, discord.fetch), key: t.config.secretKey };
    const agent = t.client();
    await discordFlow(agent, discord, ANNA);
    // Not yet timed out: the sweep leaves it.
    await sweepSignups(t.db, handle);
    expect(discord.liveRefreshTokens()).toHaveLength(1);
    ageSignups();
    await sweepSignups(t.db, handle);
    expect(discord.liveRefreshTokens()).toEqual([]);
    // The session no longer holds it: the browser coming back finds nothing.
    expect((await agent.get('/api/auth/discord/signup')).status).toBe(404);
    expect(discord.revoked).toHaveLength(1);
  });
});

describe('grants a linked account holds', () => {
  it('stay when the same Discord user logs in while someone is logged in', async () => {
    const discord = setup();
    const { agent: carl } = await registerUser(t, 'carl');
    await discordFlow(carl, discord, ANNA, 'intent=link');
    const { agent: dora } = await registerUser(t, 'dora');
    await discordFlow(dora, discord, ANNA);
    expect(discord.revoked).toEqual([]);
    expect(discord.liveRefreshTokens()).toHaveLength(2);
  });

  it('stay when a locked account logs in with Discord', async () => {
    const discord = setup();
    const { agent, user } = await registerUser(t, 'carl');
    await discordFlow(agent, discord, ANNA, 'intent=link');
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(user.id);
    const back = await discordFlow(t.client(), discord, ANNA);
    expect(back.headers.location).toBe('/login?discord=locked');
    expect(discord.revoked).toEqual([]);
  });

  it('stay when a link is refused because another account holds that Discord user', async () => {
    const discord = setup();
    const { agent: carl } = await registerUser(t, 'carl');
    await discordFlow(carl, discord, ANNA, 'intent=link');
    const { agent: dora } = await registerUser(t, 'dora');
    const back = await discordFlow(dora, discord, ANNA, 'intent=link');
    expect(back.headers.location).toBe('/account?discord=taken');
    expect(discord.revoked).toEqual([]);
  });
});
