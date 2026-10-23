// ============================================================
// File:        settingsChat.test.js
// Path:        server/test/settingsChat.test.js
// Project:     Seasonal Entertainment
// Description: The "Chat" site settings take effect (settings/groups/chat.js): uploads in rooms
//              and files in direct messages switched off are refused; the largest file, the
//              daily quota and the largest image follow their settings; link previews in rooms
//              and in direct messages switched off fetch nothing; the open connections per
//              member and per guest address, the messages per member and per guest and the days
//              messages are kept follow theirs. Each changed at runtime, without a restart.
// ============================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOO_MANY_CONNECTIONS } from '../src/chat/socket.js';
import { runChatRetention } from '../src/chat/retention.js';
import { setSetting } from '../src/settings/store.js';
import { bodies, chatApp, post } from './helpers/chat.js';
import { connect, cookieOf, listeningChat, stopServer } from './helpers/chatSocket.js';
import { memberWithKey } from './helpers/keys.js';
import { largePng } from './helpers/media.js';
import { PUBLIC_IP, html, previewInternet } from './helpers/previewNet.js';
import { registerUser } from './helpers/testApp.js';
import { PDF, upload } from './helpers/uploads.js';

let t;
let server;
let internet;
let sockets = [];
afterEach(async () => {
  sockets.forEach((s) => s.ws.terminate());
  sockets = [];
  await stopServer(server);
  server = undefined;
  await internet?.close();
  internet = undefined;
  t?.close();
});

const MIB = 1024 * 1024;
// A PDF of about `mb` megabytes: the real type, padded.
const pdfOf = (mb) => Buffer.concat([PDF, Buffer.alloc(Math.round(mb * MIB))]);

async function member() {
  t = chatApp();
  return (await registerUser(t, 'mia')).agent;
}

describe('uploads', () => {
  it('"File uploads in rooms" off refuses an upload; on again, it works', async () => {
    const mia = await member();
    setSetting(t.db, 'chat.uploads', false);
    const refused = await upload(mia, PDF, 'a.pdf');
    expect([refused.status, refused.body.error]).toEqual([403, 'uploads_off']);
    expect(refused.body.message).toBe('File uploads are switched off at the moment.');
    setSetting(t.db, 'chat.uploads', true);
    expect((await upload(mia, PDF, 'a.pdf')).status).toBe(201);
  });

  it('"Largest file" decides what one upload may weigh', async () => {
    const mia = await member();
    expect((await upload(mia, pdfOf(1.5), 'a.pdf')).status).toBe(201); // default 10 MB
    setSetting(t.db, 'chat.uploadMaxMb', 1);
    expect((await upload(mia, pdfOf(1.5), 'b.pdf')).status).toBe(413);
    expect((await upload(mia, pdfOf(0.5), 'c.pdf')).status).toBe(201);
  });

  it('"Uploads per member per day" is the daily quota', async () => {
    const mia = await member();
    setSetting(t.db, 'chat.uploadDailyMb', 1);
    expect((await upload(mia, pdfOf(0.6), 'a.pdf')).status).toBe(201);
    const second = await upload(mia, pdfOf(0.6), 'b.pdf');
    expect([second.status, second.body.message]).toEqual([
      429,
      'Upload limit reached: 1 MB per 24 hours.',
    ]);
  });

  it('"Largest image" is the pixel limit, read from the header', { timeout: 60_000 }, async () => {
    const mia = await member();
    const thirteen = await largePng(4000, 3250); // 13 megapixels, a few KB
    expect((await upload(mia, thirteen, 'a.png')).status).toBe(201); // default 50
    setSetting(t.db, 'chat.imageMaxMegapixels', 12);
    const refused = await upload(mia, thirteen, 'b.png');
    expect([refused.status, refused.body.message]).toEqual([
      400,
      'The image may have at most 12 megapixels (width x height).',
    ]);
  });

  it('"Files in direct messages" off refuses the encrypted upload', async () => {
    t = chatApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const send = () =>
      anna.agent
        .post(`/api/chat/direct/${ben.user.id}/files`)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.alloc(64, 1));
    setSetting(t.db, 'chat.directFiles', false);
    const refused = await send();
    expect([refused.status, refused.body.error]).toEqual([403, 'files_off']);
    setSetting(t.db, 'chat.directFiles', true);
    expect((await send()).status).toBe(201);
  });
});

