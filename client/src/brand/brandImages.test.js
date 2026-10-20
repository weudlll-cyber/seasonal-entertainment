// ============================================================
// File:        brandImages.test.js
// Path:        client/src/brand/brandImages.test.js
// Project:     Seasonal Entertainment
// Description: Keeps the brand images (client/public/brand/, scripts/build-brand-images.mjs)
//              within their budget (docs/DESIGN.md, "Speed"): each at most 60 KB and no wider
//              than twice its largest size on the page.
// ============================================================
// @vitest-environment node
// (Files on disk: in Node, import.meta.url is the file's own address.)

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BRAND = fileURLToPath(new URL('../../public/brand/', import.meta.url));
// file -> largest width in pixels (twice the largest shown size; the quarters show faint)
const IMAGES = {
  'logo.webp': 320,
  'emblem.webp': 420,
  'quarter-games.webp': 400,
  'quarter-chat.webp': 400,
  'quarter-events.webp': 400,
  'quarter-calls.webp': 400,
  'season-pattern.webp': 464,
};

// A WebP's width from its header (VP8X, lossy VP8 or lossless VP8L chunk).
function webpWidth(bytes) {
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return 1 + bytes.readUIntLE(24, 3);
  if (chunk === 'VP8 ') return bytes.readUInt16LE(26) & 0x3fff;
  return 1 + (bytes.readUInt16LE(21) & 0x3fff);
}

describe('brand images', () => {
  it.each(Object.entries(IMAGES))('%s: at most 60 KB and %i px wide', (file, maxWidth) => {
    const full = path.join(BRAND, file);
    expect(statSync(full).size).toBeLessThanOrEqual(60 * 1024);
    expect(webpWidth(readFileSync(full))).toBeLessThanOrEqual(maxWidth);
  });
});
