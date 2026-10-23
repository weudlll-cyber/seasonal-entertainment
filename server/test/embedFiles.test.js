// ============================================================
// File:        embedFiles.test.js
// Path:        server/test/embedFiles.test.js
// Project:     Seasonal Entertainment
// Description: Files in the chat embedded on another site (embed/auth.js, uploads/fileLinks.js,
//              docs/EMBED.md), under two independent rules, both off by default: "uploads"
//              lets a member upload there (with the site's limits); "images" gives short-lived
//              links to members-only images and downloads, which work without a cookie, only
//              for that file and variant, only until they expire or the token ends. Each works
//              without the other; a site's own rule beats the global setting for each; guests
//              get no links, and the plain address stays closed to them.
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

// A member logged in to the chat on the approved site: { site (the token's agent), here (her
// own cookie agent on this site) }.
async function embedded() {
  t = chatApp();
  await approveSite(t);
  const { agent: here } = await registerUser(t, 'mia');
  const { token } = (await requestToken(here)).body;
  return { site: tokenAgent(t, token), here };
}
// An image mia sent in the members-only room from this site (her cookie).
async function membersOnlyImage(here) {
  const sent = await upload(here, await makeImage('png'), 'pic.png');
  await sendFile(here, sent.body.upload.id, 'look', 'seasonal-race');
  return sent.body.upload;
}
const linksOf = (site, id) => site.post(`/api/chat/files/${id}/links`);
// A plain request without cookie or token, as an <img> in the frame makes it.
const fetchPlain = (url) => request(t.app).get(url);
const siteRule = (rule, value) =>
  t.embedAdmin.put('/api/admin/embed-origins/rules').send({ origin: SITE, rule, value });

describe('both off (the default)', () => {
  it('an upload and a link with an embed token are refused', async () => {
    const { site, here } = await embedded();
    const image = await membersOnlyImage(here);
    const refused = await upload(site, PDF, 'a.pdf');
    expect([refused.status, refused.body.error]).toEqual([403, 'embed_uploads_off']);
    expect((await linksOf(site, image.id)).body.error).toBe('embed_images_off');
  });
});

describe('uploads on, images off', () => {
  it("a member uploads under the site's limits; members-only images get no links", async () => {
    const { site, here } = await embedded();
    setSetting(t.db, 'embed.uploads', true);
    expect((await upload(site, PDF, 'a.pdf')).status).toBe(201);
    setSetting(t.db, 'chat.uploadMaxMb', 1);
    const big = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await upload(site, big, 'big.pdf')).status).toBe(413);
    const image = await membersOnlyImage(here);
    expect((await linksOf(site, image.id)).body.error).toBe('embed_images_off');
  });
});

describe('images on, uploads off', () => {
  it('no upload; a members-only image shows through its links, to members only', async () => {
    const { site, here } = await embedded();
    setSetting(t.db, 'embed.images', true);
    expect((await upload(site, PDF, 'a.pdf')).body.error).toBe('embed_uploads_off');
    const image = await membersOnlyImage(here);
    expect((await fetchPlain(image.thumbUrl)).status).toBe(404); // closed to guests
    const { links } = (await linksOf(site, image.id)).body;
    expect(Object.keys(links)).toEqual(['thumbUrl', 'url']);
    const shown = await fetchPlain(links.thumbUrl);
    expect([shown.status, shown.headers['content-type']]).toEqual([200, 'image/png']);
    expect((await fetchPlain(links.url)).status).toBe(200);
    expect((await t.client().post(`/api/chat/files/${image.id}/links`)).status).toBe(401);
  });

  it('a link is for its file and variant only, and ends with time or the token', async () => {
    const { site, here } = await embedded();
    setSetting(t.db, 'embed.images', true);
    const image = await membersOnlyImage(here);
    const other = await membersOnlyImage(here);
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

  it('a member gets no link for a file they may not read now', async () => {
    const { site, here } = await embedded();
    setSetting(t.db, 'embed.images', true);
    const image = await membersOnlyImage(here);
    // Hidden by a moderator: moderators only.
    t.db.prepare("UPDATE chat_messages SET hidden_at = 'now', hidden_by = 'olga'").run();
    expect((await linksOf(site, image.id)).status).toBe(404);
  });
});

describe("a site's own rule beats the global setting", () => {
  it('for uploads', async () => {
    const { site } = await embedded();
    await siteRule('uploads', 'on');
    expect((await upload(site, PDF, 'a.pdf')).status).toBe(201);
    setSetting(t.db, 'embed.uploads', true);
    await siteRule('uploads', 'off');
    expect((await upload(site, PDF, 'b.pdf')).status).toBe(403);
  });

  it('for images', async () => {
    const { site, here } = await embedded();
    const image = await membersOnlyImage(here);
    await siteRule('images', 'on');
    expect((await linksOf(site, image.id)).status).toBe(200);
    setSetting(t.db, 'embed.images', true);
    await siteRule('images', 'off');
    expect((await linksOf(site, image.id)).body.error).toBe('embed_images_off');
  });
});
