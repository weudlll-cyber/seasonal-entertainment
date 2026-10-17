// ============================================================
// File:        process.js
// Path:        server/src/uploads/process.js
// Project:     Seasonal Entertainment
// Description: Turns an uploaded chat file into what is stored. The real type comes from the
//              content (the media validator; PDF by its signature). Images are re-encoded:
//              turned upright by their orientation tag, every metadata block (EXIF with GPS,
//              XMP, comments) dropped, animation kept, plus a thumbnail for the chat. PDFs are
//              stored as they are (served only as a download). Names on disk are generated; the
//              original file name survives only as cleaned-up display text.
// ============================================================

import path from 'node:path';
import sharp from 'sharp';
import { saveMediaFile } from '../media/files.js';
import { FILE_TYPES, ImageRejected, checkImage, sniffFileType } from '../media/imageCheck.js';

export const UPLOAD_TYPES = ['jpeg', 'png', 'webp', 'gif', 'pdf'];
const SUBFOLDER = 'uploads';

const ENCODE = {
  jpeg: (image) => image.jpeg({ quality: 85 }),
  png: (image) => image.png(),
  webp: (image) => image.webp(),
  gif: (image) => image.gif(),
};

// Display text only: no path, control characters as spaces, collapsed spaces, capped length.
export function displayName(raw, max) {
  const base = path.basename(String(raw ?? '').replace(/\\/g, '/'));
  const clean = [...base]
    .map((char) => (char.codePointAt(0) < 0x20 || char.codePointAt(0) === 0x7f ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'file';
  if (clean.length <= max) return clean;
  const ext = path.extname(clean).slice(0, 10);
  return `${clean.slice(0, max - ext.length - 1).trimEnd()}…${ext}`;
}

async function storeImage(buffer, type, config) {
  const animated = type === 'gif' || type === 'webp';
  // rotate() without an angle applies the orientation tag; output carries no metadata.
  const image = () => sharp(buffer, { animated }).rotate();
  const full = await ENCODE[type](image()).toBuffer({ resolveWithObject: true });
  const thumb = await ENCODE[type](
    image().resize({ width: config.uploads.thumbWidth, withoutEnlargement: true })
  ).toBuffer();
  const { ext } = FILE_TYPES[type];
  return {
    kind: 'image',
    file: saveMediaFile(config, full.data, ext, SUBFOLDER),
    thumbFile: saveMediaFile(config, thumb, ext, SUBFOLDER),
    width: full.info.width,
    height: full.info.pageHeight ?? full.info.height,
  };
}

// Returns the row to store ({ kind, name, mime, bytes, file, thumbFile, width, height });
// throws ImageRejected with a message for the member.
export async function processUpload(buffer, originalName, config) {
  const { maxBytes, nameMax } = config.uploads;
  const type = Buffer.isBuffer(buffer) ? sniffFileType(buffer) : null;
  if (!type || !UPLOAD_TYPES.includes(type)) {
    throw new ImageRejected('Allowed files: JPG, PNG, WebP, GIF and PDF.');
  }
  if (buffer.length > maxBytes) {
    throw new ImageRejected(`The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const name = displayName(originalName, nameMax);
  const { mime, ext } = FILE_TYPES[type];
  if (type === 'pdf') {
    return {
      kind: 'pdf',
      name,
      mime,
      bytes: buffer.length,
      file: saveMediaFile(config, buffer, ext, SUBFOLDER),
    };
  }
  await checkImage(buffer, { types: [type], maxBytes });
  return { name, mime, bytes: buffer.length, ...(await storeImage(buffer, type, config)) };
}
