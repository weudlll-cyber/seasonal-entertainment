// ============================================================
// File:        chatSocket.test.js
// Path:        server/test/chatSocket.test.js
// Project:     Seasonal Entertainment
// Description: Guards the live chat WebSocket on a real listening server: a foreign Origin is
//              refused, a subscriber receives new messages and hidden-message notices, and
//              nobody can subscribe to a room they may not read.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CHAT_SOCKET_PATH, attachChatSocket } from '../src/chat/hub.js';
import { seedChatRooms } from '../src/chat/seed.js';
import { ORIGIN, makeStaff, makeTestApp } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  t?.close();
});

async function listening() {
  t = makeTestApp();
  seedChatRooms(t.db);
  server = t.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  attachChatSocket(server, { app: t.app, db: t.db, config: t.config });
  return `ws://127.0.0.1:${server.address().port}${CHAT_SOCKET_PATH}`;
}

// Opens a socket and collects every event it receives.
function connect(url, { origin = ORIGIN, cookie } = {}) {
  const ws = new WebSocket(url, { headers: { Origin: origin, ...(cookie && { Cookie: cookie }) } });
  const events = [];
  ws.on('message', (data) => events.push(JSON.parse(String(data))));
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
  const next = (type) =>
    new Promise((resolve) => {
      const check = () => {
        const found = events.find((e) => e.type === type);
        return found ? resolve(found) : setTimeout(check, 10);
      };
      check();
    });
  return { ws, opened, next };
}

describe('chat WebSocket', () => {
  it('refuses a foreign Origin', async () => {
    const url = await listening();
    const { opened, ws } = connect(url, { origin: 'https://evil.example' });
    await expect(opened).rejects.toThrow(/403/);
    ws.terminate();
  });

  it('pushes new messages to subscribers of the room', async () => {
    const url = await listening();
    const reader = connect(url);
    await reader.opened;
    reader.ws.send(JSON.stringify({ type: 'subscribe', room: 'general' }));
    await reader.next('subscribed');
    await t.client().post('/api/chat/rooms/general/messages').send({ body: 'live!' });
    const event = await reader.next('message');
    expect(event.message).toMatchObject({ body: 'live!', room: 'general', isGuest: true });
    expect(event.message).not.toHaveProperty('authorGuest');
    reader.ws.close();
  });

  it('a guest cannot subscribe to a members-only room', async () => {
    const url = await listening();
    const guest = connect(url);
    await guest.opened;
    guest.ws.send(JSON.stringify({ type: 'subscribe', room: 'seasonal-race' }));
    expect(await guest.next('error')).toEqual({ type: 'error', error: 'not_allowed' });
    guest.ws.close();
  });

  it('tells readers when a message is hidden', async () => {
    const url = await listening();
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const reader = connect(url);
    await reader.opened;
    reader.ws.send(JSON.stringify({ type: 'subscribe', room: 'general' }));
    await reader.next('subscribed');
    const { message } = (
      await t.client().post('/api/chat/rooms/general/messages').send({ body: 'x' })
    ).body;
    await organiser.post(`/api/chat/messages/${message.id}/hide`);
    expect(await reader.next('hidden')).toEqual({ type: 'hidden', id: message.id });
    reader.ws.close();
  });
});
