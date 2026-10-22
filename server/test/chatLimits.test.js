// ============================================================
// File:        chatLimits.test.js
// Path:        server/test/chatLimits.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat WebSocket's connection limits (chat/socket.js, security check
//              2026-10-22) with their default values: a member's 6th open connection is closed
//              with TOO_MANY_CONNECTIONS while the 5 stay open, and so is a guest's 21st from
//              one address. The address behind our own proxies is the forwarded one.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { clientIp, TOO_MANY_CONNECTIONS } from '../src/chat/socket.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { registerUser } from './helpers/testApp.js';

let t;
let server;
let sockets = [];
afterEach(async () => {
  sockets.forEach((s) => s.ws.terminate());
  sockets = [];
  await stopServer(server);
  t?.close();
});

// Opens `count` sockets one after the other (each counted before the next arrives).
async function openMany(url, count, options) {
  const opened = [];
  for (let i = 0; i < count; i += 1) {
    const socket = connect(url, options);
    sockets.push(socket);
    await socket.opened;
    opened.push(socket);
  }
  return opened;
}

describe('chat connection limits', () => {
  it("a member's 6th connection is closed with its own code; the 5 stay open", async () => {
    ({ t, server } = await listeningChat());
    const url = `ws://127.0.0.1:${server.address().port}/ws/chat`;
    const { agent } = await registerUser(t, 'mia');
    const cookie = cookieOf(agent);
    const five = await openMany(url, 5, { cookie });
    const sixth = connect(url, { cookie });
    sockets.push(sixth);
    expect(await sixth.closed).toBe(TOO_MANY_CONNECTIONS);
    expect(five.every((s) => s.ws.readyState === WebSocket.OPEN)).toBe(true);
    // Another account is not affected.
    const { agent: other } = await registerUser(t, 'tom');
    const ok = connect(url, { cookie: cookieOf(other) });
    sockets.push(ok);
    await ok.opened;
  });

  it("a guest's 21st connection from one address is closed; a member's still opens", async () => {
    ({ t, server } = await listeningChat());
    const url = `ws://127.0.0.1:${server.address().port}/ws/chat`;
    const twenty = await openMany(url, 20);
    const extra = connect(url);
    sockets.push(extra);
    expect(await extra.closed).toBe(TOO_MANY_CONNECTIONS);
    expect(twenty.every((s) => s.ws.readyState === WebSocket.OPEN)).toBe(true);
    const { agent } = await registerUser(t, 'mia');
    const member = connect(url, { cookie: cookieOf(agent) });
    sockets.push(member);
    await member.opened;
  });

  it('counts the address our own proxies forwarded, not a client-made one', () => {
    const req = (forwarded) => ({
      headers: { 'x-forwarded-for': forwarded },
      socket: { remoteAddress: '10.0.0.2' },
    });
    expect(clientIp(req('6.6.6.6, 1.2.3.4'), 1)).toBe('1.2.3.4');
    expect(clientIp(req('1.2.3.4'), 0)).toBe('10.0.0.2');
  });
});
