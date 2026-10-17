// ============================================================
// File:        chat.test.js
// Path:        server/test/chat.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat API: room access for guests, members and staff; no links from
//              guests; unique guest names; per-sender rate limits (stricter for guests); hide,
//              mute, ban and lift (moderators only, audited); reports; retention; room editor.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { deleteExpiredChat } from '../src/chat/retention.js';
import { seedChatRooms } from '../src/chat/seed.js';
import { assignGuestName } from '../src/chat/store.js';
import { makeStaff, makeTestApp, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

function chatApp(overrides) {
  t = makeTestApp(overrides);
  seedChatRooms(t.db);
}

const post = (agent, room, body) => agent.post(`/api/chat/rooms/${room}/messages`).send({ body });
const bodies = async (agent, room) =>
  (await agent.get(`/api/chat/rooms/${room}/messages`)).body.messages.map((m) => m.body);
const auditActions = () =>
  t.db
    .prepare('SELECT action FROM audit_log ORDER BY id')
    .all()
    .map((r) => r.action);

describe('rooms and guests', () => {
  it('a guest writes in General only, under a guest name with a guest badge', async () => {
    chatApp();
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
    chatApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    expect((await post(member, 'seasonal-race', 'hi')).status).toBe(201);
    expect((await post(member, 'announcements', 'hi')).status).toBe(403);
    expect((await post(organiser, 'organisers', 'hi')).status).toBe(201);
    expect((await post(organiser, 'announcements', 'news')).status).toBe(201);
    expect(await bodies(t.client(), 'announcements')).toEqual(['news']);
  });

  it('refuses links from guests, accepts them from members', async () => {
    chatApp();
    const res = await post(t.client(), 'general', 'free tokens at scam-site.xyz');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('links_not_allowed');
    const { agent: member } = await registerUser(t, 'mia');
    expect((await post(member, 'general', 'see https://seasonaltokens.org/')).status).toBe(201);
  });

  it('refuses empty and too long messages', async () => {
    chatApp();
    expect((await post(t.client(), 'general', '   ')).status).toBe(400);
    expect((await post(t.client(), 'general', 'x'.repeat(501))).status).toBe(400);
  });
});

describe('guest names', () => {
  it('two guests never share a name, also when the random part collides', async () => {
    chatApp();
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
    chatApp();
    const guest = t.client();
    const a = (await post(guest, 'general', 'one')).body.message.author;
    const b = (await post(guest, 'general', 'two')).body.message.author;
    expect(a).toBe(b);
  });
});

describe('rate limits', () => {
  it('limits guests more strictly than members', async () => {
    const rate = { member: { windowMs: 60_000, max: 3 }, guest: { windowMs: 60_000, max: 2 } };
    chatApp({ chat: { retentionDays: 90, rate } });
    const guest = t.client();
    expect((await post(guest, 'general', '1')).status).toBe(201);
    expect((await post(guest, 'general', '2')).status).toBe(201);
    expect((await post(guest, 'general', '3')).status).toBe(429);
    const { agent: member } = await registerUser(t, 'mia');
    for (const n of ['1', '2', '3']) expect((await post(member, 'general', n)).status).toBe(201);
    expect((await post(member, 'general', '4')).status).toBe(429);
  });
});

describe('moderation', () => {
  it('a hidden message disappears for others; moderators still see it; audited', async () => {
    chatApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { message } = (await post(member, 'general', 'rude words')).body;
    expect((await organiser.post(`/api/chat/messages/${message.id}/hide`)).status).toBe(200);
    expect(await bodies(member, 'general')).toEqual([]);
    expect(await bodies(t.client(), 'general')).toEqual([]);
    const seen = (await organiser.get('/api/chat/rooms/general/messages')).body.messages;
    expect(seen[0]).toMatchObject({ body: 'rude words', hiddenBy: 'olga' });
    expect(auditActions()).toEqual(['chat.hide']);
  });

  it('non-moderators cannot moderate; organisers need 2FA', async () => {
    chatApp();
    const { agent: member, user } = await registerUser(t, 'mia');
    const { message } = (await post(member, 'general', 'hi')).body;
    for (const action of ['hide', 'ban']) {
      expect((await member.post(`/api/chat/messages/${message.id}/${action}`)).status).toBe(403);
      expect((await t.client().post(`/api/chat/messages/${message.id}/${action}`)).status).toBe(
        401
      );
    }
    expect((await member.get('/api/chat/reports')).status).toBe(403);
    setRole(t, user.id, 'organiser');
    const no2fa = await member.post(`/api/chat/messages/${message.id}/hide`);
    expect(no2fa.body.error).toBe('two_factor_required');
    expect(auditActions()).toEqual([]);
  });

  it('mutes a guest for a time and bans a member; lifting a mute lets them write again', async () => {
    chatApp();
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const guest = t.client();
    const guestMessage = (await post(guest, 'general', 'spam')).body.message;
    const mute = await organiser
      .post(`/api/chat/messages/${guestMessage.id}/mute`)
      .send({ minutes: 10 });
    expect(mute.status).toBe(200);
    const muted = await post(guest, 'general', 'more spam');
    expect(muted.status).toBe(403);
    expect(muted.body.error).toBe('muted');

    const { agent: member } = await registerUser(t, 'mia');
    const memberMessage = (await post(member, 'general', 'bad')).body.message;
    await organiser.post(`/api/chat/messages/${memberMessage.id}/ban`).send({});
    expect((await post(member, 'general', 'again')).body.error).toBe('banned');

    const { sanctions } = (await organiser.get('/api/chat/sanctions')).body;
    const guestMute = sanctions.find((s) => s.kind === 'mute');
    await organiser.post(`/api/chat/sanctions/${guestMute.id}/lift`);
    expect((await post(guest, 'general', 'sorry')).status).toBe(201);
    expect(auditActions()).toEqual(['chat.mute', 'chat.ban', 'chat.lift']);
  });

  it('refuses a mute length outside the list, and never mutes staff', async () => {
    chatApp();
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const staffMessage = (await post(admin, 'general', 'hi')).body.message;
    const bad = await organiser
      .post(`/api/chat/messages/${staffMessage.id}/mute`)
      .send({ minutes: 5 });
    expect(bad.status).toBe(400);
    const exempt = await organiser.post(`/api/chat/messages/${staffMessage.id}/ban`).send({});
    expect(exempt.status).toBe(409);
  });

  it('reports reach the moderators, once per reporter', async () => {
    chatApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { message } = (await post(member, 'general', 'suspicious')).body;
    const guest = t.client();
    await guest.post(`/api/chat/messages/${message.id}/report`);
    await guest.post(`/api/chat/messages/${message.id}/report`);
    await member.post(`/api/chat/messages/${message.id}/report`);
    const { messages } = (await organiser.get('/api/chat/reports')).body;
    expect(messages).toEqual([expect.objectContaining({ id: message.id, reports: 2 })]);
  });
});

describe('retention', () => {
  it('deletes messages older than the retention period and keeps newer ones', async () => {
    chatApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { message: old } = (await post(member, 'general', 'old')).body;
    await post(member, 'general', 'new');
    const longAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    t.db.prepare('UPDATE chat_messages SET created_at = ? WHERE id = ?').run(longAgo, old.id);
    expect(deleteExpiredChat(t.db, 90)).toBe(1);
    expect(await bodies(member, 'general')).toEqual(['new']);
  });
});

describe('room editor', () => {
  it('admins add and edit rooms (audited); others cannot', async () => {
    chatApp();
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const room = { slug: 'quiz', name: 'Quiz', readAccess: 'members', writeAccess: 'members' };
    expect((await organiser.post('/api/admin/chat/rooms').send(room)).status).toBe(403);
    const created = await admin.post('/api/admin/chat/rooms').send(room);
    expect(created.status).toBe(201);
    await admin
      .put(`/api/admin/chat/rooms/${created.body.room.id}`)
      .send({ ...room, readAccess: 'everyone' });
    expect(auditActions()).toEqual(['chat.room_create', 'chat.room_edit']);
    expect((await t.client().get('/api/chat/rooms')).body.rooms.map((r) => r.slug)).toContain(
      'quiz'
    );
  });
});
