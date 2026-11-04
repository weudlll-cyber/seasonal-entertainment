// ============================================================
// File:        discordKeys.test.js
// Path:        server/test/discordKeys.test.js
// Project:     Seasonal Entertainment
// Description: The private-message key of an account without a password (docs/CHAT.md,
//              "Accounts without a password"; SE-DISCORD-1 piece 5), against the pretend
//              Discord: a fresh Discord login is the proof (10 minutes; after that refused until
//              it confirms again), never a stand-in for a password account's password; the first
//              key pair with its recovery seal in one request; a first password (only for an
//              account without one), its key sealed in the same request, logging in with it
//              afterwards, the other sessions ended; a recovery-only account that later sets a
//              password; deleting the account with the proof, its token revoked at Discord.
// ============================================================

import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISCORD_PROOF_MS } from '../src/accounts/identityProof.js';
import { REVOKE_FAILED } from '../src/discord/index.js';
import { keysFor, proof, proveForLink } from './helpers/accountKeys.js';
import { DISCORD_TEST, fakeDiscord } from './helpers/fakeDiscord.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => {
  vi.restoreAllMocks();
  t?.close();
});

const DISCORD_ID = '906644507628535809';
const bytes = (n) => randomBytes(n).toString('base64');
// Shapes the server checks (it can open none of them): keys 32 bytes, a sealed key 72.
const keyPair = () => ({ publicKey: bytes(32), sealedPrivateKey: bytes(72) });
const recovery = () => ({ salt: bytes(16), sealed: bytes(72) });

async function setup() {
  const discord = fakeDiscord();
  discord.addUser(DISCORD_ID, 'weudlll', []);
  t = makeTestApp({ discord: DISCORD_TEST }, { discordFetch: discord.fetch });
  const agent = t.client();
  const start = await agent.get('/api/auth/discord/start');
  await agent.get(discord.approve(start.headers.location, DISCORD_ID));
  const res = await agent
    .post('/api/auth/discord/register')
    .send({ username: 'weudlll', ageConfirmed: true });
  return { discord, agent, userId: res.body.userId };
}

// Requests made as if `ms` later (the proof's clock).
const later = (ms) => vi.spyOn(Date, 'now').mockReturnValue(Date.now() + ms);

const confirm = async (agent, discord) => {
  const start = await agent.get('/api/auth/discord/start?intent=confirm&next=/chat');
  return agent.get(discord.approve(start.headers.location, DISCORD_ID));
};

describe('the proof of an account without a password', () => {
  it('is the fresh Discord login, for 10 minutes; then it must confirm again', async () => {
    const { discord, agent } = await setup();
    const session = (await agent.get('/api/auth/session')).body.user;
    expect(session.hasPassword).toBe(false);
    expect(Date.parse(session.discordProofUntil)).toBeGreaterThan(Date.now());
    later(DISCORD_PROOF_MS + 1000);
    const stale = await agent.post('/api/keys').send(keyPair());
    expect(stale.status).toBe(401);
    expect(stale.body.error).toBe('discord_confirm_required');
    vi.restoreAllMocks();
    expect((await confirm(agent, discord)).headers.location).toBe('/chat');
    expect((await agent.post('/api/keys').send(keyPair())).status).toBe(201);
  });

  it('never stands in for the password of an account that has one', async () => {
    const { discord } = await setup();
    discord.addUser('200000000000000002', 'anna', []);
    const { agent } = await registerUser(t, 'anna', 'correct-horse-1');
    await proveForLink(agent);
    const start = await agent.get('/api/auth/discord/start?intent=link');
    await agent.get(discord.approve(start.headers.location, '200000000000000002'));
    // Freshly confirmed with Discord, but no password: refused.
    expect((await agent.post('/api/keys').send(keyPair())).status).toBe(400);
    const res = await agent
      .post('/api/keys')
      .send({ ...keyPair(), ...(await proof('correct-horse-1')) });
    expect(res.status).toBe(201);
  });
});

describe('the first key pair', () => {
  it('comes with its recovery seal in one request; the stored key is that seal', async () => {
    const { agent, userId } = await setup();
    const seal = recovery();
    const pair = { publicKey: bytes(32), sealedPrivateKey: seal.sealed };
    expect((await agent.post('/api/keys').send({ ...pair, recovery: seal })).status).toBe(201);
    const row = t.db.prepare('SELECT * FROM user_secret_keys WHERE user_id = ?').get(userId);
    expect(row).toMatchObject({
      sealed_private: seal.sealed,
      recovery_salt: seal.salt,
      recovery_sealed: seal.sealed,
    });
    const bad = await agent.post('/api/keys').send({ ...keyPair(), recovery: { salt: 'x' } });
    expect(bad.status).toBe(400);
  });
});

