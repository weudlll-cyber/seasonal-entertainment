// ============================================================
// File:        directReads.test.js
// Path:        server/test/directReads.test.js
// Project:     Seasonal Entertainment
// Description: Guards the unread count of direct messages (/api/chat/unread: the partner's
//              messages after the read marker; the marker never moves back; one's own messages
//              never count) and that direct messages follow the chat retention.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { runChatRetention } from '../src/chat/retention.js';
import { readDirect, sendDirect } from './helpers/direct.js';
import { memberWithKey } from './helpers/keys.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('unread marker and retention', () => {
  it('counts the partner messages not yet read; the marker never moves back', async () => {
    t = makeTestApp();
    const anna = await memberWithKey(t, 'anna');
    const ben = await memberWithKey(t, 'ben');
    const first = (await sendDirect(anna, ben.user, { text: 'hi' })).body.message;
    const second = (await sendDirect(anna, ben.user, { text: 'again' })).body.message;
    const counts = async (agent) => (await agent.get('/api/chat/unread')).body.direct;
    const read = (lastId) =>
      ben.agent.post(`/api/chat/direct/${anna.user.id}/read`).send({ lastId });
    expect(await counts(ben.agent)).toEqual([{ partnerId: anna.user.id, count: 2 }]);
    await read(first.id);
    expect(await counts(ben.agent)).toEqual([{ partnerId: anna.user.id, count: 1 }]);
    await read(second.id);
    expect(await counts(ben.agent)).toEqual([]);
    await read(first.id); // an older marker changes nothing
    expect(await counts(ben.agent)).toEqual([]);
    // The sender's own messages never count for them.
    expect(await counts(anna.agent)).toEqual([]);
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
