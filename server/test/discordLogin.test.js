// ============================================================
// File:        discordLogin.test.js
// Path:        server/test/discordLogin.test.js
// Project:     Seasonal Entertainment
// Description: Discord login and linking (docs/AUTH.md, "Discord"; SE-DISCORD-1 piece 1), against
//              the pretend Discord (helpers/fakeDiscord.js): state and PKCE, a wrong or replayed
//              state, denied consent, the sign-up (no email, no password, the name offered and
//              made to fit), logging in a linked account, a Discord user linked to a second
//              account refused, unlinking only with a password, the staff 2FA step after a
//              Discord login, failed callbacks counting on the login limit, the feature off, and
//              the client secret and tokens never reaching the browser.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { codeForStep, stepAt } from '../src/twofa/totp.js';
import { fitUsername } from '../src/discord/username.js';
import { setSetting } from '../src/settings/store.js';
import { proof } from './helpers/accountKeys.js';
import { DISCORD_TEST, fakeDiscord } from './helpers/fakeDiscord.js';
import { STAFF_TOTP_SECRET, makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const DISCORD_ID = '906644507628535809';

function setup(overrides = {}) {
  const discord = fakeDiscord();
  discord.addUser(DISCORD_ID, 'weudlll', ['1110866352857690112']);
  discord.addUser('200000000000000002', 'second', []);
  t = makeTestApp({ discord: DISCORD_TEST, ...overrides }, { discordFetch: discord.fetch });
  return discord;
}

// Every answer the browser got, to check that no secret or token is in any of them.
function recorder(agent) {
  const seen = [];
  const keep = (res) => {
    seen.push(JSON.stringify(res.headers) + res.text);
    return res;
  };
  return {
    seen,
    get: async (path) => keep(await agent.get(path)),
    send: async (method, path, body) => keep(await agent[method](path).send(body)),
  };
}

// /start, Discord's approval, and the callback: returns the callback's answer.
async function discordFlow(agent, discord, discordId, query = 'intent=login') {
  const start = await agent.get(`/api/auth/discord/start?${query}`);
  expect(start.status).toBe(302);
  return agent.get(discord.approve(start.headers.location, discordId));
}

async function signUp(agent, discord, discordId = DISCORD_ID, username = 'weudlll') {
  const back = await discordFlow(agent, discord, discordId);
  expect(back.headers.location).toMatch(/^\/register\/discord/);
  const res = await agent.post('/api/auth/discord/register').send({ username, ageConfirmed: true });
  expect(res.status).toBe(201);
  return res.body.userId;
}

describe('the start of a Discord login', () => {
  it('sends the member to Discord with state, PKCE (S256) and only the two scopes', async () => {
    setup();
    const start = await t.client().get('/api/auth/discord/start?intent=login&next=/chat');
    const url = new URL(start.headers.location);
    expect(url.origin + url.pathname).toBe(DISCORD_TEST.authorizeUrl);
    expect(url.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(url.searchParams.get('redirect_uri')).toBe(DISCORD_TEST.redirectUri);
  });

  it('is not there while Discord is not set up', async () => {
    t = makeTestApp();
    expect((await t.client().get('/api/auth/discord/start')).status).toBe(404);
    expect((await t.client().get('/api/auth/session')).body.features.discord).toBe(false);
  });
});

describe('the callback', () => {
  it('refuses a wrong state, and a state used once already', async () => {
    const discord = setup();
    const agent = t.client();
    const start = await agent.get('/api/auth/discord/start');
    const back = discord.approve(start.headers.location, DISCORD_ID);
    const forged = back.replace(/state=[^&]+/, 'state=forged-state-value-00');
    const wrong = await agent.get(forged);
    expect(wrong.headers.location).toBe('/login?discord=expired');
    // The flow is spent: the right state no longer works either.
    expect((await agent.get(back)).headers.location).toBe('/login?discord=expired');
    expect((await agent.get('/api/auth/session')).body.user).toBeNull();
  });

  it('needs the verifier: a code exchanged with another one is refused by Discord', async () => {
    const discord = setup();
    const agent = t.client();
    const start = await agent.get('/api/auth/discord/start');
    const location = start.headers.location.replace(/code_challenge=[^&]+/, 'code_challenge=x');
    expect((await agent.get(discord.approve(location, DISCORD_ID))).headers.location).toBe(
      '/login?discord=failed'
    );
  });

  it('goes back with "denied" when the member refuses consent', async () => {
    const discord = setup();
    const agent = t.client();
    const start = await agent.get('/api/auth/discord/start');
    const res = await agent.get(discord.deny(start.headers.location));
    expect(res.headers.location).toBe('/login?discord=denied');
  });

  it('counts failed callbacks on the login limit per IP', async () => {
    const discord = setup({ rateLimits: { login: { windowMs: 60_000, max: 2 } } });
    const agent = t.client();
    for (let i = 0; i < 2; i += 1) {
      expect((await agent.get('/api/auth/discord/callback?state=x&code=y')).headers.location).toBe(
        '/login?discord=expired'
      );
    }
    const start = await agent.get('/api/auth/discord/start');
    const blocked = await agent.get(discord.approve(start.headers.location, DISCORD_ID));
    expect(blocked.headers.location).toBe('/login?discord=too_many');
  });
});

describe('signing up with Discord', () => {
  it('makes an account without email or password, linked, with the roles read', async () => {
    const discord = setup();
    const agent = t.client();
    await discordFlow(agent, discord, DISCORD_ID);
    const offer = await agent.get('/api/auth/discord/signup');
    expect(offer.body).toMatchObject({ discordName: 'weudlll', suggested: 'weudlll' });
    // The age confirmation is required, as for every registration.
    const noAge = await agent.post('/api/auth/discord/register').send({ username: 'weudlll' });
    expect(noAge.status).toBe(400);
    const res = await agent
      .post('/api/auth/discord/register')
      .send({ username: 'weudlll', ageConfirmed: true });
    expect(res.status).toBe(201);
    const row = t.db
      .prepare('SELECT email, password_hash AS hash, kdf_salt AS salt FROM users WHERE id = ?')
      .get(res.body.userId);
    expect(row).toEqual({ email: null, hash: null, salt: null });
    const session = (await agent.get('/api/auth/session')).body.user;
    expect(session).toMatchObject({ username: 'weudlll', hasPassword: false, email: null });
    expect(session.discord).toMatchObject({ name: 'weudlll', status: 'member' });
    const link = t.db.prepare('SELECT * FROM discord_links').get();
    expect(link.discord_id).toBe(DISCORD_ID);
    expect(JSON.parse(link.role_ids)).toEqual(['1110866352857690112']);
    expect(link.refresh_token).toMatch(/^enc1:/);
  });

  it('offers a free name made to fit the site rules', async () => {
    const discord = setup();
    await registerUser(t, 'weudlll');
    const agent = t.client();
    await discordFlow(agent, discord, DISCORD_ID);
    expect((await agent.get('/api/auth/discord/signup')).body.suggested).toBe('weudlll2');
    expect(fitUsername('_.x')).toBe('memberx');
    expect(fitUsername('Guest-abc')).toBe('member-abc');
    expect(fitUsername('a'.repeat(40))).toHaveLength(24);
  });

  it('logs the linked account in next time, and keeps the next page', async () => {
    const discord = setup();
    const userId = await signUp(t.client(), discord);
    const agent = t.client();
    const back = await discordFlow(agent, discord, DISCORD_ID, 'intent=login&next=/chat');
    expect(back.headers.location).toBe('/chat');
    expect((await agent.get('/api/auth/session')).body.user.id).toBe(userId);
  });

  it('refuses a locked account', async () => {
    const discord = setup();
    const userId = await signUp(t.client(), discord);
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(userId);
    const back = await discordFlow(t.client(), discord, DISCORD_ID);
    expect(back.headers.location).toBe('/login?discord=locked');
  });

  it('is refused while registration is closed', async () => {
    const discord = setup();
    setSetting(t.db, 'accounts.registrationOpen', false);
    const back = await discordFlow(t.client(), discord, DISCORD_ID);
    expect(back.headers.location).toBe('/login?discord=closed');
  });
});

describe('linking and unlinking', () => {
  it('links the signed-in account; a Discord user linked elsewhere is refused', async () => {
    const discord = setup();
    const { agent: anna, user } = await registerUser(t, 'anna');
    const linked = await discordFlow(anna, discord, DISCORD_ID, 'intent=link');
    expect(linked.headers.location).toBe('/account?discord=linked');
    expect(t.db.prepare('SELECT user_id AS u FROM discord_links').get().u).toBe(user.id);
    const { agent: bob } = await registerUser(t, 'bob');
    const taken = await discordFlow(bob, discord, DISCORD_ID, 'intent=link');
    expect(taken.headers.location).toBe('/account?discord=taken');
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM discord_links').get().n).toBe(1);
  });

  it('refuses linking a second Discord user to an account that has one', async () => {
    const discord = setup();
    const { agent } = await registerUser(t, 'anna');
    await discordFlow(agent, discord, DISCORD_ID, 'intent=link');
    const other = await discordFlow(agent, discord, '200000000000000002', 'intent=link');
    expect(other.headers.location).toBe('/account?discord=other_user');
  });

  it('unlinks only with a password, proven, and revokes the token at Discord', async () => {
    const discord = setup();
    const passwordless = t.client();
    await signUp(passwordless, discord);
    const refused = await passwordless.delete('/api/auth/discord').send({});
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('password_required');

    const { agent } = await registerUser(t, 'anna', 'correct-horse-1');
    await discordFlow(agent, discord, '200000000000000002', 'intent=link');
    const wrong = await agent.delete('/api/auth/discord').send(await proof('wrong-password-9'));
    expect(wrong.status).toBe(401);
    const before = discord.calls.revoke;
    const ok = await agent.delete('/api/auth/discord').send(await proof('correct-horse-1'));
    expect(ok.status).toBe(200);
    expect(discord.calls.revoke).toBe(before + 1);
    expect((await agent.get('/api/auth/session')).body.user.discord).toBeNull();
  });
});

describe('staff', () => {
  it('still pass the site 2FA after a Discord login', async () => {
    const discord = setup();
    const { agent: admin } = await makeStaff(t, 'boss', 'admin');
    await discordFlow(admin, discord, DISCORD_ID, 'intent=link');
    const agent = t.client();
    const back = await discordFlow(agent, discord, DISCORD_ID);
    expect(back.headers.location).toMatch(/^\/login\?discord=2fa/);
    expect((await agent.get('/api/auth/session')).body.user).toBeNull();
    const code = codeForStep(STAFF_TOTP_SECRET, stepAt(Date.now()));
    expect((await agent.post('/api/2fa/login').send({ code })).status).toBe(200);
    expect((await agent.get('/api/auth/session')).body.user.username).toBe('boss');
  });
});

describe('secrets', () => {
  it('never shows the client secret or a token to the browser', async () => {
    const discord = setup();
    const browser = recorder(t.client());
    const start = await browser.get('/api/auth/discord/start?intent=login');
    await browser.get(discord.approve(start.headers.location, DISCORD_ID));
    await browser.get('/api/auth/discord/signup');
    await browser.send('post', '/api/auth/discord/register', {
      username: 'weudlll',
      ageConfirmed: true,
    });
    await browser.get('/api/auth/session');
    const secrets = [DISCORD_TEST.clientSecret, ...discord.liveRefreshTokens()];
    for (const text of browser.seen)
      for (const secret of secrets) expect(text).not.toContain(secret);
    // The secret went to Discord only, in the Authorization header of the token calls.
    const tokenCalls = discord.sent.filter((s) => s.path.startsWith('/oauth2/'));
    expect(tokenCalls.length).toBeGreaterThan(0);
    for (const call of discord.sent) expect(call.body).not.toContain(DISCORD_TEST.clientSecret);
  });
});
