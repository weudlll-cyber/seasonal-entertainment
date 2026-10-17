// ============================================================
// File:        chat.test.js
// Path:        server/test/chat.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat API for writers: room access for guests, members and staff;
//              no links from guests; unique guest names; per-sender rate limits (stricter for
//              guests). Moderation, retention and rooms: chatModeration.test.js.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { assignGuestName } from '../src/chat/store.js';
import { bodies, chatApp, post } from './helpers/chat.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('rooms and guests', () => {
  it('a guest writes in General only, under a guest name with a guest badge', async () => {
    t = chatApp();
    const guest = t.client();
    const sent = await post(guest, 'general', 'hello');
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({ body: 'hello', isGuest: true });
    expect(sent.body.message.author).toMatch(/^Guest-[0-9a-f]{4}$/);
    expect((await post(guest, 'announcements', 'hi')).status).toBe(403);
    expect((await post(guest, 'seasonal-race', 'hi')).status).toBe(404);
    expect((await post(guest, 'organisers', 'hi')).status).toBe(404);
    const rooms = (await guest.get('/api/chat/rooms')).body;
    expect(rooms.rooms.map((r) => [r.slug, r.canWrite])).toEqual([
      ['general', true],
      ['announcements', false],
    ]);
    expect(rooms.me.guestName).toBe(sent.body.message.author);
  });

  it('members also write in Seasonal Race; organisers in Organisers and Announcements', async () => {
    t = chatApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    expect((await post(member, 'seasonal-race', 'hi')).status).toBe(201);
    expect((await post(member, 'announcements', 'hi')).status).toBe(403);
    expect((await post(organiser, 'organisers', 'hi')).status).toBe(201);
    expect((await post(organiser, 'announcements', 'news')).status).toBe(201);
    expect(await bodies(t.client(), 'announcements')).toEqual(['news']);
  });

  it('refuses links from guests, accepts them from members', async () => {
    t = chatApp();
    const res = await post(t.client(), 'general', 'free tokens at scam-site.xyz');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('links_not_allowed');
    const { agent: member } = await registerUser(t, 'mia');
    expect((await post(member, 'general', 'see https://seasonaltokens.org/')).status).toBe(201);
  });

  it('refuses empty and too long messages', async () => {
    t = chatApp();
    expect((await post(t.client(), 'general', '   ')).status).toBe(400);
    expect((await post(t.client(), 'general', 'x'.repeat(501))).status).toBe(400);
  });
});

describe('guest names', () => {
  it('two guests never share a name, also when the random part collides', async () => {
    t = chatApp();
    const names = new Set();
    for (let i = 0; i < 20; i++) {
      names.add((await post(t.client(), 'general', `hi ${i}`)).body.message.author);
    }
    expect(names.size).toBe(20);
    const draws = ['aaaa', 'aaaa', 'bbbb'];
    const first = assignGuestName(t.db, () => draws.shift());
    const second = assignGuestName(t.db, () => draws.shift());
    expect([first.name, second.name]).toEqual(['Guest-aaaa', 'Guest-bbbb']);
  });

  it('a guest keeps the same name for the session', async () => {
    t = chatApp();
    const guest = t.client();
    const a = (await post(guest, 'general', 'one')).body.message.author;
    const b = (await post(guest, 'general', 'two')).body.message.author;
    expect(a).toBe(b);
  });
});

describe('rate limits', () => {
  it('limits guests more strictly than members', async () => {
    const rate = { member: { windowMs: 60_000, max: 3 }, guest: { windowMs: 60_000, max: 2 } };
    t = chatApp({ chat: { retentionDays: 90, rate } });
    const guest = t.client();
    expect((await post(guest, 'general', '1')).status).toBe(201);
    expect((await post(guest, 'general', '2')).status).toBe(201);
    expect((await post(guest, 'general', '3')).status).toBe(429);
    const { agent: member } = await registerUser(t, 'mia');
    for (const n of ['1', '2', '3']) expect((await post(member, 'general', n)).status).toBe(201);
    expect((await post(member, 'general', '4')).status).toBe(429);
  });
});