describe('link previews', () => {
  const PAGE = '<html><head><meta property="og:title" content="A card"></head></html>';
  async function online() {
    internet = await previewInternet(
      { 'site.test/one': html(PAGE), 'site.test/two': html(PAGE) },
      { 'site.test': [PUBLIC_IP] }
    );
    t = chatApp(undefined, { previewNetwork: internet.network });
    return (await registerUser(t, 'mia')).agent;
  }

  it('"Link previews in rooms" off fetches nothing', async () => {
    const mia = await online();
    setSetting(t.db, 'chat.roomPreviews', false);
    await post(mia, 'general', 'https://site.test/one');
    setSetting(t.db, 'chat.roomPreviews', true);
    await post(mia, 'general', 'https://site.test/two');
    // The second link's card arrives; the first link was never fetched.
    await vi.waitFor(() => expect(internet.hits('site.test/two')).toBe(1), { timeout: 5000 });
    expect(internet.hits('site.test/one')).toBe(0);
  });

  it('"Link previews in direct messages" off refuses the sender\'s preview', async () => {
    const mia = await online();
    setSetting(t.db, 'chat.directPreviews', false);
    const ask = () => mia.post('/api/chat/direct/preview').send({ url: 'https://site.test/one' });
    expect((await ask()).body.error).toBe('previews_off');
    setSetting(t.db, 'chat.directPreviews', true);
    expect((await ask()).body.preview).toMatchObject({ title: 'A card' });
  });
});

describe('connections and messages', () => {
  async function socketUrl() {
    ({ t, server } = await listeningChat());
    return `ws://127.0.0.1:${server.address().port}/ws/chat`;
  }
  const open = async (url, options) => {
    const socket = connect(url, options);
    sockets.push(socket);
    await socket.opened;
    return socket;
  };

  it('"Open connections per member" is the per-account limit', async () => {
    const url = await socketUrl();
    const cookie = cookieOf((await registerUser(t, 'mia')).agent);
    setSetting(t.db, 'chat.maxConnectionsPerMember', 1);
    await open(url, { cookie });
    const second = connect(url, { cookie });
    sockets.push(second);
    expect(await second.closed).toBe(TOO_MANY_CONNECTIONS);
  });

  it('"Open connections per guest address" is the per-address limit', async () => {
    const url = await socketUrl();
    setSetting(t.db, 'chat.maxGuestConnectionsPerIp', 2);
    await open(url);
    await open(url);
    const third = connect(url);
    sockets.push(third);
    expect(await third.closed).toBe(TOO_MANY_CONNECTIONS);
  });

  it('"Messages per member" and "Messages per guest" are the sending limits', async () => {
    const mia = await member();
    setSetting(t.db, 'chat.memberMessages', 1);
    expect((await post(mia, 'general', 'one')).status).toBe(201);
    expect((await post(mia, 'general', 'two')).status).toBe(429);
    setSetting(t.db, 'chat.guestMessages', 1);
    const guest = t.client();
    expect((await post(guest, 'general', 'hello')).status).toBe(201);
    expect((await post(guest, 'general', 'again')).status).toBe(429);
  });

  it('"Keep messages" is how long the retention job keeps them', async () => {
    const mia = await member();
    const { message } = (await post(mia, 'general', 'eight days old')).body;
    await post(mia, 'general', 'new');
    const eightDays = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    t.db.prepare('UPDATE chat_messages SET created_at = ? WHERE id = ?').run(eightDays, message.id);
    expect(runChatRetention(t.db, t.config).messages).toBe(0); // default 90 days
    setSetting(t.db, 'chat.retentionDays', 7);
    expect(runChatRetention(t.db, t.config).messages).toBe(1);
    expect(await bodies(mia, 'general')).toEqual(['new']);
  });
});
