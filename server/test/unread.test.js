// ============================================================
// File:        unread.test.js
// Path:        server/test/unread.test.js
// Project:     Seasonal Entertainment
// Description: Guards the room unread counters (/api/chat/unread, POST rooms/<slug>/read):
//              others' messages count until the room is read; one's own never count; hidden
//              messages never count; rooms the member cannot read never appear; messages from
//              before the account existed do not count; guests have no counters; and the
//              member's sockets hear "activity" and "read", so every tab recounts. Muted rooms
//              keep their own count, flagged muted, per account.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { logIn } from './helpers/accountKeys.js';
import { chatApp, post } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
  await stopServer(server);
  server = null;
  t?.close();
});

const roomCounts = async (agent) =>
  Object.fromEntries(
    (await agent.get('/api/chat/unread')).body.rooms.map((r) => [r.slug, r.count])
  );

describe('room counters', () => {
  it("counts others' messages until read; never one's own", async () => {
    t = chatApp();
    const anna = await registerUser(t, 'anna');
    const ben = await registerUser(t, 'ben');
    await post(ben.agent, 'general', 'one').expect(201);
    const last = (await post(ben.agent, 'general', 'two').expect(201)).body.message;
    await post(anna.agent, 'general', 'mine').expect(201);
    expect((await roomCounts(anna.agent)).general).toBe(2);
    expect((await roomCounts(ben.agent)).general).toBe(1);

    await anna.agent.post('/api/chat/rooms/general/read').send({ lastId: last.id }).expect(200);
    expect((await roomCounts(anna.agent)).general).toBe(0);
  });

  it('hidden messages never count; unreadable rooms never appear', async () => {
    t = chatApp();
    const anna = await registerUser(t, 'anna');
    const { agent: mod } = await makeStaff(t, 'mona', 'organiser');
    const sent = (await post(mod, 'general', 'to hide').expect(201)).body.message;
    await post(mod, 'organisers', 'staff only').expect(201);
    expect((await roomCounts(anna.agent)).general).toBe(1);
    await mod.post(`/api/chat/messages/${sent.id}/hide`).expect(200);
    const counts = await roomCounts(anna.agent);
    expect(counts.general).toBe(0);
    expect(counts).not.toHaveProperty('organisers');
    expect(
      (await anna.agent.post('/api/chat/rooms/organisers/read').send({ lastId: 1 })).status
    ).toBe(404);
  });

  it('messages from before the account existed do not count', async () => {
    t = chatApp();
    const ben = await registerUser(t, 'ben');
    await post(ben.agent, 'general', 'old').expect(201);
    t.db.prepare("UPDATE chat_messages SET created_at = '2000-01-01T00:00:00.000Z'").run();
    const anna = await registerUser(t, 'anna');
    expect((await roomCounts(anna.agent)).general).toBe(0);
    await post(ben.agent, 'general', 'new').expect(201);
    expect((await roomCounts(anna.agent)).general).toBe(1);
  });

  it('guests have no counters', async () => {
    t = chatApp();
    expect((await t.client().get('/api/chat/unread')).status).toBe(401);
    expect((await t.client().post('/api/chat/rooms/general/read').send({ lastId: 1 })).status).toBe(
      401
    );
  });
});

describe('live recounting', () => {
  it("a member's sockets hear activity in readable rooms and their own reads", async () => {
    let url;
    ({ t, server, url } = await listeningChat());
    const anna = await registerUser(t, 'anna');
    const ben = await registerUser(t, 'ben');
    const guest = t.client();
    await guest.get('/api/chat/rooms');
    const sockets = [anna.agent, anna.agent, guest].map((agent) =>
      connect(url, { cookie: cookieOf(agent) })
    );
    await Promise.all(sockets.map((s) => s.opened));

    const sent = (await post(ben.agent, 'general', 'hello').expect(201)).body.message;
    // Both of anna's tabs hear it without subscribing to the room.
    for (const s of sockets.slice(0, 2)) {
      expect(await s.next('activity')).toEqual({ type: 'activity', room: 'general' });
    }
    await anna.agent.post('/api/chat/rooms/general/read').send({ lastId: sent.id }).expect(200);
    for (const s of sockets.slice(0, 2)) expect(await s.next('read')).toEqual({ type: 'read' });
    // A guest has no counters and hears neither.
    expect(sockets[2].events).toEqual([]);
    for (const s of sockets) s.ws.close();
  });
});

describe('muted rooms', () => {
  it('stay counted per room, flagged muted, until unmuted; per account, not per device', async () => {
    t = chatApp();
    const anna = await registerUser(t, 'anna');
    const ben = await registerUser(t, 'ben');
    await post(ben.agent, 'general', 'one').expect(201);
    const general = async (agent) =>
      (await agent.get('/api/chat/unread')).body.rooms.find((r) => r.slug === 'general');
    expect(await general(anna.agent)).toEqual({ slug: 'general', count: 1, muted: false });

    await anna.agent.put('/api/chat/rooms/general/mute').expect(200);
    expect(await general(anna.agent)).toEqual({ slug: 'general', count: 1, muted: true });
    // The same account on another device sees it muted too; ben is not affected.
    const otherDevice = t.client();
    await logIn(otherDevice, 'anna', 'correct-horse-1');
    expect((await general(otherDevice)).muted).toBe(true);
    expect((await general(ben.agent)).muted).toBe(false);

    await anna.agent.delete('/api/chat/rooms/general/mute').expect(200);
    expect((await general(anna.agent)).muted).toBe(false);
    expect((await t.client().put('/api/chat/rooms/general/mute')).status).toBe(401);
    expect((await anna.agent.put('/api/chat/rooms/organisers/mute')).status).toBe(404);
  });
});
