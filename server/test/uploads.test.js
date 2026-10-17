// ============================================================
// File:        uploads.test.js
// Path:        server/test/uploads.test.js
// Project:     Seasonal Entertainment
// Description: Guards chat file uploads: members only; the real type from the content, whatever
//              the name says; per-file size and daily quota; images stored upright without
//              metadata (EXIF with GPS gone), GIF animation kept, a thumbnail; generated names on
//              disk; the original name only as cleaned display text.
// ============================================================

import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { chatApp } from './helpers/chat.js';
import { makeImage } from './helpers/media.js';
import { registerUser } from './helpers/testApp.js';
import { PDF, gpsJpeg, upload, uploadedFiles } from './helpers/uploads.js';

let t;
afterEach(() => t?.close());

async function member(overrides) {
  t = chatApp(overrides);
  return (await registerUser(t, 'mia')).agent;
}

describe('who and what may be uploaded', () => {
  it('guests may not upload', async () => {
    await member();
    expect((await upload(t.client(), await makeImage('png'))).status).toBe(401);
    expect(uploadedFiles(t.config)).toEqual([]);
  });

  it('the real type decides, whatever the name or the claimed type say', async () => {
    const mia = await member();
    const refused = async (buffer, name) => {
      const res = await upload(mia, buffer, name).set('Content-Type', 'image/png');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_file');
    };
    await refused(Buffer.from('MZ\x90\x00 not really a program'), 'cute.png');
    await refused(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'logo.png');
    await refused(Buffer.from('just text'), 'notes.pdf');
    const png = await makeImage('png', 200);
    await refused(png.subarray(0, Math.floor(png.length * 0.6)), 'broken.png');
    expect(uploadedFiles(t.config)).toEqual([]);
    expect((await upload(mia, PDF, 'report.pdf')).status).toBe(201);
    expect((await upload(mia, await makeImage('webp'), 'a.webp')).status).toBe(201);
  });

  it('per-file size and the daily quota', async () => {
    const mia = await member({
      uploads: {
        maxBytes: 3000,
        dailyBytes: 5000,
        thumbWidth: 480,
        pendingMinutes: 60,
        nameMax: 100,
      },
    });
    expect((await upload(mia, Buffer.concat([PDF, Buffer.alloc(4000)]), 'big.pdf')).status).toBe(
      413
    );
    const pdf = Buffer.concat([PDF, Buffer.alloc(2000)]);
    expect((await upload(mia, pdf, 'one.pdf')).status).toBe(201);
    expect((await upload(mia, pdf, 'two.pdf')).status).toBe(201);
    const third = await upload(mia, pdf, 'three.pdf');
    expect(third.status).toBe(429);
    expect(third.body.error).toBe('upload_quota');
    const { agent: bob } = await registerUser(t, 'bob');
    expect((await upload(bob, pdf, 'other.pdf')).status).toBe(201);
  });
});

describe('what is stored', () => {
  it('images: upright, every metadata block gone (GPS too), plus a thumbnail', async () => {
    const mia = await member();
    const original = await gpsJpeg();
    const before = await sharp(original).metadata();
    expect(before.exif.toString('latin1')).toContain('TestCam');
    expect(
      before.exif.includes(Buffer.from([0x25, 0x88])) ||
        before.exif.includes(Buffer.from([0x88, 0x25]))
    ).toBe(true); // GPS pointer
    const { upload: stored } = (await upload(mia, original, 'holiday.jpg')).body;
    expect(stored).toMatchObject({ kind: 'image', name: 'holiday.jpg', width: 20, height: 40 });
    for (const variant of ['full', 'thumb']) {
      const res = await mia.get(`/api/chat/files/${stored.id}/${variant}`);
      expect(res.headers['content-type']).toBe('image/jpeg');
      const meta = await sharp(res.body).metadata();
      expect([meta.exif, meta.xmp, meta.iptc, meta.orientation]).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect([meta.width, meta.height]).toEqual([20, 40]);
    }
  });

  it('a GIF keeps its animation; the thumbnail is at most 480 px wide', async () => {
    const mia = await member();
    const frames = await Promise.all(
      [10, 240].map((r) =>
        sharp({
          create: { width: 900, height: 300, channels: 4, background: { r, g: 0, b: 0, alpha: 1 } },
        })
          .png()
          .toBuffer()
      )
    );
    const gif = await sharp(frames, { join: { animated: true } })
      .gif()
      .toBuffer();
    const { upload: stored } = (await upload(mia, gif, 'wave.gif')).body;
    const full = await sharp((await mia.get(`/api/chat/files/${stored.id}/full`)).body, {
      animated: true,
    }).metadata();
    const thumb = await sharp((await mia.get(`/api/chat/files/${stored.id}/thumb`)).body, {
      animated: true,
    }).metadata();
    expect([full.pages, full.width]).toEqual([2, 900]);
    expect([thumb.pages, thumb.width]).toEqual([2, 480]);
  });

  it('names on disk are generated; the original name is display text only', async () => {
    const mia = await member();
    const res = await upload(mia, PDF, '..\\..\\secret/../evil\u0007 name   with\tspaces.pdf');
    expect(res.body.upload.name).toBe('evil name with spaces.pdf');
    const files = readdirSync(path.join(t.config.mediaDir, 'uploads'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{32}\.pdf$/);
    const long = await upload(mia, PDF, `${'x'.repeat(300)}.pdf`);
    expect(long.body.upload.name).toHaveLength(100);
    expect(long.body.upload.name.endsWith('….pdf')).toBe(true);
  });
});
