// ============================================================
// File:        chatModeration.test.js
// Path:        server/test/chatModeration.test.js
// Project:     Seasonal Entertainment
// Description: Guards chat moderation and upkeep: hide, mute, ban and lift (moderators only,
//              with 2FA, audited; staff exempt), reports and the retention job. Rooms:
//              chatRooms.test.js.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { deleteExpiredChat } from '../src/chat/retention.js';
import { auditActions, bodies, chatApp, post } from './helpers/chat.js';
import { makeStaff, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('moderation', () => {
  it('a hidden message disappears for others; moderators still see it; audited', async () => {
    t = chatApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { message } = (await post(member, 'general', 'rude words')).body;
    expect((await organiser.post(`/api/chat/messages/${message.id}/hide`)).status).toBe(200);
    expect(await bodies(member, 'general')).toEqual([]);
    expect(await bodies(t.client(), 'general')).toEqual([]);
    const seen = (await organiser.get('/api/chat/rooms/general/messages')).body.messages;
    expect(seen[0]).toMatchObject({ body: 'rude words', hiddenBy: 'olga' });
    expect(auditActions(t)).toEqual(['chat.hide']);
  });

  it('non-moderators cannot moderate; organisers need 2FA', async () => {
    t = chatApp();
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
    expect(auditActions(t)).toEqual([]);
  });

  it('mutes a guest for a time and bans a member; lifting a mute lets them write again', async () => {
    t = chatApp();
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
    expect(auditActions(t)).toEqual(['chat.mute', 'chat.ban', 'chat.lift']);
  });

  it('refuses a mute length outside the list, and never mutes staff', async () => {
    t = chatApp();
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
    t = chatApp();
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
    t = chatApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { message: old } = (await post(member, 'general', 'old')).body;
    await post(member, 'general', 'new');
    const longAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    t.db.prepare('UPDATE chat_messages SET created_at = ? WHERE id = ?').run(longAgo, old.id);
    expect(deleteExpiredChat(t.db, 90)).toBe(1);
    expect(await bodies(member, 'general')).toEqual(['new']);
  });
});
