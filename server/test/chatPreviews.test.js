// ============================================================
// File:        chatPreviews.test.js
// Path:        server/test/chatPreviews.test.js
// Project:     Seasonal Entertainment
// Description: Guards link previews in the chat on a pretend internet: a member's first https
//              link gets a card (Open Graph) with its image re-served from this site (none over 50
//              megapixels); plain
//              http links are refused; one fetch per URL (cache); the switch and the fetch
//              limit; a moderator removes a card (audited); a reported message shows its card
//              to moderators only until reviewed; unused previews are cleaned up.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteUnusedPreviewFiles } from '../src/chat/retention.js';
import { auditActions, chatApp } from './helpers/chat.js';
import { addLibraryItem, largePng, makeImage } from './helpers/media.js';
import { PUBLIC_IP, html, previewInternet } from './helpers/previewNet.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
let internet;
afterEach(async () => {
  t?.close();
  await internet?.close();
});

const PAGE = `<html><head><meta property="og:title" content="Seasonal Tokens">
  <meta property="og:description" content="Four tokens, one for each season.">
  <meta property="og:site_name" content="seasonaltokens.org">
  <meta property="og:image" content="https://site.test/card.png"></head></html>`;

// extra: more pages and files of the pretend internet, by host and path.
async function start(overrides, extra = {}) {
  const card = await makeImage('png', 1200);
  internet = await previewInternet(
    {
      'site.test/': html(PAGE),
      'site.test/other': html(PAGE),
      'site.test/card.png': (_req, res) => {
        res.setHeader('Content-Type', 'image/png');
        res.end(card);
      },
      ...extra,
    },
    { 'site.test': [PUBLIC_IP] }
  );
  t = chatApp(overrides, { previewNetwork: internet.network });
  return (await registerUser(t, 'mia')).agent;
}

const say = (agent, body) => agent.post('/api/chat/rooms/general/messages').send({ body });
const messages = async (agent) =>
  (await agent.get('/api/chat/rooms/general/messages')).body.messages;
const previewOf = async (agent, id) => (await messages(agent)).find((m) => m.id === id).preview;
const waitForPreview = (agent, id) =>
  vi.waitFor(async () => expect(await previewOf(agent, id)).not.toBeNull(), { timeout: 3000 });

describe('previews', () => {
  it('a member link gets an Open Graph card; the image is re-served from this site', async () => {
    const mia = await start();
    const { message } = (await say(mia, 'look https://site.test/ and more')).body;
    await waitForPreview(mia, message.id);
    const preview = await previewOf(mia, message.id);
    expect(preview).toMatchObject({
      url: 'https://site.test/',
      title: 'Seasonal Tokens',
      description: 'Four tokens, one for each season.',
      siteName: 'seasonaltokens.org',
      image: { url: expect.stringMatching(/^\/media\/previews\/[0-9a-f]{32}\.webp$/), width: 480 },
    });
    const served = await t.client().get(preview.image.url);
    expect(served.headers['content-type']).toBe('image/webp');
    expect((await sharp(served.body).metadata()).width).toBe(480);
  });

  it(
    'an image over 50 megapixels is left out of the card; one of 48 is kept',
    {
      timeout: 60_000,
    },
    async () => {
      // A page per image; 8500 x 6000 is 51 megapixels, 8000 x 6000 is 48, both under 60 KB.
      const extra = {};
      for (const [name, png] of [
        ['huge', await largePng(8500, 6000)],
        ['large', await largePng(8000, 6000)],
      ]) {
        extra[`site.test/${name}`] = html(PAGE.replace('card.png', `${name}.png`));
        extra[`site.test/${name}.png`] = (_req, res) => {
          res.setHeader('Content-Type', 'image/png');
          res.end(png);
        };
      }
      const mia = await start(undefined, extra);
      const card = async (path) => {
        const { message } = (await say(mia, `https://site.test/${path}`)).body;
        await vi.waitFor(async () => expect(await previewOf(mia, message.id)).not.toBeNull(), {
          timeout: 30_000,
        });
        return previewOf(mia, message.id);
      };
      expect(await card('huge')).toMatchObject({ title: 'Seasonal Tokens', image: null });
      expect((await card('large')).image).toMatchObject({ width: 480 });
    }
  );

  it('text sent together with a sticker gets its preview as well', async () => {
    const mia = await start();
    const { item } = await addLibraryItem(t, 'sticker');
    const { message } = (
      await mia
        .post('/api/chat/rooms/general/messages')
        .send({ body: 'https://site.test/', attachment: { type: 'sticker', itemId: item.id } })
    ).body;
    await waitForPreview(mia, message.id);
    expect(await previewOf(mia, message.id)).toMatchObject({ title: 'Seasonal Tokens' });
  });

  it('plain http links are refused and never fetched', async () => {
    const mia = await start();
    const res = await say(mia, 'see http://site.test/');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('https_only');
    expect(internet.requests).toEqual([]);
  });

  it('fetches a URL once (cache)', async () => {
    const mia = await start();
    const first = (await say(mia, 'https://site.test/')).body.message;
    await waitForPreview(mia, first.id);
    const second = (await say(mia, 'again https://site.test/')).body.message;
    await waitForPreview(mia, second.id);
    expect(internet.hits('site.test/')).toBe(1);
  });

  it('can be switched off, and respects the per-user fetch limit', async () => {
    const off = await start({ linkPreviews: { enabled: false } });
    await say(off, 'https://site.test/');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(internet.requests).toEqual([]);
    t.close();
    await internet.close();

    const limited = await start({ linkPreviews: { perUser: { windowMs: 60_000, max: 1 } } });
    const first = (await say(limited, 'https://site.test/')).body.message;
    await waitForPreview(limited, first.id);
    await say(limited, 'https://site.test/other');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(internet.hits('site.test/other')).toBe(0);
  });
});

