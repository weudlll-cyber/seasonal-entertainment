// ============================================================
// File:        embedFiles.test.js
// Path:        server/test/embedFiles.test.js
// Project:     Seasonal Entertainment
// Description: Files in the chat embedded on another site (embed/auth.js, uploads/fileLinks.js,
//              docs/EMBED.md): off by default, an upload and a file link with an embed token are
//              refused; on (globally or by the site's own rule, which beats the global one), a
//              member uploads from an approved site with the site's limits, and gets short-lived
//              links to a members-only image that work without a cookie, only for that file and
//              variant, only until they expire or the token ends; guests get no links, and the
//              plain address stays closed to them.
// ============================================================

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LINK_MS } from '../src/uploads/fileLinks.js';
import { setSetting } from '../src/settings/store.js';
import { chatApp } from './helpers/chat.js';
import { SITE, approveSite, requestToken, tokenAgent } from './helpers/embed.js';
import { makeImage } from './helpers/media.js';
import { registerUser } from './helpers/testApp.js';
import { PDF, sendFile, upload } from './helpers/uploads.js';

let t;
afterEach(() => {
  vi.useRealTimers();
  t?.close();
});

// A member logged in to the chat on the approved site: { site } (the token's agent).
async function embedded() {
  t = chatApp();
  await approveSite(t);
  const { agent } = await registerUser(t, 'mia');
  const { token } = (await requestToken(agent)).body;
  return { site: tokenAgent(t, token) };
}
// An image mia sent in the members-only room (on the site, with her cookie).
async function membersOnlyImage(site) {
  const sent = await upload(site, await makeImage('png'), 'pic.png');
  await sendFile(site, sent.body.upload.id, 'look', 'seasonal-race');
  return sent.body.upload;
}
const linksOf = (site, id) => site.post(`/api/chat/files/${id}/links`);
// A plain request without cookie or token, as an <img> in the frame makes it.
const fetchPlain = (url) => request(t.app).get(url);

describe('switched off (the default)', () => {
  it('an upload and a link with an embed token are refused', async () => {
    const { site } = await embedded();
    const refused = await upload(site, PDF, 'a.pdf');
    expect([refused.status, refused.body.error]).toEqual([403, 'embed_uploads_off']);
    expect((await linksOf(site, 1)).body.error).toBe('embed_uploads_off');
  });
});

describe('switched on', () => {
  it("a member uploads from the approved site, under the site's limits", async () => {
    const { site } = await embedded();
    setSetting(t.db, 'embed.uploads', true);
    expect((await upload(site, PDF, 'a.pdf')).status).toBe(201);
    setSetting(t.db, 'chat.uploadMaxMb', 1);
    const big = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await upload(site, big, 'big.pdf')).status).toBe(413);
  });

  it("the site's own rule beats the global setting", async () => {
    const { site } = await embedded();
    const admin = t.embedAdmin;
    const rule = (value) =>
      admin.put('/api/admin/embed-origins/rules').send({ origin: SITE, rule: 'uploads', value });
    await rule('on');
    expect((await upload(site, PDF, 'a.pdf')).status).toBe(201);
    setSetting(t.db, 'embed.uploads', true);
    await rule('off');
    expect((await upload(site, PDF, 'b.pdf')).status).toBe(403);
  });

  it('a members-only image shows through its links, without a cookie', async () => {
    const { site } = await embedded();
    setSetting(t.db, 'embed.uploads', true);
    const image = await membersOnlyImage(site);
    expect((await fetchPlain(image.thumbUrl)).status).toBe(404); // closed to guests
    const { links } = (await linksOf(site, image.id)).body;
    expect(Object.keys(links)).toEqual(['thumbUrl', 'url']);
    const shown = await fetchPlain(links.thumbUrl);
    expect([shown.status, shown.headers['content-type']]).toEqual([200, 'image/png']);
    expect((await fetchPlain(links.url)).status).toBe(200);
  });

  it('a link is for its file and variant only, and ends with time or the token', async () => {
    const { site } = await embedded();
    setSetting(t.db, 'embed.uploads', true);
    const image = await membersOnlyImage(site);
    const other = await membersOnlyImage(site);
    const { links } = (await linksOf(site, image.id)).body;
    const query = links.thumbUrl.split('?')[1];
    expect((await fetchPlain(`/api/chat/files/${other.id}/thumb?${query}`)).status).toBe(404);
    expect((await fetchPlain(`/api/chat/files/${image.id}/full?${query}`)).status).toBe(404);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + LINK_MS + 1000);
    expect((await fetchPlain(links.thumbUrl)).status).toBe(404); // expired
    vi.useRealTimers();

    const fresh = (await linksOf(site, image.id)).body.links;
    expect((await fetchPlain(fresh.thumbUrl)).status).toBe(200);
    await site.post('/api/embed/logout'); // "Log out" in the frame ends the token
    expect((await fetchPlain(fresh.thumbUrl)).status).toBe(404);
  });

  it('guests get no links; a member gets none for a file they may not read', async () => {
    const { site } = await embedded();
    setSetting(t.db, 'embed.uploads', true);
    const image = await membersOnlyImage(site);
    expect((await t.client().post(`/api/chat/files/${image.id}/links`)).status).toBe(401);
    // Hidden by a moderator: moderators only.
    t.db.prepare("UPDATE chat_messages SET hidden_at = 'now', hidden_by = 'olga'").run();
    expect((await linksOf(site, image.id)).status).toBe(404);
  });
});
