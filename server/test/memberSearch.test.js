// ============================================================
// File:        memberSearch.test.js
// Path:        server/test/memberSearch.test.js
// Project:     Seasonal Entertainment
// Description: Guards GET /api/chat/members ("Find a member", @mention suggestions): names
//              starting with the text first, then containing it, case-insensitively; at least 2
//              characters; at most 10 results; never the searcher, locked or banned accounts;
//              the room filter keeps only members who may read the room; exactly id, username,
//              canReceive and online, never an email; guests refused; its own rate limit;
//              wildcard characters match themselves.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { chatApp } from './helpers/chat.js';
import { memberWithKey } from './helpers/keys.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const search = (agent, q, room) =>
  agent.get('/api/chat/members').query({ q, ...(room && { room }) });
const names = async (agent, q, room) =>
  (await search(agent, q, room)).body.members.map((m) => m.username);

describe('matching', () => {
  it('prefix matches first, then contains, case-insensitively; never the searcher', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'annabel');
    // 'aaron_ann' sorts before 'Anna' by name: prefix-first must still put Anna first.
    for (const name of ['aaron_ann', 'Anna', 'joanne', 'zed']) await registerUser(t, name);
    expect(await names(agent, 'ANN')).toEqual(['Anna', 'aaron_ann', 'joanne']);
    expect(await names(agent, 'zz')).toEqual([]);
  });

  it('needs at least 2 characters and shows at most 10', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'searcher');
    for (let i = 0; i < 12; i++) await registerUser(t, `member${String(i).padStart(2, '0')}`);
    expect((await search(agent, 'm')).status).toBe(400);
    const found = await names(agent, 'member');
    expect(found).toHaveLength(10);
    expect(found[0]).toBe('member00');
  });

  it('treats % and _ as themselves', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'searcher');
    await registerUser(t, 'a_b');
    await registerUser(t, 'axb');
    expect(await names(agent, 'a_b')).toEqual(['a_b']);
    expect(await names(agent, '%%')).toEqual([]);
  });
});

describe('who is found', () => {
  it('leaves out locked and banned accounts', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'searcher');
    const locked = await registerUser(t, 'tom_locked');
    const banned = await registerUser(t, 'tom_banned');
    await registerUser(t, 'tom_fine');
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(locked.user.id);
    t.db
      .prepare(
        `INSERT INTO chat_sanctions (kind, user_id, target, created_by, created_at)
         VALUES ('ban', ?, 'tom_banned', 'mod', ?)`
      )
      .run(banned.user.id, new Date().toISOString());
    expect(await names(agent, 'tom')).toEqual(['tom_fine']);
  });

  it('with a room: only members who may read it; the searcher must read it too', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'searcher');
    await registerUser(t, 'olga_member');
    await makeStaff(t, 'olga_staff', 'organiser');
    expect(await names(agent, 'olga', 'general')).toEqual(['olga_member', 'olga_staff']);
    expect((await search(agent, 'olga', 'organisers')).status).toBe(404);
    const { agent: staff } = await makeStaff(t, 'mona', 'organiser');
    expect(await names(staff, 'olga', 'organisers')).toEqual(['olga_staff']);
    expect((await search(staff, 'olga', 'nope')).status).toBe(404);
  });
});

describe('what is returned', () => {
  it('exactly id, username, canReceive and online', async () => {
    t = chatApp();
    const { agent } = await registerUser(t, 'searcher');
    const withKey = await memberWithKey(t, 'kim_key');
    const without = await registerUser(t, 'kim_nokey');
    const { members } = (await search(agent, 'kim')).body;
    expect(members).toEqual([
      { id: withKey.user.id, username: 'kim_key', canReceive: true, online: false },
      { id: without.user.id, username: 'kim_nokey', canReceive: false, online: false },
    ]);
    expect(JSON.stringify(members)).not.toContain('@example.org');
  });

  it('guests are refused; members have their own rate limit', async () => {
    t = chatApp({ rateLimits: { memberSearch: { windowMs: 60_000, max: 2 } } });
    expect((await search(t.client(), 'an')).status).toBe(401);
    const { agent } = await registerUser(t, 'searcher');
    expect((await search(agent, 'an')).status).toBe(200);
    expect((await search(agent, 'an')).status).toBe(200);
    expect((await search(agent, 'an')).status).toBe(429);
    // Another member is not affected.
    const other = await registerUser(t, 'other');
    expect((await search(other.agent, 'an')).status).toBe(200);
  });
});
