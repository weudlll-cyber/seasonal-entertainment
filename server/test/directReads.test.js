// ============================================================
// File:        directReads.test.js
// Path:        server/test/directReads.test.js
// Project:     Seasonal Entertainment
// Description: Guards the unread marker of direct messages (a new message is unread until the
//              conversation is read up to it; the marker never moves back; one's own messages
//              are never unread) and that direct messages follow the chat retention.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { runChatRetention } from '../src/chat/retention.js';
import { readDirect, sendDirect } from './helpers/direct.js';
import { memberWithKey } from './helpers/keys.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('unread marker and retention', () => {
  it('a new message is unread until read; read never moves back', async () => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const first = (await sendDirect(anna, ben.user, { text: 'hi' })).body.message;
    const second = (await sendDirect(anna, ben.user, { text: 'again' })).body.message;
    const list = async () => (await ben.agent.get('/api/chat/direct')).body.conversations;
    const read = (lastId) =>
      ben.agent.post(`/api/chat/direct/${anna.user.id}/read`).send({ lastId });
    expect(await list()).toMatchObject([{ partner: { id: anna.user.id }, unread: true }]);
    await read(first.id);
    expect((await list())[0].unread).toBe(true); // the second is still new
    await read(second.id);
    expect((await list())[0].unread).toBe(false);
    await read(first.id); // an older marker changes nothing
    expect((await list())[0].unread).toBe(false);
    // The sender's own message is never "unread" for them.
    expect((await anna.agent.get('/api/chat/direct')).body.conversations[0].unread).toBe(false);
  });

  it('direct messages follow the chat retention', async () => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    expect((await sendDirect(anna, ben.user, { text: 'old' })).status).toBe(201);
    t.db.prepare("UPDATE direct_messages SET created_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await sendDirect(anna, ben.user, { text: 'new' })).status).toBe(201);
    runChatRetention(t.db, t.config);
    const { messages } = await readDirect(ben, anna.user);
    expect(messages.map((m) => m.payload.text)).toEqual(['new']);
  });
});
