// ============================================================
// File:        chatMedia.test.js
// Path:        server/test/chatMedia.test.js
// Project:     Seasonal Entertainment
// Description: Guards sticker and GIF messages: members only (HTTP and WebSocket), only an
//              active library item of that kind by id (never a URL), a later deactivated or
//              deleted item shows as removed, and media counts towards the rate limit.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { deleteItem, updateItem, updatePack } from '../src/media/store.js';
import { chatApp } from './helpers/chat.js';
import { connect, listeningChat, stopServer } from './helpers/chatSocket.js';
import { addLibraryItem } from './helpers/media.js';
import { registerUser } from './helpers/testApp.js';

let t;
let server;
afterEach(async () => {
  await stopServer(server);
  server = undefined;
  t?.close();
});

const send = (agent, body) => agent.post('/api/chat/rooms/general/messages').send(body);
const messages = async (agent) =>
  (await agent.get('/api/chat/rooms/general/messages')).body.messages;

describe('sending stickers and GIFs', () => {
  it('a member sends a sticker and a GIF; the message carries the library image', async () => {
    t = chatApp();
    const { item: sticker } = await addLibraryItem(t, 'sticker');
    const { item: gif } = await addLibraryItem(t, 'gif');
    const { agent } = await registerUser(t, 'mia');
    const sent = await send(agent, { kind: 'sticker', itemId: sticker.id });
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({
      kind: 'sticker',
      body: '',
      media: {
        url: `/media/${sticker.file}`,
        alt: 'sticker one picture',
      },
    });
    expect((await send(agent, { kind: 'gif', itemId: gif.id })).status).toBe(201);
    expect((await messages(t.client())).map((m) => m.kind)).toEqual(['sticker', 'gif']);
  });

  it('a guest cannot send them', async () => {
    t = chatApp();
    const { item } = await addLibraryItem(t, 'sticker');
    const res = await send(t.client(), { kind: 'sticker', itemId: item.id });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('members_only');
    expect((await t.client().get('/api/chat/media')).status).toBe(401);
  });

  it('refuses unknown, inactive, wrong-kind items and anything given as a URL', async () => {
    t = chatApp();
    const { item, pack } = await addLibraryItem(t, 'sticker');
    const { agent } = await registerUser(t, 'mia');
    const refused = async (body) => expect((await send(agent, body)).status).toBe(400);
    await refused({ kind: 'sticker', itemId: 999999 });
    await refused({ kind: 'gif', itemId: item.id });
    await refused({ kind: 'gif', url: 'https://evil.example/x.gif' });
    await refused({ kind: 'sticker', itemId: 'https://evil.example/x.webp' });
    await refused({ kind: 'image', itemId: item.id });
    updateItem(t.db, item.id, { name: 'x', alt: 'x', active: false });
    await refused({ kind: 'sticker', itemId: item.id });
    updateItem(t.db, item.id, { name: 'x', alt: 'x', active: true });
    updatePack(t.db, pack.id, { name: 'p', active: false });
    await refused({ kind: 'sticker', itemId: item.id });
    expect(await messages(agent)).toEqual([]);
  });

  it('old messages show "media removed" once the item is deactivated or deleted', async () => {
    t = chatApp();
    const { item: a } = await addLibraryItem(t, 'sticker', 'a');
    const { item: b } = await addLibraryItem(t, 'sticker', 'b');
    const { agent } = await registerUser(t, 'mia');
    await send(agent, { kind: 'sticker', itemId: a.id });
    await send(agent, { kind: 'sticker', itemId: b.id });
    updateItem(t.db, a.id, { name: 'a', alt: 'a', active: false });
    deleteItem(t.db, b.id);
    expect((await messages(agent)).map((m) => [m.kind, m.media])).toEqual([
      ['sticker', null],
      ['sticker', null],
    ]);
  });

  it('stickers and GIFs count towards the rate limit', async () => {
    const rate = { member: { windowMs: 60_000, max: 2 }, guest: { windowMs: 60_000, max: 2 } };
    t = chatApp({ chat: { retentionDays: 90, rate } });
    const { item: sticker } = await addLibraryItem(t, 'sticker');
    const { item: gif } = await addLibraryItem(t, 'gif');
    const { agent } = await registerUser(t, 'mia');
    expect((await send(agent, { kind: 'sticker', itemId: sticker.id })).status).toBe(201);
    expect((await send(agent, { kind: 'gif', itemId: gif.id })).status).toBe(201);
    expect((await send(agent, { body: 'text' })).status).toBe(429);
  });

  it('the picker list holds active packs and items only, in order', async () => {
    t = chatApp();
    const { item: hidden } = await addLibraryItem(t, 'sticker', 'hidden');
    await addLibraryItem(t, 'gif', 'shown');
    updateItem(t.db, hidden.id, { name: 'h', alt: 'h', active: false });
    const { agent } = await registerUser(t, 'mia');
    const { packs } = (await agent.get('/api/chat/media')).body;
    expect(packs.map((p) => [p.kind, p.items.map((i) => i.name)])).toEqual([['gif', ['shown']]]);
  });
});

describe('over the WebSocket', () => {
  it('nothing can be sent over the socket, sticker or not', async () => {
    let url;
    ({ t, server, url } = await listeningChat());
    const { item } = await addLibraryItem(t, 'sticker');
    const guest = connect(url);
    await guest.opened;
    await guest.subscribe('general');
    guest.ws.send(
      JSON.stringify({ type: 'message', room: 'general', kind: 'sticker', itemId: item.id })
    );
    guest.ws.send(JSON.stringify({ kind: 'sticker', itemId: item.id, body: 'x' }));
    // A later real message proves the socket processed the earlier frames first.
    await t.client().post('/api/chat/rooms/general/messages').send({ body: 'after' });
    await guest.next('message');
    expect((await messages(t.client())).map((m) => m.body)).toEqual(['after']);
    guest.ws.close();
  });
});
