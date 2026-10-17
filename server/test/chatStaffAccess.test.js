// ============================================================
// File:        chatStaffAccess.test.js
// Path:        server/test/chatStaffAccess.test.js
// Project:     Seasonal Entertainment
// Description: Guards staff rights in the chat over HTTP and WebSocket: an organiser without
//              the required 2FA counts as a member (no Organisers room, no Announcements, no
//              hidden messages), and an open socket loses its rights as soon as the account
//              does (demoted, locked, password reset, logged out), checked on every push.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { bodies, post } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { makeStaff, registerUser, setRole } from './helpers/testApp.js';

let t;
let server;
let url;
afterEach(async () => {
  await stopServer(server);
  t?.close();
});

async function start() {
  ({ t, server, url } = await listeningChat());
}

// A socket of this agent's session, subscribed to the room.
async function socketIn(agent, room) {
  const socket = connect(url, { cookie: cookieOf(agent) });
  await socket.opened;
  expect(await socket.subscribe(room)).toEqual({ type: 'subscribed', room });
  return socket;
}

describe('an organiser without 2FA counts as a member in the chat', () => {
  it('over HTTP: no Organisers room, no Announcements, no hidden messages, no moderator', async () => {
    await start();
    const { agent: staff } = await makeStaff(t, 'olga', 'organiser');
    const { agent: owen, user } = await registerUser(t, 'owen');
    setRole(t, user.id, 'organiser'); // no 2FA

    const rooms = (await owen.get('/api/chat/rooms')).body;
    expect(rooms.rooms.map((r) => r.slug)).not.toContain('organisers');
    expect(rooms.rooms.find((r) => r.slug === 'announcements').canWrite).toBe(false);
    expect(rooms.me.moderator).toBe(false);
    expect((await owen.get('/api/chat/rooms/organisers/messages')).status).toBe(404);
    expect((await post(owen, 'organisers', 'hi')).status).toBe(404);
    expect((await post(owen, 'announcements', 'hi')).status).toBe(403);

    const { message } = (await post(t.client(), 'general', 'to hide')).body;
    await staff.post(`/api/chat/messages/${message.id}/hide`);
    expect(await bodies(staff, 'general')).toContain('to hide');
    expect(await bodies(owen, 'general')).not.toContain('to hide');
  });

  it('over WebSocket: cannot subscribe to Organisers', async () => {
    await start();
    const { agent: owen, user } = await registerUser(t, 'owen');
    setRole(t, user.id, 'organiser');
    const socket = connect(url, { cookie: cookieOf(owen) });
    await socket.opened;
    expect(await socket.subscribe('organisers')).toEqual({ type: 'error', error: 'not_allowed' });
    socket.ws.close();
  });
});

describe('an open socket follows the account', () => {
  // Olga is subscribed to Organisers; the admin then changes her account through `change`.
  async function afterChange(change) {
    await start();
    const { agent: admin } = await makeStaff(t, 'adam', 'admin');
    const { agent: olga, user } = await makeStaff(t, 'olga', 'organiser');
    const socket = await socketIn(olga, 'organisers');
    await change({ admin, olga, id: user.id });
    return { admin, socket };
  }

  it('demoted: the socket is closed', async () => {
    const { socket } = await afterChange(({ admin, id }) =>
      admin.post(`/api/admin/users/${id}/role`).send({ role: 'member' })
    );
    await socket.closed;
  });

  it('locked: the socket is closed', async () => {
    const { socket } = await afterChange(({ admin, id }) =>
      admin.post(`/api/admin/users/${id}/lock`).send({ locked: true })
    );
    await socket.closed;
  });

  it('password reset by an admin: the socket is closed', async () => {
    const { socket } = await afterChange(({ admin, id }) =>
      admin.post(`/api/admin/users/${id}/password`).send({ newPassword: 'another-horse-2' })
    );
    await socket.closed;
  });

  it('logged out: the socket of that session is closed', async () => {
    const { socket } = await afterChange(({ olga }) => olga.post('/api/auth/logout'));
    await socket.closed;
  });

  // Even without any close: every push checks the account as it is now.
  it('role changed behind its back: no further Organisers messages arrive', async () => {
    const { admin, socket } = await afterChange(({ id }) => setRole(t, id, 'member'));
    const witness = await socketIn(admin, 'organisers');
    await post(admin, 'organisers', 'staff only');
    await witness.next('message');
    expect(socket.events.filter((e) => e.type === 'message')).toEqual([]);
    witness.ws.close();
    socket.ws.close();
  });
});
