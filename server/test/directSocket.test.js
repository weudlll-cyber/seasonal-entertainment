// ============================================================
// File:        directSocket.test.js
// Path:        server/test/directSocket.test.js
// Project:     Seasonal Entertainment
// Description: Guards the live push of direct messages on a real listening server: both
//              members' open sockets get the new message (still only ciphertext), no other
//              member's socket gets anything, and no subscription is needed.
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { sendDirect } from './helpers/direct.js';
import { memberWithKey } from './helpers/keys.js';

let t;
let server;
afterEach(async () => {
  await stopServer(server);
  t?.close();
});

it('pushes a new direct message to both members and nobody else', async () => {
  let url;
  ({ t, server, url } = await listeningChat());
  const anna = await memberWithKey(t, 'anna');
  const ben = await memberWithKey(t, 'ben');
  const carol = await memberWithKey(t, 'carol');
  const sockets = [anna, ben, carol].map((m) => connect(url, { cookie: cookieOf(m.agent) }));
  await Promise.all(sockets.map((s) => s.opened));

  const { body } = await sendDirect(anna, ben.user, { text: 'secret-canary-live' });
  const [toAnna, toBen] = await Promise.all([sockets[0].next('direct'), sockets[1].next('direct')]);
  expect(toAnna.message).toEqual(body.message);
  expect(toBen.message).toEqual(body.message);
  expect(JSON.stringify(toBen)).not.toContain('secret-canary-live');
  // Carol's socket, open all along, received nothing at all.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(sockets[2].events).toEqual([]);
  for (const s of sockets) s.ws.close();
});
