// ============================================================
// File:        directPreview.test.js
// Path:        server/test/directPreview.test.js
// Project:     Seasonal Entertainment
// Description: Guards link previews for direct messages (previews/directPreview.js) on a
//              pretend internet: the card comes back with its image inline (at most 320px wide
//              and 50 KB, WebP) and nothing is written (no database change, no media file) or
//              logged with the link; members only; refused when the member switched the
//              setting off; a direct message with such a card fits the ciphertext limit.
// ============================================================

import { readdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CIPHERTEXT_MAX } from '@seasonal-entertainment/shared/cryptoFormat.js';
import { chatApp } from './helpers/chat.js';
import { PUBLIC_IP, html, previewInternet } from './helpers/previewNet.js';
import { registerUser } from './helpers/testApp.js';

let t;
let internet;
afterEach(async () => {
  vi.restoreAllMocks();
  t?.close();
  await internet?.close();
});

const LINK = 'https://site.test/secret-path?token=abc';
const PAGE = `<html><head><meta property="og:title" content="Seasonal Tokens">
  <meta property="og:description" content="Four tokens, one for each season.">
  <meta property="og:site_name" content="seasonaltokens.org">
  <meta property="og:image" content="https://site.test/card.png"></head></html>`;

// A noisy picture: it does not compress well, so the 50 KB limit has work to do.
const noisy = (width) =>
  sharp(randomBytes(width * width * 3), { raw: { width, height: width, channels: 3 } })
    .png()
    .toBuffer();

async function start() {
  const card = await noisy(500); // under the 1 MB fetch cap, far over 50 KB as WebP
  internet = await previewInternet(
    {
      'site.test/secret-path?token=abc': html(PAGE),
      'site.test/card.png': (_req, res) => {
        res.setHeader('Content-Type', 'image/png');
        res.end(card);
      },
    },
    { 'site.test': [PUBLIC_IP] }
  );
  t = chatApp({}, { previewNetwork: internet.network });
  return (await registerUser(t, 'mia')).agent;
}

const changes = () => t.db.prepare('SELECT total_changes() AS n').get().n;
const mediaFiles = () =>
  existsSync(t.config.mediaDir) ? readdirSync(t.config.mediaDir, { recursive: true }) : [];

describe('link previews for direct messages', () => {
  it('answers the card with a small inline image, and stores and logs nothing', async () => {
    const mia = await start();
    const logged = ['log', 'info', 'warn', 'error'].map((level) => vi.spyOn(console, level));
    const before = { changes: changes(), files: mediaFiles() };
    const res = await mia.post('/api/chat/direct/preview').send({ url: LINK });
    expect(res.status).toBe(200);
    expect(res.body.preview).toMatchObject({
      url: LINK,
      title: 'Seasonal Tokens',
      description: 'Four tokens, one for each season.',
      siteName: 'seasonaltokens.org',
    });
    const { image } = res.body.preview;
    expect(image).toMatch(/^data:image\/webp;base64,/);
    const bytes = Buffer.from(image.split(',')[1], 'base64');
    expect(bytes.length).toBeLessThanOrEqual(50 * 1024);
    expect((await sharp(bytes).metadata()).width).toBeLessThanOrEqual(320);
    expect(changes()).toBe(before.changes);
    expect(mediaFiles()).toEqual(before.files);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM link_previews').get().n).toBe(0);
    const said = logged.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    expect(said).not.toContain('site.test');
  });

  it('a failing link is no card, and still says nothing in the log', async () => {
    const mia = await start();
    const logged = ['log', 'info', 'warn', 'error'].map((level) => vi.spyOn(console, level));
    const res = await mia.post('/api/chat/direct/preview').send({ url: 'https://site.test/none' });
    expect(res.body).toEqual({ ok: true, preview: null });
    expect(logged.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it('members only; refused when the member switched it off', async () => {
    const mia = await start();
    expect((await t.client().post('/api/chat/direct/preview').send({ url: LINK })).status).toBe(
      401
    );
    await mia.put('/api/auth/privacy').send({ dmLinkPreviews: false });
    const off = await mia.post('/api/chat/direct/preview').send({ url: LINK });
    expect(off.status).toBe(403);
    expect(internet.requests).toHaveLength(0);
    expect((await mia.get('/api/auth/session')).body.user.dmLinkPreviews).toBe(false);
  });

  it('only an https link', async () => {
    const mia = await start();
    const res = await mia.post('/api/chat/direct/preview').send({ url: 'http://site.test/' });
    expect(res.status).toBe(400);
  });

  it('a message carrying the largest card fits the ciphertext limit', () => {
    // 50 KB of image as base64, a 2000-character text, and room for the card's words.
    const plaintext = Math.ceil((50 * 1024) / 3) * 4 + 2000 * 4 + 1000;
    const ciphertext = Math.ceil((plaintext + 16) / 3) * 4;
    expect(ciphertext).toBeLessThanOrEqual(CIPHERTEXT_MAX);
  });
});
