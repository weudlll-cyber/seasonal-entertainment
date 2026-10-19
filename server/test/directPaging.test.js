// ============================================================
// File:        directPaging.test.js
// Path:        server/test/directPaging.test.js
// Project:     Seasonal Entertainment
// Description: Paging back through a direct conversation (GET /api/chat/direct/:id?before=<id>):
//              pages of 100, oldest first within a page, each page older than the last, `more`
//              true until the first message; the key ids of every page come with it; a third
//              member and guests get nothing of it, paging or not. Messages are stored
//              directly (the server never reads them; direct.test.js covers the cryptography).
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { addDirect } from '../src/chat/directStore.js';
import { memberWithKey, PASSWORD } from './helpers/keys.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t.close());

const NONCE = Buffer.alloc(24).toString('base64');

// count messages between a and b, alternating senders; returns their ids, oldest first.
function storeConversation(a, b, count) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const [from, to] = i % 2 ? [b, a] : [a, b];
    const message = addDirect(t.db, {
      senderId: from.user.id,
      recipientId: to.user.id,
      senderKeyId: from.keyId,
      recipientKeyId: to.keyId,
      nonce: NONCE,
      ciphertext: Buffer.from(`message ${i}`).toString('base64'),
    });
    ids.push(message.id);
  }
  return ids;
}

const page = async (member, partner, before) =>
  (
    await member.agent.get(
      `/api/chat/direct/${partner.user.id}${before ? `?before=${before}` : ''}`
    )
  ).body;

it('pages back in hundreds, oldest first within a page, until the first message', async () => {
  t = makeTestApp();
  const anna = await memberWithKey(t, 'anna');
  const ben = await memberWithKey(t, 'ben');
  const ids = storeConversation(anna, ben, 250);

  const newest = await page(anna, ben);
  expect(newest.messages.map((m) => m.id)).toEqual(ids.slice(150));
  expect(newest.more).toBe(true);
  const second = await page(anna, ben, newest.messages[0].id);
  expect(second.messages.map((m) => m.id)).toEqual(ids.slice(50, 150));
  expect(second.more).toBe(true);
  const last = await page(ben, anna, second.messages[0].id); // the partner pages alike
  expect(last.messages.map((m) => m.id)).toEqual(ids.slice(0, 50));
  expect(last.more).toBe(false);
  // Every page names the keys its messages were made with.
  expect(Object.keys(last.keys).sort()).toEqual([anna.keyId, ben.keyId].map(String).sort());
});

it('says there is no more when exactly one page exists, and a bad id is no paging', async () => {
  t = makeTestApp();
  const anna = await memberWithKey(t, 'anna');
  const ben = await memberWithKey(t, 'ben');
  const ids = storeConversation(anna, ben, 100);
  expect((await page(anna, ben)).more).toBe(false);
  expect((await page(anna, ben, 'x5')).messages.map((m) => m.id)).toEqual(ids);
  expect((await page(anna, ben, ids[0])).messages).toEqual([]);
});

it('gives a third member and guests nothing of the conversation, paging or not', async () => {
  t = makeTestApp();
  const anna = await memberWithKey(t, 'anna');
  const ben = await memberWithKey(t, 'ben');
  const ids = storeConversation(anna, ben, 120);
  const carol = await registerUser(t, 'carol', PASSWORD);
  const before = ids.at(-1) + 1;
  for (const partner of [anna, ben]) {
    const answer = await carol.agent.get(`/api/chat/direct/${partner.user.id}?before=${before}`);
    expect(answer.body.messages).toEqual([]);
    expect(answer.body.more).toBe(false);
  }
  const guest = await t.client().get(`/api/chat/direct/${anna.user.id}?before=${before}`);
  expect(guest.status).toBe(401);
});