describe('moderation', () => {
  it('a moderator removes a preview for everyone (audited)', async () => {
    const mia = await start();
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    const { message } = (await say(mia, 'https://site.test/')).body;
    await waitForPreview(mia, message.id);
    expect((await mia.post(`/api/chat/messages/${message.id}/preview/remove`)).status).toBe(403);
    expect((await olga.post(`/api/chat/messages/${message.id}/preview/remove`)).status).toBe(200);
    expect(await previewOf(mia, message.id)).toBeNull();
    expect(await previewOf(olga, message.id)).toBeNull();
    expect(auditActions(t)).toEqual(['chat.preview_remove']);
  });

  it('a reported message shows its card to moderators only, until reviewed', async () => {
    const mia = await start();
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    const { message } = (await say(mia, 'https://site.test/')).body;
    await waitForPreview(mia, message.id);
    await t.client().post(`/api/chat/messages/${message.id}/report`);
    expect(await previewOf(mia, message.id)).toBeNull();
    expect(await previewOf(t.client(), message.id)).toBeNull();
    const seen = (await messages(olga)).find((m) => m.id === message.id);
    expect(seen).toMatchObject({ previewHeld: true, preview: { title: 'Seasonal Tokens' } });
    expect((await olga.post(`/api/chat/messages/${message.id}/reviewed`)).status).toBe(200);
    expect(await previewOf(mia, message.id)).toMatchObject({ title: 'Seasonal Tokens' });
    expect((await olga.get('/api/chat/reports')).body.messages).toEqual([]);
  });
});

describe('upkeep', () => {
  it('previews no message uses are deleted after the cache time, with their image', async () => {
    const mia = await start();
    const { message } = (await say(mia, 'https://site.test/')).body;
    await waitForPreview(mia, message.id);
    const file = (await previewOf(mia, message.id)).image.url.replace('/media/', '');
    expect(deleteUnusedPreviewFiles(t.db, t.config, Date.now() + 2 * 86_400_000)).toBe(0);
    t.db.prepare('DELETE FROM chat_messages').run();
    expect(deleteUnusedPreviewFiles(t.db, t.config)).toBe(0); // still inside the cache time
    expect(deleteUnusedPreviewFiles(t.db, t.config, Date.now() + 2 * 86_400_000)).toBe(1);
    expect(existsSync(path.join(t.config.mediaDir, file))).toBe(false);
  });
});
