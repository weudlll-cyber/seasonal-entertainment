// ============================================================
// File:        chatSocket.test.js
// Path:        server/test/chatSocket.test.js
// Project:     Seasonal Entertainment
// Description: Guards the live chat WebSocket on a real listening server: a foreign Origin
//              (other host or other scheme) is refused, a subscriber receives new messages and
//              hidden-message notices, and nobody can subscribe to a room they may not read.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { connect, listeningChat, stopServer } from './helpers/chatSocket.js';
import { makeStaff } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
  await stopServer(server);
  t?.close();
});

async function listening(overrides) {
  const started = await listeningChat(overrides);
  ({ t, server } = started);
  return started.url;
}

describe('chat WebSocket', () => {
  it('refuses a foreign Origin', async () => {
    const url = await listening();
    const { opened, ws } = connect(url, { origin: 'https://evil.example' });
    await expect(opened).rejects.toThrow(/403/);
    ws.terminate();
  });

  // Without PUBLIC_ORIGIN the same rule as the CSRF guard: scheme and host must both match.
  it('without PUBLIC_ORIGIN, refuses the right host with the wrong scheme', async () => {
    const url = await listening({ publicOrigin: null });
    const host = new URL(url).host;
    const wrongScheme = connect(url, { origin: `https://${host}` });
    await expect(wrongScheme.opened).rejects.toThrow(/403/);
    wrongScheme.ws.terminate();
    const same = connect(url, { origin: `http://${host}` });
    await same.opened;
    same.ws.close();
  });

  it('pushes new messages to subscribers of the room', async () => {
    const url = await listening();
    const reader = connect(url);
    await reader.opened;
    await reader.subscribe('general');
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
    expect(await guest.subscribe('seasonal-race')).toEqual({ type: 'error', error: 'not_allowed' });
    guest.ws.close();
  });

  it('tells readers when a message is hidden', async () => {
    const url = await listening();
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const reader = connect(url);
    await reader.opened;
    await reader.subscribe('general');
    const { message } = (
      await t.client().post('/api/chat/rooms/general/messages').send({ body: 'x' })
    ).body;
    await organiser.post(`/api/chat/messages/${message.id}/hide`);
    // Every pushed event names its room: one page connection serves panels of several rooms.
    expect(await reader.next('hidden')).toEqual({
      type: 'hidden',
      id: message.id,
      room: 'general',
    });
    reader.ws.close();
  });
});
