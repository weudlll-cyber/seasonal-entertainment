// ============================================================
// File:        build-app-icons.mjs
// Path:        scripts/build-app-icons.mjs
// Project:     Seasonal Entertainment
// Description: One-off: the installable site's icons (docs/DESIGN.md, "Installable site") from
//              the brand emblem (client/public/brand/emblem.webp, made by
//              build-brand-images.mjs) into client/public/icons/: 192 and 512 px with a
//              transparent background, a maskable 512 px (the emblem inside the 80 % safe zone
//              on the night blue of the manifest's theme colour) and the 180 px Apple touch icon
//              on the page background (iOS shows transparency as black). PNG with a palette.
//              Usage: node scripts/build-app-icons.mjs
// ============================================================

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const client = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public');
const emblem = path.join(client, 'brand', 'emblem.webp');
const out = path.join(client, 'icons');
mkdirSync(out, { recursive: true });

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const NIGHT_BLUE = { r: 12, g: 21, b: 56, alpha: 1 }; // #0c1538, the manifest's theme_color
const PAGE = { r: 251, g: 250, b: 246, alpha: 1 }; // #fbfaf6, --color-background

// [file, canvas size, emblem size, background]
const ICONS = [
  ['icon-192.png', 192, 184, CLEAR],
  ['icon-512.png', 512, 492, CLEAR],
  ['icon-maskable-512.png', 512, 360, NIGHT_BLUE],
  ['apple-touch-icon.png', 180, 160, PAGE],
];

for (const [file, size, inner, background] of ICONS) {
  const fitted = await sharp(emblem)
    .resize(inner, inner, { fit: 'contain', background: CLEAR })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: fitted, gravity: 'center' }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(path.join(out, file));
  console.log(`client/public/icons/${file}`);
}
