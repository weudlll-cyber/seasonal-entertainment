// ============================================================
// File:        mediaUpload.test.js
// Path:        server/test/mediaUpload.test.js
// Project:     Seasonal Entertainment
// Description: Guards the chat media library: only admins upload; the real type is read from
//              the content (a disguised file is refused whatever it claims to be); size and
//              dimension limits per pack kind (dimensions from the header, before decoding); generated file names; served from this origin
//              with the right Content-Type, nosniff and a long cache; edits are audited.
// ============================================================

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkImage } from '../src/media/imageCheck.js';
import { auditActions } from './helpers/chat.js';
import { makeImage } from './helpers/media.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const GENERATED = /^\/media\/[0-9a-f]{32}\.(png|webp|gif)$/;

async function adminWithPack(kind, overrides) {
  t = makeTestApp(overrides);
  const { agent } = await makeStaff(t, 'ada', 'admin');
  const pack = (await agent.post('/api/admin/chat/media/packs').send({ name: 'P', kind })).body
    .pack;
  const upload = (buffer, query = { name: 'Hi', alt: 'A greeting' }, as = agent) =>
    as
      .post(`/api/admin/chat/media/packs/${pack.id}/items`)
      .query(query)
      .set('Content-Type', 'application/octet-stream')
      .send(buffer);
  return { agent, pack, upload };
}

describe('upload', () => {
  it('only admins upload', async () => {
    const { upload } = await adminWithPack('sticker');
    const png = await makeImage('png');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    const { agent: member } = await registerUser(t, 'mia');
    expect((await upload(png, undefined, t.client())).status).toBe(401);
    expect((await upload(png, undefined, member)).status).toBe(403);
    expect((await upload(png, undefined, organiser)).status).toBe(403);
    expect((await upload(png)).status).toBe(201);
  });

  it('stores the file under a generated name and serves it safely from this origin', async () => {
    const { upload } = await adminWithPack('sticker');
    const res = await upload(await makeImage('png'), { name: '../../evil.png', alt: 'Alt' });
    expect(res.status).toBe(201);
    expect(res.body.item.url).toMatch(GENERATED);
    expect(readdirSync(t.config.mediaDir)).toEqual([path.basename(res.body.item.url)]);
    const served = await t.client().get(res.body.item.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toMatch(/max-age=31536000.*immutable/);
    const missing = await t.client().get('/media/0123456789abcdef0123456789abcdef.png');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type'] ?? '').not.toMatch(/html/);
  });

  it('reads the real type from the content, not from what the upload claims', async () => {
    const { upload } = await adminWithPack('sticker');
    const gif = await makeImage('gif');
    const claimsWebp = await upload(gif, { name: 'x.webp', alt: 'Alt' }).set(
      'Content-Type',
      'image/webp'
    );
    expect(claimsWebp.status).toBe(400);
    // A real PNG header, but the image data is cut off.
    const png = await makeImage('png', 200);
    expect((await upload(png.subarray(0, Math.floor(png.length * 0.6)))).status).toBe(400);
    expect((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status).toBe(
      400
    );
    expect(existsSync(t.config.mediaDir) ? readdirSync(t.config.mediaDir) : []).toEqual([]);
  });

  it('enforces the size and dimension limits per kind', async () => {
    const media = {
      sticker: { maxBytes: 4000, maxSide: 64 },
      gif: { maxBytes: 20000, maxSide: 32 },
    };
    const { upload } = await adminWithPack('sticker', { media });
    expect((await upload(await makeImage('png', 64))).status).toBe(201);
    expect((await upload(await makeImage('png', 65))).status).toBe(400);
    const big = await makeImage('png', 60);
    // Over the sticker limit: refused by the check; over every limit: refused while reading.
    expect((await upload(Buffer.concat([big, Buffer.alloc(4000)]))).status).toBe(400);
    expect((await upload(Buffer.concat([big, Buffer.alloc(30000)]))).status).toBe(413);
  });

  it('an image too large is refused from its header, before it is decoded', async () => {
    // A 200 x 200 PNG cut off half-way: its header is intact, its image data is not. Refused
    // for its size, which the header tells; decoding first would end in "not a readable image".
    const png = await makeImage('png', 200);
    const cut = png.subarray(0, Math.floor(png.length / 2));
    await expect(
      checkImage(cut, { types: ['png'], maxBytes: 100_000, maxSide: 64 })
    ).rejects.toThrow('The image may be at most 64 px on each side.');
  });

  it('a GIF pack takes GIFs and animated WebP, not a still WebP', async () => {
    const { upload } = await adminWithPack('gif');
    expect((await upload(await makeImage('gif'))).status).toBe(201);
    expect((await upload(await makeImage('animated-webp'))).status).toBe(201);
    expect((await upload(await makeImage('webp'))).status).toBe(400);
    expect((await upload(await makeImage('png'))).status).toBe(400);
  });
});

describe('library editing', () => {
  it('rename, alt text, credit, deactivate, delete: each audited; delete removes the file', async () => {
    const { agent, pack, upload } = await adminWithPack('sticker');
    const item = (await upload(await makeImage('png'))).body.item;
    const edit = { name: 'Wave', alt: 'A waving hand', credit: 'Foxeane', active: false };
    const edited = await agent.put(`/api/admin/chat/media/items/${item.id}`).send(edit);
    expect(edited.body.item).toMatchObject(edit);
    await agent.put(`/api/admin/chat/media/packs/${pack.id}`).send({ name: 'Q', active: true });
    expect((await agent.delete(`/api/admin/chat/media/items/${item.id}`)).status).toBe(200);
    expect(readdirSync(t.config.mediaDir)).toEqual([]);
    expect(auditActions(t)).toEqual([
      'media.pack_create',
      'media.item_upload',
      'media.item_edit',
      'media.pack_edit',
      'media.item_delete',
    ]);
  });

  it('reorders packs', async () => {
    const { agent, pack } = await adminWithPack('sticker');
    const second = (
      await agent.post('/api/admin/chat/media/packs').send({ name: 'B', kind: 'gif' })
    ).body.pack;
    await agent.post('/api/admin/chat/media/packs/reorder').send({ ids: [second.id, pack.id] });
    const list = (await agent.get('/api/admin/chat/media')).body.packs.map((p) => p.id);
    expect(list).toEqual([second.id, pack.id]);
  });
});
