// ============================================================
// File:        build-brand-images.mjs
// Path:        scripts/build-brand-images.mjs
// Project:     Seasonal Entertainment
// Description: One-off: cuts the site's brand images (docs/DESIGN.md, "Brand images") out of
//              the owner's logo (1254 × 1254, transparent) into client/public/brand/: the full
//              logo with lettering, the round emblem without lettering, and its four quarters
//              (controller, circle of people, balls, play button). Crop boxes from the design
//              reference (docs/design/se-style/README.md), each trimmed to its content, scaled
//              down and saved as WebP with transparency (at most about 200 KB each). The source
//              is only read. Also the banners' faint season-icon pattern (season-pattern.webp:
//              one repeating tile of the four season marks of client/src/assets/seasons/).
//              Usage: node scripts/build-brand-images.mjs "<path to the logo PNG>"
// ============================================================

import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/build-brand-images.mjs "<logo.png>"');
const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client',
  'public',
  'brand'
);
mkdirSync(out, { recursive: true });

// [file, crop box (left, top, right, bottom) in the source's pixels or null, largest width]
const IMAGES = [
  // Twice their largest size on the page: the logo 160 px wide on the login card, the emblem
  // 206 px in the home banner. The quarters show faint (16-26 %) at up to 360 px, where one
  // pixel per pixel is enough (docs/DESIGN.md, "Speed").
  ['logo.webp', null, 320],
  ['emblem.webp', [0, 0, 1254, 1000], 420],
  ['quarter-games.webp', [0, 0, 620, 537], 400], // controller, top left
  ['quarter-chat.webp', [632, 0, 1254, 537], 400], // circle of people, top right
  ['quarter-events.webp', [0, 545, 620, 1000], 400], // football and basketball, bottom left
  ['quarter-calls.webp', [632, 545, 1254, 1000], 400], // play button, bottom right
];

for (const [file, box, maxWidth] of IMAGES) {
  let image = sharp(source);
  if (box) {
    const [left, top, right, bottom] = box;
    image = sharp(
      await image.extract({ left, top, width: right - left, height: bottom - top }).toBuffer()
    );
  }
  // Trim the transparent margin, then scale down (never up) and keep the alpha channel.
  const trimmed = await image.trim().toBuffer();
  await sharp(trimmed)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 86, alphaQuality: 90, effort: 6 })
    .toFile(path.join(out, file));
  await report(file);
}

// The pattern tile: two rows of four 58 px cells, a 44 px mark in each, the second row shifted
// by two so equal marks never stack. Drawn at 2x and shown at 232 × 116 CSS px (brand.css).
const CELL = 116;
const MARK = 88;
const ROWS = [
  ['spring', 'summer', 'autumn', 'winter'],
  ['autumn', 'winter', 'spring', 'summer'],
];
const seasons = path.join(out, '..', '..', 'src', 'assets', 'seasons');
const marks = {};
for (const id of ROWS[0]) {
  marks[id] = await sharp(path.join(seasons, `${id}.svg`))
    .resize(MARK, MARK)
    .toBuffer();
}
const offset = (CELL - MARK) / 2;
await sharp({
  create: {
    width: CELL * 4,
    height: CELL * 2,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(
    ROWS.flatMap((row, y) =>
      row.map((id, x) => ({ input: marks[id], left: x * CELL + offset, top: y * CELL + offset }))
    )
  )
  .webp({ quality: 80, alphaQuality: 80, effort: 6 })
  .toFile(path.join(out, 'season-pattern.webp'));
await report('season-pattern.webp');

async function report(file) {
  const { width, height } = await sharp(path.join(out, file)).metadata();
  console.log(
    `${file}: ${width} × ${height}, ${Math.round(statSync(path.join(out, file)).size / 1024)} KB`
  );
}
