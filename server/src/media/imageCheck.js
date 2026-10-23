// ============================================================
// File:        imageCheck.js
// Path:        server/src/media/imageCheck.js
// Project:     Seasonal Entertainment
// Description: The one file-type check and image validator, for library uploads (stickers, GIFs),
//              link-preview images and chat file uploads alike: the real type comes from the file's
//              first bytes (never its name; PDF by its %PDF- signature), sharp must read its
//              header, the dimensions (each side, the pixel count) are checked from it before any
//              decoding, then its first frame must decode fully (a truncated or damaged file
//              fails); size and animation are checked against the caller's rules too.
// ============================================================

import sharp from 'sharp';

export class ImageRejected extends Error {}

// type -> how it starts, its MIME type and the extension files on disk get.
const IMAGE_TYPES = {
  png: { mime: 'image/png', ext: 'png' },
  gif: { mime: 'image/gif', ext: 'gif' },
  webp: { mime: 'image/webp', ext: 'webp' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
};

// Every type a file may have: the images above, and PDF (chat uploads only).
export const FILE_TYPES = { ...IMAGE_TYPES, pdf: { mime: 'application/pdf', ext: 'pdf' } };

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);
const ascii = (text) => [...text].map((c) => c.charCodeAt(0));

export function sniffFileType(buffer) {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buffer, ascii('GIF87a')) || startsWith(buffer, ascii('GIF89a'))) return 'gif';
  if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, ascii('%PDF-'))) return 'pdf';
  return null;
}

// The library's rules per pack kind (decided 2026-10-17): stickers WebP or PNG; GIF packs
// GIF or animated WebP. Limits come from config.media.
export function libraryRules(config, kind) {
  return kind === 'sticker'
    ? { types: ['webp', 'png'], ...config.media.sticker }
    : { types: ['gif', 'webp'], animatedWebpOnly: true, ...config.media.gif };
}

// rules: { types: ['webp', ...], maxBytes, maxSide, maxPixels, animatedWebpOnly } (the last three
// optional).
// Returns { type, mime, ext, width, height, animated }; throws ImageRejected with a message
// fit for the person uploading.
export async function checkImage(buffer, rules) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ImageRejected('No file sent.');
  if (buffer.length > rules.maxBytes) {
    throw new ImageRejected(`The file is larger than ${Math.round(rules.maxBytes / 1024)} KB.`);
  }
  const type = sniffFileType(buffer);
  if (!type || !rules.types.includes(type)) {
    throw new ImageRejected(`Allowed file types: ${rules.types.join(', ').toUpperCase()}.`);
  }
  const unreadable = () => new ImageRejected('The file is not a readable image.');
  let meta;
  try {
    meta = await sharp(buffer, { animated: true }).metadata();
  } catch {
    throw unreadable();
  }
  const width = meta.width;
  const height = meta.pageHeight ?? meta.height; // one frame of an animation
  const animated = (meta.pages ?? 1) > 1;
  // From the header, before any decoding: a small file can claim huge dimensions, and decoding
  // it first would cost the memory the limit is there to spare.
  if (rules.maxSide && (width > rules.maxSide || height > rules.maxSide)) {
    throw new ImageRejected(`The image may be at most ${rules.maxSide} px on each side.`);
  }
  if (rules.maxPixels && width * height > rules.maxPixels) {
    throw new ImageRejected(
      `The image may have at most ${rules.maxPixels / 1_000_000} megapixels (width x height).`
    );
  }
  try {
    // The header alone can be intact while the image data is not: decode one frame.
    await sharp(buffer).stats();
  } catch {
    throw unreadable();
  }
  if (rules.animatedWebpOnly && type === 'webp' && !animated) {
    throw new ImageRejected('A WebP in a GIF pack must be animated.');
  }
  return { type, ...IMAGE_TYPES[type], width, height, animated };
}
