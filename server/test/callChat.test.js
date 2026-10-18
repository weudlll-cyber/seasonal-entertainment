// ============================================================
// File:        callChat.test.js
// Path:        server/test/callChat.test.js
// Project:     Seasonal Entertainment
// Description: A call's chat room (docs/CALLS.md, "Call chat"): created with the call, left
//              out of the room lists and the unread counters, shown only to a panel that
//              names it; guests may write there when they may in General at creation time;
//              read-only for everyone once the call ends, its messages kept.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { callApp, newCall, organiser } from './helpers/calls.js';
import { bodies, post } from './helpers/chat.js';
import { registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t.close());

const slugs = async (agent, query = '') =>
  (await agent.get(`/api/chat/rooms${query}`)).body.rooms.map((r) => r.slug);

describe('a call chat room', () => {
  it('is unlisted, and shown to a panel that names it', async () => {
    ({ t } = callApp());
    const call = await newCall(await organiser(t));
    const guest = t.client();
    expect(await slugs(guest)).not.toContain(call.chatRoom);
    expect(await slugs(guest, `?include=${call.chatRoom}`)).toContain(call.chatRoom);
  });

  it('does not count in the unread counters', async () => {
    ({ t } = callApp());
    const agent = await organiser(t);
    const call = await newCall(agent);
    const reader = (await registerUser(t, 'mia')).agent;
    await reader.get('/api/chat/unread'); // the reader's counters start now
    expect((await post(agent, call.chatRoom, 'hello call')).status).toBe(201);
    const { rooms } = (await reader.get('/api/chat/unread')).body;
    expect(rooms.map((r) => r.slug)).not.toContain(call.chatRoom);
  });

  it('lets guests write when General does, at creation time', async () => {
    ({ t } = callApp());
    const agent = await organiser(t);
    const open = await newCall(agent, 'Open');
    t.db.prepare("UPDATE chat_rooms SET guest_writable = 0 WHERE slug = 'general'").run();
    const closed = await newCall(agent, 'Members only');
    const guest = t.client();
    expect((await post(guest, open.chatRoom, 'hi from a guest')).status).toBe(201);
    expect((await post(guest, closed.chatRoom, 'hi from a guest')).status).toBe(403);
  });

  it('becomes read-only when the call ends; its messages stay', async () => {
    ({ t } = callApp());
    const agent = await organiser(t);
    const call = await newCall(agent);
    await agent.post(`/api/calls/${call.id}/start`);
    await post(agent, call.chatRoom, 'during the call');
    await agent.post(`/api/calls/${call.id}/end`);
    const res = await post(agent, call.chatRoom, 'after the call');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('read_only');
    expect(await bodies(t.client(), call.chatRoom)).toEqual(['during the call']);
    const [shown] = (await agent.get(`/api/chat/rooms?include=${call.chatRoom}`)).body.rooms.filter(
      (r) => r.slug === call.chatRoom
    );
    expect(shown.canWrite).toBe(false);
  });
});
