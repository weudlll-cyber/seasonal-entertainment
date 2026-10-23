// ============================================================
// File:        embedTokens.test.js
// Path:        server/test/embedTokens.test.js
// Project:     Seasonal Entertainment
// Description: Embed tokens (embed/tokens.js, embed/auth.js): issued to a member's own cookie
//              session for an approved site only, never to a guest or another token; the token
//              reads and writes rooms and direct messages (decrypted with real keys) and uses
//              favourites, unread counts and reporting; uploads (while off), keys, account, 2FA,
//              moderation and admin routes refuse it; it stops working after 12 hours, an
//              embed logout, a site logout, a password change, a lock and the site's removal;
//              only its hash is stored; cookie requests behave exactly as before.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { issueToken } from '../src/embed/tokens.js';
import { newPasswordBody, proof } from './helpers/accountKeys.js';
import { post } from './helpers/chat.js';
import { readDirect, sendDirect } from './helpers/direct.js';
import { SITE, approveSite, removeSite, requestToken, tokenAgent } from './helpers/embed.js';
import { memberWithKey, PASSWORD } from './helpers/keys.js';
import { chatApp } from './helpers/chat.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t.close());

// An approved site and a member's token for it: { member, token, embed (token agent) }.
async function embedded(name = 'mia') {
  await approveSite(t);
  const member = await registerUser(t, name);
  const res = await requestToken(member.agent);
  expect(res.status).toBe(200);
  return { member, token: res.body.token, embed: tokenAgent(t, res.body.token) };
}
const works = async (agent) => (await agent.get('/api/chat/rooms')).status === 200;

