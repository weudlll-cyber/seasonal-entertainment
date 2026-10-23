// ============================================================
// File:        embedGuests.test.js
// Path:        server/test/embedGuests.test.js
// Project:     Seasonal Entertainment
// Description: Guests in the chat embedded on an approved other site (embed/auth.js,
//              guestTokens.js, docs/EMBED.md): writing is off by default and refused; switched
//              on, a guest writes from an approved site and keeps the name through the signed
//              token the answer hands back; a site's own rule beats the global setting, for
//              reading and writing; an unapproved site gets nothing, and a token is good on its
//              own site only and only intact; sanctions and the guest message limit apply as
//              on the site; admins set a site's rules (audited) and /api/embed/check reports them.
// ============================================================

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/store.js';
import { chatApp } from './helpers/chat.js';
import { SITE, approveSite, removeSite } from './helpers/embed.js';
import { ORIGIN, makeStaff } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

// A request from the frame on `site`, as the embed sends it: no cookie, the site named, and the
// guest token when it has one.
const frame = (site = SITE, token) => {
  const agent = request.agent(t.app).set('Origin', ORIGIN).set('X-Embed-Origin', site);
  return token ? agent.set('X-Embed-Guest', token) : agent;
};
const say = (agent, body) => agent.post('/api/chat/rooms/general/messages').send({ body });
const read = (agent) => agent.get('/api/chat/rooms/general/messages');

async function approved() {
  t = chatApp();
  return approveSite(t);
}

describe('guests writing on another site', () => {
  it('is off by default: reading works, writing is refused', async () => {
    await approved();
    expect((await read(frame())).status).toBe(200);
    const refused = await say(frame(), 'hello');
    expect([refused.status, refused.body.error]).toEqual([403, 'embed_guests_write_off']);
  });

  it('switched on, a guest writes and keeps the name through the token', async () => {
    await approved();
    setSetting(t.db, 'embed.guestsWrite', true);
    const first = await say(frame(), 'hello from the game');
    expect(first.status).toBe(201);
    const token = first.headers['x-embed-guest'];
    expect(token).toBeTruthy();
    const name = first.body.message.author;
    expect(name).toMatch(/^Guest-/);
    const second = await say(frame(SITE, token), 'still me');
    expect(second.body.message.author).toBe(name);
    expect(second.headers['x-embed-guest']).toBeUndefined(); // nothing new to keep
    // Without the token it is another guest; with a damaged one too.
    expect((await say(frame(), 'someone else')).body.message.author).not.toBe(name);
    const damaged = `${token.slice(0, -2)}xx`;
    expect((await say(frame(SITE, damaged), 'forged')).body.message.author).not.toBe(name);
  });

  it("in the frame the token's guest counts, never a cookie's from this site", async () => {
    await approved();
    setSetting(t.db, 'embed.guestsWrite', true);
    const browser = t.client(); // the same browser: a guest name in its cookie session here
    const here = (await say(browser, 'on the site')).body.message.author;
    const framed = await say(browser.set('X-Embed-Origin', SITE), 'in the frame');
    expect(framed.body.message.author).not.toBe(here);
  });

  it("a site's own rule beats the global setting, for writing and reading", async () => {
    const admin = await approved();
    const rule = (name, value) =>
      admin.put('/api/admin/embed-origins/rules').send({ origin: SITE, rule: name, value });
    setSetting(t.db, 'embed.guestsWrite', true);
    await rule('guestsWrite', 'off');
    expect((await say(frame(), 'no')).status).toBe(403);
    setSetting(t.db, 'embed.guestsWrite', false);
    await rule('guestsWrite', 'on');
    expect((await say(frame(), 'yes')).status).toBe(201);
    await rule('guestsRead', 'off');
    const closed = await read(frame());
    expect([closed.status, closed.body.error]).toEqual([403, 'embed_guests_off']);
    await rule('guestsRead', 'inherit'); // the global rule again: on
    expect((await read(frame())).status).toBe(200);
  });

  it('an unapproved site gets nothing; a token is good on its own site only', async () => {
    await approved();
    await approveSite(t, 'https://other.example');
    setSetting(t.db, 'embed.guestsWrite', true);
    for (const res of [
      await read(frame('https://evil.example')),
      await say(frame('https://evil.example'), 'x'),
    ]) {
      expect([res.status, res.body.error]).toEqual([403, 'origin_not_allowed']);
    }
    const first = await say(frame(), 'on the game');
    const token = first.headers['x-embed-guest'];
    const elsewhere = await say(frame('https://other.example', token), 'on the other');
    expect(elsewhere.body.message.author).not.toBe(first.body.message.author);
  });

  it('sanctions and the guest message limit apply as on the site', async () => {
    await approved();
    setSetting(t.db, 'embed.guestsWrite', true);
    const first = await say(frame(), 'spam');
    const token = first.headers['x-embed-guest'];
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    await olga.post(`/api/chat/messages/${first.body.message.id}/mute`).send({ minutes: 10 });
    const muted = await say(frame(SITE, token), 'more spam');
    expect([muted.status, muted.body.error]).toEqual([403, 'muted']);

    setSetting(t.db, 'chat.guestMessages', 1);
    const other = await say(frame(), 'one');
    expect(other.status).toBe(201);
    expect((await say(frame(SITE, other.headers['x-embed-guest']), 'two')).status).toBe(429);
  });

  it('only guest routes: a guest in a frame reaches nothing else', async () => {
    await approved();
    expect((await frame().get('/api/chat/unread')).body.error).toBe('embed_not_allowed');
    expect((await frame().get('/api/auth/session')).status).toBe(200);
  });
});

describe("admins set a site's rules", () => {
  it('per rule: inherit, on or off, audited; /api/embed/check reports what holds', async () => {
    const admin = await approved();
    const check = async () =>
      (await t.client().get(`/api/embed/check?origin=${encodeURIComponent(SITE)}`)).body;
    expect(await check()).toEqual({
      ok: true,
      allowed: true,
      guestsRead: true,
      guestsWrite: false,
      uploads: false,
      images: false,
    });
    const set = (rule, value) =>
      admin.put('/api/admin/embed-origins/rules').send({ origin: SITE, rule, value });
    expect((await set('guestsWrite', 'maybe')).status).toBe(400);
    expect((await set('nonsense', 'on')).status).toBe(400);
    const changed = await set('guestsWrite', 'on');
    expect(changed.body.rules[SITE]).toEqual({
      guestsRead: 'inherit',
      guestsWrite: 'on',
      uploads: 'inherit',
      images: 'inherit',
    });
    expect((await check()).guestsWrite).toBe(true);
    const audit = t.db
      .prepare("SELECT before, after FROM audit_log WHERE action = 'embed.rule_change'")
      .get();
    expect([JSON.parse(audit.before), JSON.parse(audit.after)]).toEqual([
      { guestsWrite: 'inherit' },
      { guestsWrite: 'on' },
    ]);
    // A removed site's rules go with it; added again, it inherits.
    await removeSite(t);
    await approveSite(t);
    expect((await admin.get('/api/admin/embed-origins')).body.rules[SITE].guestsWrite).toBe(
      'inherit'
    );
  });

  it('for admins only', async () => {
    await approved();
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    const put = await olga
      .put('/api/admin/embed-origins/rules')
      .send({ origin: SITE, rule: 'guestsWrite', value: 'on' });
    expect(put.status).toBe(403);
  });
});
