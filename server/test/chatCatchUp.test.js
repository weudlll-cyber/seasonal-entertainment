// ============================================================
// File:        chatCatchUp.test.js
// Path:        server/test/chatCatchUp.test.js
// Project:     Seasonal Entertainment
// Description: GET /api/chat/rooms/<slug>/messages?after=<id>: the catch-up a panel asks for
//              once its live connection is subscribed — only messages newer than the id, oldest
//              first, under the room's normal read rule; a malformed id is no paging.
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { chatApp, post } from './helpers/chat.js';
import { registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const after = (agent, room, id) => agent.get(`/api/chat/rooms/${room}/messages?after=${id}`);

it('returns only the messages newer than the id, oldest first', async () => {
  t = chatApp();
  const { agent } = await registerUser(t, 'mia');
  const ids = [];
  for (const text of ['one', 'two', 'three']) {
    ids.push((await post(agent, 'general', text)).body.message.id);
  }
  const res = await after(agent, 'general', ids[0]);
  expect(res.status).toBe(200);
  expect(res.body.messages.map((m) => m.body)).toEqual(['two', 'three']);
  expect((await after(agent, 'general', ids[2])).body.messages).toEqual([]);
});

it('keeps the room rule: a guest cannot catch up on a members room', async () => {
  t = chatApp();
  const { agent } = await registerUser(t, 'mia');
  await post(agent, 'seasonal-race', 'members only');
  expect((await after(t.client(), 'seasonal-race', 0)).status).toBe(404);
});

it('treats a malformed id as no paging (the newest messages)', async () => {
  t = chatApp();
  const { agent } = await registerUser(t, 'mia');
  await post(agent, 'general', 'one');
  await post(agent, 'general', 'two');
  const res = await after(agent, 'general', 'x1');
  expect(res.body.messages.map((m) => m.body)).toEqual(['one', 'two']);
});
