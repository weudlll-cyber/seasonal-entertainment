// ============================================================
// File:        icons.js
// Path:        server/src/media/icons.js
// Project:     Seasonal Entertainment
// Description: Small icons admins upload (the Discord steps' icons, discord/adminRoutes.js,
//              through the chat handle's images.storeIcon): PNG, WebP or SVG, at most 256 KB. A
//              PNG or WebP passes the one image check (imageCheck.js). An SVG is refused when it
//              could reach out or run anything (a DOCTYPE or entities, scripts, foreign objects,
//              event attributes, links or url() to anything but its own #parts, @import), and
//              is never served as SVG: every icon is drawn once into a 64 x 64 WebP (sharp), and
//              only that file is kept, under a generated name. So no script or outside reference
//              can survive the upload.
// ============================================================

import sharp from 'sharp';
import { saveMediaFile } from './files.js';
import { ImageRejected, checkImage } from './imageCheck.js';

export const ICON_SIDE = 64;
export const ICON_MAX_BYTES = 256 * 1024;
const SOURCE_MAX_SIDE = 2048;

// After an optional XML declaration and comments, the root element is <svg>.
const SVG_START = /^\uFEFF?\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i;
const SVG_FORBIDDEN = [
  [/<!DOCTYPE|<!ENTITY/i, 'a DOCTYPE or entities'],
  [/<script/i, 'scripts'],
  [/<foreignObject/i, 'foreign objects'],
  [/\son[a-z]+\s*=/i, 'event attributes'],
  [/(?:xlink:)?href\s*=\s*["']\s*(?!#)/i, 'links to anything outside the icon'],
  [/url\(\s*["']?\s*(?!#)/i, 'url() to anything outside the icon'],
  [/@import/i, '@import'],
];

const isSvg = (buffer) => SVG_START.test(buffer.subarray(0, 4096).toString('utf8'));

function checkSvg(buffer) {
  const text = buffer.toString('utf8');
  for (const [pattern, what] of SVG_FORBIDDEN) {
    if (pattern.test(text)) throw new ImageRejected(`An SVG icon may not contain ${what}.`);
  }
}

// Returns the stored file's name (subfolder/<32 hex>.webp); throws ImageRejected with a message
// for the admin. maxPixels: the site's image pixel limit (a setting).
export async function storeIcon(config, buffer, subfolder, maxPixels) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ImageRejected('No file sent.');
  if (buffer.length > ICON_MAX_BYTES) {
    throw new ImageRejected(`The file is larger than ${ICON_MAX_BYTES / 1024} KB.`);
  }
  if (isSvg(buffer)) checkSvg(buffer);
  else {
    await checkImage(buffer, {
      types: ['png', 'webp'],
      maxBytes: ICON_MAX_BYTES,
      maxSide: SOURCE_MAX_SIDE,
      maxPixels,
    });
  }
  let icon;
  try {
    icon = await sharp(buffer, { limitInputPixels: maxPixels })
      .resize(ICON_SIDE, ICON_SIDE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp()
      .toBuffer();
  } catch {
    throw new ImageRejected('The file is not a readable image.');
  }
  return saveMediaFile(config, icon, 'webp', subfolder);
}
