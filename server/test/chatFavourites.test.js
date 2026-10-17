// ============================================================
// File:        chatFavourites.test.js
// Path:        server/test/chatFavourites.test.js
// Project:     Seasonal Entertainment
// Description: Guards /api/chat/favourites: members add and remove favourite rooms and
//              members and find them again in a new session; rooms come back in room order;
//              guests have no favourites; a guest (no account) or oneself cannot be a
//              favourite; nobody reaches another member's favourites; favourites go with the
//              account. Also: messages carry the author's account id for the name menu.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { chatApp, post } from './helpers/chat.js';
import { registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const favourites = async (agent) => (await agent.get('/api/chat/favourites')).body;

describe('favourite rooms', () => {
  it('adds, keeps across sessions, orders by the rooms and removes', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'anna');
    expect((await agent.put('/api/chat/favourites/rooms/announcements')).status).toBe(200);
    expect((await agent.put('/api/chat/favourites/rooms/general')).status).toBe(200);
    // Adding twice changes nothing.
    expect((await agent.put('/api/chat/favourites/rooms/general')).status).toBe(200);
    expect((await favourites(agent)).rooms).toEqual(['general', 'announcements']);

    const again = t.client();
    await again
      .post('/api/auth/login')
      .send({ username: 'anna', password: 'correct-horse-1' })
      .expect(200);
    expect((await favourites(again)).rooms).toEqual(['general', 'announcements']);

    await agent.delete('/api/chat/favourites/rooms/general').expect(200);
    expect((await favourites(agent)).rooms).toEqual(['announcements']);
  });

  it('refuses rooms the member may not read, and leaves out ones they no longer may', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'anna');
    expect((await agent.put('/api/chat/favourites/rooms/organisers')).status).toBe(404);
    expect((await agent.put('/api/chat/favourites/rooms/nope')).status).toBe(404);
    await agent.put('/api/chat/favourites/rooms/seasonal-race').expect(200);
    t.db
      .prepare("UPDATE chat_rooms SET read_access = 'organisers' WHERE slug = 'seasonal-race'")
      .run();
    expect((await favourites(agent)).rooms).toEqual([]);
  });
});

describe('favourite members', () => {
  it('adds and removes members, with an online mark', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'anna');
    const { user: ben } = await registerUser(t, 'ben');
    await agent.put(`/api/chat/favourites/users/${ben.id}`).expect(200);
    expect((await favourites(agent)).users).toEqual([
      { id: ben.id, username: 'ben', online: false },
    ]);
    await agent.delete(`/api/chat/favourites/users/${ben.id}`).expect(200);
    expect((await favourites(agent)).users).toEqual([]);
  });

  it('cannot favourite a guest, a missing account or oneself', async () => {
    t = chatApp();
    const { agent, user } = await registerUser(t, 'anna');
    // A guest writes and gets a guest name; guests have no account id to favourite.
    const guest = t.client();
    await post(guest, 'general', 'hi').expect(201);
    const [message] = (await agent.get('/api/chat/rooms/general/messages')).body.messages;
    expect(message.isGuest).toBe(true);
    expect(message.authorId).toBeNull();
    expect((await agent.put(`/api/chat/favourites/users/${message.author}`)).status).toBe(404);
    expect((await agent.put('/api/chat/favourites/users/999')).status).toBe(404);
    expect((await agent.put(`/api/chat/favourites/users/${user.id}`)).status).toBe(400);
    expect((await favourites(agent)).users).toEqual([]);
  });

  it("members' messages name their author's account", async () => {
    t = chatApp();
    const { agent, user } = await registerUser(t, 'anna');
    const sent = await post(agent, 'general', 'hello').expect(201);
    expect(sent.body.message.authorId).toBe(user.id);
  });
});

describe('access', () => {
  it('guests have no favourites', async () => {
    t = chatApp();
    const guest = t.client();
    expect((await guest.get('/api/chat/favourites')).status).toBe(401);
    expect((await guest.put('/api/chat/favourites/rooms/general')).status).toBe(401);
  });

  it("nobody reaches another member's favourites", async () => {
    t = chatApp();
    const anna = await registerUser(t, 'anna');
    const ben = await registerUser(t, 'ben');
    await anna.agent.put('/api/chat/favourites/rooms/general').expect(200);
    await anna.agent.put(`/api/chat/favourites/users/${ben.user.id}`).expect(200);
    // Ben asks for Anna's list in every way the API could take an account: none works.
    const theirs = await ben.agent.get(`/api/chat/favourites?userId=${anna.user.id}`);
    expect(theirs.body).toEqual({ ok: true, rooms: [], users: [] });
    expect((await ben.agent.get(`/api/chat/favourites/${anna.user.id}`)).status).toBe(404);
    // Ben removing his own (absent) favourite does not touch Anna's.
    await ben.agent.delete(`/api/chat/favourites/users/${ben.user.id}`).expect(200);
    expect((await favourites(anna.agent)).users).toHaveLength(1);
  });

  it('favourites go with the account', async () => {
    t = chatApp();
    const anna = await registerUser(t, 'anna');
    const ben = await registerUser(t, 'ben');
    await anna.agent.put('/api/chat/favourites/rooms/general').expect(200);
    await anna.agent.put(`/api/chat/favourites/users/${ben.user.id}`).expect(200);
    await ben.agent.put(`/api/chat/favourites/users/${anna.user.id}`).expect(200);
    t.db.prepare('DELETE FROM users WHERE id = ?').run(anna.user.id);
    const count = (table) => t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    expect(count('chat_favourite_rooms')).toBe(0);
    expect(count('chat_favourite_users')).toBe(0);
  });
});