describe('issuing', () => {
  it('only for an approved site, only to a signed-in member, valid 12 hours', async () => {
    t = chatApp();
    await approveSite(t);
    const { agent } = await registerUser(t, 'mia');
    expect((await requestToken(agent, 'https://evil.example')).status).toBe(403);
    expect((await requestToken(t.client())).status).toBe(401);
    const res = await requestToken(agent);
    expect(res.status).toBe(200);
    const hours = (Date.parse(res.body.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
    // Stored as a hash only.
    const stored = JSON.stringify(t.db.prepare('SELECT * FROM embed_tokens').all());
    expect(stored).not.toContain(res.body.token);
    expect(stored).toContain(SITE);
  });

  it('a token cannot get itself another token', async () => {
    t = chatApp();
    const { embed } = await embedded();
    const res = await requestToken(embed);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('embed_not_allowed');
  });
});

describe('what a token may do', () => {
  it('rooms: read and write as the member; who it is', async () => {
    t = chatApp();
    const { embed } = await embedded();
    expect((await embed.get('/api/auth/session')).body.user.username).toBe('mia');
    expect((await embed.get('/api/embed/me')).body).toMatchObject({ origin: SITE });
    const sent = await post(embed, 'general', 'hello from the game');
    expect(sent.status).toBe(201);
    expect(sent.body.message.author).toBe('mia');
    // Members-only rooms follow the member's rights.
    expect((await embed.get('/api/chat/rooms/seasonal-race/messages')).status).toBe(200);
    expect((await embed.get('/api/chat/unread')).status).toBe(200);
    expect((await embed.put('/api/chat/favourites/rooms/general')).status).toBeLessThan(300);
    const report = await embed.post(`/api/chat/messages/${sent.body.message.id}/report`);
    expect(report.status).toBe(200);
  });

  it('direct messages: read and send, decrypted with the real keys', async () => {
    t = chatApp();
    await approveSite(t);
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const { token } = (await requestToken(anna.agent)).body;
    const annaInGame = { ...anna, agent: tokenAgent(t, token) };
    expect((await sendDirect(annaInGame, ben.user, { text: 'from the game' })).status).toBe(201);
    expect((await sendDirect(ben, anna.user, { text: 'back to you' })).status).toBe(201);
    const { messages } = await readDirect(annaInGame, ben.user);
    expect(messages.map((m) => m.payload)).toEqual([
      { text: 'from the game' },
      { text: 'back to you' },
    ]);
    expect((await annaInGame.agent.get('/api/chat/direct')).body.conversations).toHaveLength(1);
  });

  it.each([
    ['the own key', 'get', '/api/keys/me'],
    ['a new key pair', 'post', '/api/keys'],
    ['a password change', 'post', '/api/auth/password'],
    ['a logout of the site', 'post', '/api/auth/logout'],
    ['2FA setup', 'post', '/api/2fa/setup'],
    ['the admin users list', 'get', '/api/admin/users'],
    ['moderation', 'post', '/api/chat/messages/1/hide'],
    ['the calls', 'get', '/api/calls'],
  ])('refuses %s', async (_name, method, url) => {
    t = chatApp();
    const { embed } = await embedded();
    const res = await embed[method](url).send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('embed_not_allowed');
  });

  it("refuses an upload while the site's uploads are off (the default; embedFiles.test.js)", async () => {
    t = chatApp();
    const { embed } = await embedded();
    const res = await embed.post('/api/chat/uploads').send({});
    expect([res.status, res.body.error]).toEqual([403, 'embed_uploads_off']);
  });
});

describe('it stops working', () => {
  it('after 12 hours', async () => {
    t = chatApp();
    await approveSite(t);
    const { user } = await registerUser(t, 'mia');
    const thirteenHoursAgo = Date.now() - 13 * 3_600_000;
    const stale = issueToken(t.db, { ...user, sessionEpoch: 0 }, SITE, thirteenHoursAgo);
    const res = await tokenAgent(t, stale.token).get('/api/chat/rooms');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('embed_token_invalid');
  });

  it('after an embed logout, a site logout, a password change, a lock and the removal', async () => {
    t = chatApp();
    // Embed logout: that token ends.
    let { embed, member } = await embedded('mia');
    expect((await embed.post('/api/embed/logout')).status).toBe(200);
    expect(await works(embed)).toBe(false);
    // Site logout: every token of the member ends.
    ({ embed } = await requestFresh(member));
    expect((await member.agent.post('/api/auth/logout')).status).toBe(200);
    expect(await works(embed)).toBe(false);
    // Password change (the session epoch moves on).
    const ben = await registerUser(t, 'ben');
    ({ embed } = await requestFresh(ben));
    const next = await newPasswordBody('battery-staple-2');
    const change = await ben.agent.post('/api/auth/password').send({
      currentAuthKey: (await proof(PASSWORD)).authKey,
      newSalt: next.salt,
      newAuthKey: next.authKey,
    });
    expect(change.status).toBe(200);
    expect(await works(embed)).toBe(false);
    // Locked by an admin.
    const cleo = await registerUser(t, 'cleo');
    ({ embed } = await requestFresh(cleo));
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(cleo.user.id);
    expect(await works(embed)).toBe(false);
    // The site removed from the list: refused, and the tokens are gone.
    const dora = await registerUser(t, 'dora');
    ({ embed } = await requestFresh(dora));
    expect(await works(embed)).toBe(true);
    await removeSite(t);
    expect(await works(embed)).toBe(false);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM embed_tokens').get().n).toBe(0);
  });
});

// A new token for a member whose earlier one may have ended.
async function requestFresh(member) {
  const res = await requestToken(member.agent);
  expect(res.status).toBe(200);
  const embed = tokenAgent(t, res.body.token);
  expect(await works(embed)).toBe(true);
  return { embed };
}

describe('cookies as before', () => {
  it('a cookie session uses every route it did, and the embed routes need a token', async () => {
    t = chatApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    expect((await agent.get('/api/keys/me')).status).toBe(200);
    expect((await agent.get('/api/admin/users')).status).toBe(200);
    expect((await post(agent, 'general', 'with my cookie')).status).toBe(201);
    expect((await agent.get('/api/embed/me')).status).toBe(400);
    expect((await agent.post('/api/embed/logout')).status).toBe(400);
  });
});
