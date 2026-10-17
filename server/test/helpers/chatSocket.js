// ============================================================
// File:        chatSocket.js
// Path:        server/test/helpers/chatSocket.js
// Project:     Seasonal Entertainment
// Description: Chat WebSocket test helpers: a real listening server with the seeded rooms and
//              the socket attached, and a client socket that collects every pushed event.
// ============================================================

import { WebSocket } from 'ws';
import { attachChatSocket, CHAT_SOCKET_PATH } from '../../src/chat/socket.js';
import { chatApp } from './chat.js';
import { ORIGIN } from './testApp.js';

// Returns the test app, its server (close it after the test) and the socket URL.
export async function listeningChat(overrides) {
  const t = chatApp(overrides);
  const server = t.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  attachChatSocket(server, { app: t.app, db: t.db, config: t.config });
  return { t, server, url: `ws://127.0.0.1:${server.address().port}${CHAT_SOCKET_PATH}` };
}

export const stopServer = (server) =>
  new Promise((resolve) => (server ? server.close(resolve) : resolve()));

// The session cookie of a supertest agent, for opening a socket as that account.
export const cookieOf = (agent) =>
  agent.jar
    .getCookies({ domain: '127.0.0.1', path: '/', secure: false, script: false })
    .map((c) => c.toValueString())
    .join('; ');

// Opens a socket and collects every event it receives; closed resolves on close.
export function connect(url, { origin = ORIGIN, cookie } = {}) {
  const ws = new WebSocket(url, { headers: { Origin: origin, ...(cookie && { Cookie: cookie }) } });
  const events = [];
  ws.on('message', (data) => events.push(JSON.parse(String(data))));
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
  const closed = new Promise((resolve) => ws.once('close', resolve));
  const next = (type) =>
    new Promise((resolve) => {
      const check = () => {
        const found = events.find((e) => e.type === type);
        return found ? resolve(found) : setTimeout(check, 10);
      };
      check();
    });
  const subscribe = async (room) => {
    ws.send(JSON.stringify({ type: 'subscribe', room }));
    return Promise.race([next('subscribed'), next('error')]);
  };
  return { ws, events, opened, closed, next, subscribe };
}
