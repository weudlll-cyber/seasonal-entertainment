// ============================================================
// File:        media.js
// Path:        server/test/helpers/media.js
// Project:     Seasonal Entertainment
// Description: Chat media test helpers: real images made with sharp (PNG, WebP, GIF, JPEG,
//              animated WebP), and a library pack with one item added straight through the
//              store, for tests that need something to send.
// ============================================================

import sharp from 'sharp';
import { saveMediaFile } from '../../src/media/files.js';
import { checkImage, libraryRules } from '../../src/media/imageCheck.js';
import { addItem, createPack } from '../../src/media/store.js';

const square = (size, red = 200) =>
  sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: red, g: 120, b: 30, alpha: 1 },
    },
  });

// format: 'png' | 'webp' | 'gif' | 'jpeg' | 'animated-webp' (two different frames: identical
// ones would be merged into a still image).
export async function makeImage(format, size = 64) {
  if (format !== 'animated-webp') return square(size)[format]().toBuffer();
  const frames = await Promise.all([10, 240].map((red) => square(size, red).png().toBuffer()));
  return sharp(frames, { join: { animated: true } })
    .webp()
    .toBuffer();
}

// A pack of `kind` with one item; returns { pack, item }.
export async function addLibraryItem(t, kind, name = `${kind} one`) {
  const buffer = await makeImage(kind === 'sticker' ? 'png' : 'gif');
  const image = await checkImage(buffer, libraryRules(t.config, kind));
  const pack = createPack(t.db, { name: `${kind} pack`, kind });
  const file = saveMediaFile(t.config, buffer, image.ext);
  const item = addItem(t.db, pack.id, { name, alt: `${name} picture` }, image, file, buffer.length);
  return { pack, item };
}