describe('a first password', () => {
  it('is set with the proof, seals the key, and logs in from then on', async () => {
    const { discord, agent, userId } = await setup();
    // A second session of the account: another device, logged in with Discord.
    const other = t.client();
    const start = await other.get('/api/auth/discord/start');
    await other.get(discord.approve(start.headers.location, DISCORD_ID));
    expect((await other.get('/api/auth/session')).body.user.id).toBe(userId);
    await agent.post('/api/keys').send({ ...keyPair(), recovery: recovery() });
    const { salt, authKey } = await keysFor('a-new-password-1', bytes(16));
    const sealed = bytes(72);
    const res = await agent
      .post('/api/auth/password/first')
      .send({ salt, authKey, sealedPrivateKey: sealed });
    expect(res.status).toBe(200);
    const row = t.db
      .prepare('SELECT sealed_private AS s FROM user_secret_keys WHERE user_id = ?')
      .get(userId);
    expect(row.s).toBe(sealed);
    expect((await agent.get('/api/auth/session')).body.user.hasPassword).toBe(true);
    // Every other session ended, as after a password change; this one stays.
    expect((await other.get('/api/auth/session')).body.user).toBeNull();
    // Only once: the account has one now (and a password change goes the usual way).
    expect((await agent.post('/api/auth/password/first').send({ salt, authKey })).status).toBe(409);
    // It logs in with the password.
    const { body } = await t.client().post('/api/auth/prelogin').send({ username: 'weudlll' });
    expect(body.salt).toBe(salt);
    const login = await t.client().post('/api/auth/login').send({ username: 'weudlll', authKey });
    expect(login.status).toBe(200);
  });

  it('needs the proof', async () => {
    const { agent } = await setup();
    later(DISCORD_PROOF_MS + 1000);
    const { salt, authKey } = await keysFor('a-new-password-1', bytes(16));
    const res = await agent.post('/api/auth/password/first').send({ salt, authKey });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('discord_confirm_required');
  });

  it('works for a recovery-only account that sets one later, its key then proven by it', async () => {
    const { agent } = await setup();
    await agent.post('/api/keys').send({ ...keyPair(), recovery: recovery() });
    const { salt, authKey } = await keysFor('a-new-password-1', bytes(16));
    // No sealed key: this device does not have it open; the recovery code seals it later.
    expect((await agent.post('/api/auth/password/first').send({ salt, authKey })).status).toBe(200);
    // From now on the key routes ask for the password, as for any account.
    expect((await agent.put('/api/keys/sealed').send({ sealedPrivateKey: bytes(72) })).status).toBe(
      400
    );
    const res = await agent.put('/api/keys/sealed').send({ authKey, sealedPrivateKey: bytes(72) });
    expect(res.status).toBe(200);
  });
});

describe('deleting an account without a password', () => {
  it('needs the proof, and revokes the Discord token', async () => {
    const { discord, agent, userId } = await setup();
    later(DISCORD_PROOF_MS + 1000);
    expect((await agent.delete('/api/auth/account').send({})).status).toBe(401);
    vi.restoreAllMocks();
    await confirm(agent, discord);
    const revokes = discord.calls.revoke;
    expect((await agent.delete('/api/auth/account').send({})).status).toBe(200);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(userId).n).toBe(0);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM discord_links').get().n).toBe(0);
    await vi.waitFor(() => expect(discord.calls.revoke).toBe(revokes + 1));
  });

  it('a revocation that fails is one log line, without the token or the account', async () => {
    const { discord, userId } = await setup();
    const { agent: admin } = await makeStaff(t, 'boss', 'admin');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    discord.rateLimitNext = 60; // Discord answers the revocation with 429
    expect((await admin.delete(`/api/admin/users/${userId}`)).status).toBe(200);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(REVOKE_FAILED));
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    for (const secret of [...discord.revoked, 'weudlll', DISCORD_ID, String(userId)]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('by an admin revokes the Discord token too', async () => {
    const { discord, userId } = await setup();
    const { agent: admin } = await makeStaff(t, 'boss', 'admin');
    const revokes = discord.calls.revoke;
    expect((await admin.delete(`/api/admin/users/${userId}`)).status).toBe(200);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM discord_links').get().n).toBe(0);
    await vi.waitFor(() => expect(discord.calls.revoke).toBe(revokes + 1));
  });
});
