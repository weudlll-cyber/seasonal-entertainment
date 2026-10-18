// ============================================================
// File:        mentions.test.js
// Path:        server/test/mentions.test.js
// Project:     Seasonal Entertainment
// Description: Guards @mentions in room messages: the mentioned member is notified (an unread
//              mention in that room), nobody else; not a member who cannot read the room, not
//              the sender, not an unknown name; in a muted room too; reading the room clears
//              it; guests' "@name" notifies a member too; messages carry their mentions; a
//              hostile text stays text (names have the username shape, nothing else matches).
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { chatApp, post } from './helpers/chat.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const mentionsIn = async (agent, slug) =>
  (await agent.get('/api/chat/unread')).body.rooms.find((r) => r.slug === slug)?.mentions;

it('notifies the mentioned member only; not the sender, unknown names or members without access', async () => {
  t = chatApp();
  const anna = await registerUser(t, 'anna');
  const ben = await registerUser(t, 'ben');
  const carol = await registerUser(t, 'carol');
  const { agent: mona } = await makeStaff(t, 'mona', 'organiser');
  const sent = await post(ben.agent, 'general', 'hi @Anna and @ben and @nobody').expect(201);
  expect(sent.body.message.mentions).toEqual([{ id: anna.user.id, username: 'anna' }]);
  expect(await mentionsIn(anna.agent, 'general')).toBe(1);
  expect(await mentionsIn(ben.agent, 'general')).toBe(0);
  expect(await mentionsIn(carol.agent, 'general')).toBe(0);

  // Organisers' room: anna (a member) cannot read it, so a mention there is not one.
  await post(mona, 'organisers', 'ask @anna and @carol').expect(201);
  expect(await mentionsIn(anna.agent, 'organisers')).toBeUndefined();
  expect(t.db.prepare('SELECT COUNT(*) AS n FROM chat_mentions').get().n).toBe(1);
});

it('counts in a muted room; reading the room clears it', async () => {
  t = chatApp();
  const anna = await registerUser(t, 'anna');
  const ben = await registerUser(t, 'ben');
  await anna.agent.put('/api/chat/rooms/general/mute').expect(200);
  const sent = (await post(ben.agent, 'general', '@anna look').expect(201)).body.message;
  expect(await mentionsIn(anna.agent, 'general')).toBe(1);
  await anna.agent.post('/api/chat/rooms/general/read').send({ lastId: sent.id }).expect(200);
  expect(await mentionsIn(anna.agent, 'general')).toBe(0);
});

it("a guest's @name notifies a member who may read the room", async () => {
  t = chatApp();
  const anna = await registerUser(t, 'anna');
  await post(t.client(), 'general', 'hello @anna').expect(201);
  expect(await mentionsIn(anna.agent, 'general')).toBe(1);
});

it('messages carry their mentions when read back; hostile text stays text', async () => {
  t = chatApp();
  const anna = await registerUser(t, 'anna');
  const ben = await registerUser(t, 'ben');
  const evil = '@<img src=x onerror=alert(1)> @anna<script>alert(1)</script>';
  await post(ben.agent, 'general', evil).expect(201);
  const [message] = (await anna.agent.get('/api/chat/rooms/general/messages')).body.messages;
  expect(message.body).toBe(evil);
  expect(message.mentions).toEqual([{ id: anna.user.id, username: 'anna' }]);
});
