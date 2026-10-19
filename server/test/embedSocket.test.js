// ============================================================
// File:        embedSocket.test.js
// Path:        server/test/embedSocket.test.js
// Project:     Seasonal Entertainment
// Description: The chat WebSocket for the embedded chat on an approved foreign site
//              (chat/socket.js): the token offered as the "se-embed.<token>" subprotocol, no
//              cookie. Such a socket subscribes to the member's rooms and gets room and direct
//              message pushes; an unknown token is refused at the upgrade; an embed logout and
//              the site's removal close the token's socket at once, but not the member's own
//              cookie socket.
// ============================================================

import { afterEach, expect, it } from 'vitest';
import { cookieOf, connect, listeningChat, stopServer } from './helpers/chatSocket.js';
import { post } from './helpers/chat.js';
import { SITE, approveSite, removeSite, requestToken, tokenAgent } from './helpers/embed.js';
import { registerUser } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
  await stopServer(server);
  t.close();
});

const embedProtocols = (token) => ['se-chat', `se-embed.${token}`];

async function setUp() {
  ({ t, server, url: t.url } = await listeningChat());
  await approveSite(t);
  const mia = await registerUser(t, 'mia');
  const { token } = (await requestToken(mia.agent, SITE)).body;
  return { mia, token };
}

it('subscribes with the token and gets room pushes; an unknown token is refused', async () => {
  const { token } = await setUp();
  const socket = connect(t.url, { protocols: embedProtocols(token) });
  await socket.opened;
  expect(socket.ws.protocol).toBe('se-chat');
  expect(await socket.subscribe('seasonal-race')).toEqual({
    type: 'subscribed',
    room: 'seasonal-race',
  });
  const zoe = await registerUser(t, 'zoe');
  await post(zoe.agent, 'seasonal-race', 'members only, live');
  const pushed = await socket.next('message');
  expect(pushed.message.body).toBe('members only, live');
  socket.ws.close();

  const unknown = connect(t.url, { protocols: embedProtocols('not-a-token') });
  await expect(unknown.opened).rejects.toThrow('HTTP 401');
});

it('an embed logout closes the token socket, not the member cookie socket', async () => {
  const { mia, token } = await setUp();
  const embedded = connect(t.url, { protocols: embedProtocols(token) });
  const own = connect(t.url, { cookie: cookieOf(mia.agent) });
  await Promise.all([embedded.opened, own.opened]);
  expect((await tokenAgent(t, token).post('/api/embed/logout')).status).toBe(200);
  expect(await embedded.closed).toBe(4001);
  expect(own.ws.readyState).toBe(own.ws.OPEN);
  own.ws.close();
});

it("the site's removal closes its token sockets at once", async () => {
  const { token } = await setUp();
  const embedded = connect(t.url, { protocols: embedProtocols(token) });
  await embedded.opened;
  await removeSite(t);
  expect(await embedded.closed).toBe(4001);
});
