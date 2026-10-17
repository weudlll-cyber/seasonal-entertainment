// ============================================================
// File:        direct.test.js
// Path:        server/test/direct.test.js
// Project:     Seasonal Entertainment
// Description: Guards end-to-end encrypted direct messages (/api/chat/direct) with real
//              cryptography: a "secret-canary" sent from one member to another is in no stored
//              row and no log line, and the recipient (and the sender) decrypt it; a third
//              member and a moderator get nothing of the conversation from any route; guests
//              are refused; muted and banned members cannot send; a partner without a key or
//              with a changed key gets a clear 409. Unread marker and retention:
//              directReads.test.js.
// ============================================================

import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserKeyPair } from './helpers/accountKeys.js';
import { readDirect, sendDirect } from './helpers/direct.js';
import { PASSWORD, memberWithKey } from './helpers/keys.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => {
  vi.restoreAllMocks();
  t?.close();
});

const canary = () => `secret-canary-${randomBytes(8).toString('hex')}`;
const dumpDatabase = () =>
  t.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .flatMap(({ name }) => t.db.prepare(`SELECT * FROM ${name}`).all())
    .map((row) => JSON.stringify(row))
    .join('\n');

describe('sending and reading', () => {
  it('the canary is stored and logged nowhere; both members decrypt it', async () => {
    const logged = [];
    for (const level of ['log', 'info', 'warn', 'error']) {
      vi.spyOn(console, level).mockImplementation((...args) => logged.push(args.join(' ')));
    }
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const secret = canary();
    const sent = await sendDirect(anna, ben.user, { text: secret });
    expect(sent.status).toBe(201);
    expect(JSON.stringify(sent.body)).not.toContain(secret);

    expect(dumpDatabase()).not.toContain(secret);
    expect(dumpDatabase()).toContain(sent.body.message.ciphertext); // the scan sees the table
    expect(logged.join('\n')).not.toContain(secret);

    const forBen = await readDirect(ben, anna.user);
    expect(forBen.messages.map((m) => m.payload)).toEqual([{ text: secret }]);
    const forAnna = await readDirect(anna, ben.user);
    expect(forAnna.messages.map((m) => m.payload)).toEqual([{ text: secret }]);
  });

  it('a sticker travels as a library id inside the ciphertext', async () => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    expect((await sendDirect(anna, ben.user, { text: 'look', mediaItemId: 7 })).status).toBe(201);
    const { messages } = await readDirect(ben, anna.user);
    expect(messages[0].payload).toEqual({ text: 'look', mediaItemId: 7 });
    expect(messages[0]).not.toHaveProperty('mediaItemId');
  });
});

describe('who gets what', () => {
  it('a third member and a moderator get nothing readable from any route', async () => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const sent = await sendDirect(anna, ben.user, { text: canary() });
    const { ciphertext } = sent.body.message;
    const carol = await registerUser(t, 'carol', PASSWORD);
    const { agent: moderator } = await makeStaff(t, 'mona', 'organiser');
    for (const agent of [carol.agent, moderator]) {
      const answers = [
        await agent.get('/api/chat/direct'),
        await agent.get(`/api/chat/direct/${anna.user.id}`),
        await agent.get(`/api/chat/direct/${ben.user.id}`),
        await agent.get('/api/admin/chat/reports'),
      ];
      for (const answer of answers) expect(JSON.stringify(answer.body)).not.toContain(ciphertext);
      expect(answers[0].body.conversations).toEqual([]);
      expect(answers[1].body.messages).toEqual([]);
    }
  });

  it('guests can neither read nor send', async () => {
    t = makeTestApp();
    const ben = await memberWithKey(t, 'ben');
    const guest = t.client();
    expect((await guest.get('/api/chat/direct')).status).toBe(401);
    expect((await guest.get(`/api/chat/direct/${ben.user.id}`)).status).toBe(401);
    expect((await guest.post(`/api/chat/direct/${ben.user.id}`).send({})).status).toBe(401);
  });

  it('nobody writes to themselves, to a missing account, or to someone without a key', async () => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    expect((await anna.agent.get(`/api/chat/direct/${anna.user.id}`)).status).toBe(400);
    expect((await anna.agent.get('/api/chat/direct/999')).status).toBe(404);
    const { user: carol } = await registerUser(t, 'carol', PASSWORD);
    const page = await anna.agent.get(`/api/chat/direct/${carol.id}`);
    expect(page.body.partnerKey).toBeNull();
    const res = await anna.agent.post(`/api/chat/direct/${carol.id}`).send({
      nonce: 'A'.repeat(32),
      ciphertext: 'AAAA',
      senderKeyId: anna.keyId,
      recipientKeyId: 1,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('no_key');
  });
});

describe('sending rules', () => {
  it.each(['mute', 'ban'])('a member under a %s cannot send', async (kind) => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const until = kind === 'mute' ? new Date(Date.now() + 60_000).toISOString() : null;
    t.db
      .prepare(
        `INSERT INTO chat_sanctions (kind, user_id, target, until, created_by, created_at)
         VALUES (?, ?, 'anna', ?, 'mo', ?)`
      )
      .run(kind, anna.user.id, until, new Date().toISOString());
    const res = await sendDirect(anna, ben.user, { text: 'hi' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(kind === 'mute' ? 'muted' : 'banned');
  });

  it('a changed partner key is refused with the new key, so the browser encrypts again', async () => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const before = (await anna.agent.get(`/api/chat/direct/${ben.user.id}`)).body.partnerKey;
    const fresh = await browserKeyPair(PASSWORD);
    const replaced = await ben.agent.post('/api/keys/replace').send(fresh);
    const res = await anna.agent.post(`/api/chat/direct/${ben.user.id}`).send({
      nonce: 'A'.repeat(32),
      ciphertext: 'AAAA',
      senderKeyId: anna.keyId,
      recipientKeyId: before.keyId,
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: 'key_changed',
      partnerKey: { keyId: replaced.body.keyId, publicKey: fresh.publicKey },
    });
  });

  it('shares the per-sender rate limit with the rooms', async () => {
    t = makeTestApp({
      chat: { rate: { member: { windowMs: 60_000, max: 1 }, guest: { windowMs: 60_000, max: 1 } } },
    });
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    expect((await sendDirect(anna, ben.user, { text: 'one' })).status).toBe(201);
    expect((await sendDirect(anna, ben.user, { text: 'two' })).status).toBe(429);
  });
});
