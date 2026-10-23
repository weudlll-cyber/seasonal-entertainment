// ============================================================
// File:        images.js
// Path:        server/src/bots/images.js
// Project:     Seasonal Entertainment
// Description: The event bot's event images (events.image_url, docs/BOTS.md), fetched by this
//              server, never by the browser: through the link previews' image fetch with its
//              network guard (previews/fetchImage.js, handed over by the chat area: https, public
//              addresses only, size, type and pixel limits (config.imageMaxPixels), re-encoded
//              without metadata), stored in the media folder as bot-images/<hash of the URL>.webp
//              and served by the public media route. Each URL is fetched at most once a day; until
//              an image is there, or when it was refused, the event simply shows without one.
// ============================================================

import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BOT_IMAGE_FOLDER = 'bot-images';
const DAY_MS = 24 * 60 * 60_000;

export const botImageFile = (url) =>
  `${BOT_IMAGE_FOLDER}/${createHash('sha256').update(url).digest('hex').slice(0, 32)}.webp`;

// chatImages: { fetch, url } from the chat area (chat/mount.js). network: safeFetch's (the
// real internet when undefined; a fake in tests; bots/fixtureNetwork.js in development).
// now: the clock, a parameter for tests.
export function createBotImages(
  config,
  chatImages,
  network,
  { now = () => Date.now(), log = console.warn } = {}
) {
  const limits = config.bots.images;
  const known = new Map(); // url -> { at: last attempt, version: stored file's time or null }
  const fetching = new Map(); // url -> the attempt in flight (one at a time per URL)

  // What a previous run left on disk counts as fetched at the file's time.
  function fromDisk(url) {
    try {
      const at = statSync(path.join(config.mediaDir, botImageFile(url))).mtimeMs;
      return { at, version: Math.floor(at) };
    } catch {
      return null;
    }
  }

  async function refresh(url) {
    const file = botImageFile(url);
    try {
      const { data } = await chatImages.fetch(
        url,
        { maxBytes: limits.maxBytes, maxWidth: limits.maxWidth, maxPixels: config.imageMaxPixels },
        {
          timeoutMs: limits.timeoutMs,
          maxRedirects: limits.maxRedirects,
          userAgent: limits.userAgent,
        },
        network
      );
      const target = path.join(config.mediaDir, file);
      mkdirSync(path.dirname(target), { recursive: true });
      // Written beside it, then renamed: a reader never gets half a file.
      writeFileSync(`${target}.part`, data);
      renameSync(`${target}.part`, target);
      known.set(url, { at: now(), version: now() });
    } catch (err) {
      // An image that was there stays until a later fetch replaces it.
      const before = known.get(url);
      if (!before) log(`[bots] event image not used (${err.message}): ${url}`);
      known.set(url, { at: now(), version: before?.version ?? null });
    } finally {
      fetching.delete(url);
    }
  }

  // The image's address on this site for a bot image URL (http(s) only, checked by the
  // caller), or null for none yet. Starts a fetch in the background when there is no image or
  // the last attempt is over a day old.
  function lookup(url) {
    if (!url) return null;
    if (!known.has(url)) {
      const found = fromDisk(url);
      if (found) known.set(url, found);
    }
    const entry = known.get(url);
    if ((!entry || now() - entry.at >= DAY_MS) && !fetching.has(url)) {
      fetching.set(url, refresh(url));
    }
    // ?v= changes when the file does: the media route's long cache never shows an old one.
    return entry?.version ? `${chatImages.url(botImageFile(url))}?v=${entry.version}` : null;
  }

  // For tests and shutdown: resolves when every fetch in flight has finished.
  const settled = () => Promise.all([...fetching.values()]);

  return { lookup, settled };
}
