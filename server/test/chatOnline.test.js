// ============================================================
// File:        chatOnline.test.js
// Path:        server/test/chatOnline.test.js
// Project:     Seasonal Entertainment
// Description: The home page's Community box from the server: GET /api/chat/glimpse for
//              everyone — the number of members shown online (a member who hides it is never
//              counted; only the number goes out, never who; a new number is pushed to the
//              readers of "general") and the newest 3 messages of "general", never a hidden one
//              and nothing once that room is for members only.
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { post } from './helpers/chat.js';
import { registerUser } from './helpers/testApp.js';

let t;
let server;
let sockets = [];
afterEach(async () => {
  sockets.forEach((page) => page.ws.close());
  await Promise.all(sockets.map((page) => page.closed));
  sockets = [];
  await stopServer(server);
  t.close();
});

const count = async () => (await t.client().get('/api/chat/glimpse')).body.online;
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

it('counts members shown online and pushes the number to readers of general', async () => {
  let url;
  ({ t, server, url } = await listeningChat());
  const guest = connect(url);
  sockets.push(guest);
  await guest.opened;
  await guest.subscribe('general');
  expect(await count()).toBe(0);

  const { agent: mia } = await registerUser(t, 'mia');
  const { agent: ben } = await registerUser(t, 'ben');
  await mia.put('/api/auth/privacy').send({ showOnline: false }); // ben stays visible
  for (const agent of [mia, ben]) {
    const page = connect(url, { cookie: cookieOf(agent) });
    sockets.push(page);
    await page.opened;
  }
  await settle();
  expect(await count()).toBe(1);
  const pushed = guest.events.filter((e) => e.type === 'online');
  expect(pushed.at(-1)).toEqual({ type: 'online', count: 1, room: 'general' });
  expect(JSON.stringify(pushed)).not.toMatch(/mia|ben/);
});

it('shows the newest 3 visible messages of general, and none once it is for members', async () => {
  ({ t, server } = await listeningChat());
  const { agent: mia } = await registerUser(t, 'mia');
  for (const body of ['one', 'two', 'three', 'four']) await post(mia, 'general', body);
  // "four" is hidden by a moderator: it never shows, the next older one moves up.
  t.db
    .prepare("UPDATE chat_messages SET hidden_at = 'now', hidden_by = 'olga' WHERE body = 'four'")
    .run();
  const glimpse = async () => (await t.client().get('/api/chat/glimpse')).body;
  expect((await glimpse()).messages.map((m) => m.body)).toEqual(['one', 'two', 'three']);
  expect((await glimpse()).room).toBe('general');

  t.db.prepare("UPDATE chat_rooms SET read_access = 'members' WHERE slug = 'general'").run();
  expect(await glimpse()).toMatchObject({ room: null, messages: [] });
});
