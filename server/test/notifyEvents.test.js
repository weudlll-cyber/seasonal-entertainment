// ============================================================
// File:        notifyEvents.test.js
// Path:        server/test/notifyEvents.test.js
// Project:     Seasonal Entertainment
// Description: Guards what the server tells a member's pages for browser notifications
//              (docs/CHAT.md, "Notifications"): a mention in a room they can read reaches only
//              the mentioned member, with the author, the room and at most the first 80
//              characters; none for a room they cannot read; a new direct message carries the
//              sender's name and no text; the two switches are off by default and stored.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { sendDirect } from './helpers/direct.js';
import { memberWithKey } from './helpers/keys.js';
import { makeStaff } from './helpers/testApp.js';

let t;
let server;
let sockets = [];
afterEach(async () => {
  sockets.forEach((s) => s.ws.terminate());
  sockets = [];
  await stopServer(server);
  t?.close();
});

async function members() {
  ({ t, server } = await listeningChat());
  const url = `ws://127.0.0.1:${server.address().port}/ws/chat`;
  const mia = await memberWithKey(t, 'mia');
  const bob = await memberWithKey(t, 'bob');
  const tom = await memberWithKey(t, 'tom');
  const live = async (who) => {
    const socket = connect(url, { cookie: cookieOf(who.agent) });
    sockets.push(socket);
    await socket.opened;
    return socket;
  };
  return { mia, bob, tom, miaSocket: await live(mia), bobSocket: await live(bob) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe('events for browser notifications', () => {
  it('a mention reaches only the mentioned member: author, room, the first 80 characters', async () => {
    const m = await members();
    const body = `@mia ${'x'.repeat(100)}`;
    await m.tom.agent.post('/api/chat/rooms/general/messages').send({ body });
    const event = await m.miaSocket.next('mention');
    expect(event).toMatchObject({ author: 'tom', room: 'general', roomName: 'General' });
    expect(event.text).toBe(body.slice(0, 80));
    await settle();
    expect(m.bobSocket.events.some((e) => e.type === 'mention')).toBe(false);
  });

  it('no mention event from a room the member cannot read', async () => {
    const m = await members();
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    await olga.post('/api/chat/rooms/organisers/messages').send({ body: '@mia secret plans' });
    await settle();
    expect(m.miaSocket.events.some((e) => e.type === 'mention')).toBe(false);
  });

  it("a direct message's event names the sender and carries no text", async () => {
    const m = await members();
    await sendDirect(m.tom, m.mia.user, { text: 'secret-canary-text' });
    const event = await m.miaSocket.next('direct');
    expect(event.senderName).toBe('tom');
    expect(JSON.stringify(event)).not.toContain('secret-canary-text');
  });

  it('the two switches are off by default and stored', async () => {
    const m = await members();
    const session = async () => (await m.mia.agent.get('/api/auth/session')).body.user;
    expect(await session()).toMatchObject({ notifyMentions: false, notifyDirect: false });
    const res = await m.mia.agent.put('/api/auth/notifications').send({ notifyMentions: true });
    expect(res.status).toBe(200);
    expect(await session()).toMatchObject({ notifyMentions: true, notifyDirect: false });
    expect((await m.mia.agent.put('/api/auth/notifications').send({})).status).toBe(400);
  });
});
