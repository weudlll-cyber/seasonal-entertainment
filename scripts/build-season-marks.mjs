// ============================================================
// File:        build-season-marks.mjs
// Path:        scripts/build-season-marks.mjs
// Project:     Seasonal Entertainment
// Description: `npm run marks:build`: regenerates the four web-ready season marks in
//              client/src/assets/seasons/ from the originals in .../seasons/source/.
//              Each output is square, has its motif's optical centre at the exact centre and
//              its farthest drawn point on one shared radius, so all four have the same size.
//              Only a wrapping <g transform> (translate + uniform scale) and the root viewBox
//              are new; the original paths are kept, then the file is optimised with SVGO.
//              Needs the Playwright Chromium used by the browser tests (it measures pixels).
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { optimize } from 'svgo';
import { drawnBox } from '../client/e2e/drawnBox.js';
import { SEASON_MARKS } from '../client/e2e/opticalCentres.js';

const SOURCE_DIR = 'client/src/assets/seasons/source';
const OUT_DIR = 'client/src/assets/seasons';
// Added to the largest reach so anti-aliased edge pixels are never clipped by the viewBox.
const EDGE_ALLOWANCE = 2;

// Default preset minus the plugins that would change structure or drawing: keep the one
// wrapping group and its readable transform, and never merge paths (could alter fills).
// Path data is rewritten losslessly enough: 4 decimals, and curves are never swapped for
// lines or arcs (that substitution moved anti-aliased edge pixels).
const SVGO_CONFIG = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          collapseGroups: false,
          moveGroupAttrsToElems: false,
          moveElemsAttrsToGroup: false,
          convertTransform: false,
          mergePaths: false,
          convertPathData: { floatPrecision: 4, makeArcs: false, straightCurves: false },
        },
      },
    },
  ],
};

const round = (n) => Math.round(n * 1000) / 1000;

// Renders an SVG at 1 CSS px per user unit on white, so drawnBox lengths are SVG units.
async function measure(page, svg, width, height, options) {
  await page.setViewportSize({ width: Math.ceil(width), height: Math.ceil(height) });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(
    `<body style="margin:0;background:#fff"><img src="${src}" width="${width}" height="${height}" style="display:block"></body>`
  );
  const img = page.locator('img');
  await img.evaluate((el) => el.decode());
  const centre = await drawnBox(page, img, options);
  const { reach } = await drawnBox(page, img, { from: { x: centre.dx, y: centre.dy } });
  return { dx: centre.dx, dy: centre.dy, reach };
}

function parseOriginal(svg) {
  const root = svg.match(/<svg\b[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"[^>]*>/);
  if (!root) throw new Error('original has no <svg width height> root');
  const body = svg.slice(svg.indexOf(root[0]) + root[0].length, svg.lastIndexOf('</svg>'));
  return { width: Number(root[1]), height: Number(root[2]), body };
}

const browser = await chromium.launch();
const page = await browser.newPage();

// Pass 1: optical centre and farthest drawn point of every original.
const marks = [];
for (const mark of SEASON_MARKS) {
  const original = readFileSync(`${SOURCE_DIR}/${mark.id}.svg`, 'utf8');
  const { width, height, body } = parseOriginal(original);
  const m = await measure(page, original, width, height, mark.options);
  marks.push({ ...mark, body, bytesBefore: Buffer.byteLength(original), ...m, width, height });
}

// One shared radius: the largest motif keeps scale 1, the others are scaled up to it.
const radius = Math.ceil(Math.max(...marks.map((m) => m.reach))) + EDGE_ALLOWANCE;
const size = 2 * radius;
console.log(`shared radius ${radius} units, square viewBox ${size} x ${size}\n`);

// Pass 2: write each mark, then re-measure the written file as a check.
for (const m of marks) {
  const cx = m.width / 2 + m.dx;
  const cy = m.height / 2 + m.dy;
  const scale = (radius - EDGE_ALLOWANCE) / m.reach;
  // Optical centre (cx, cy) → (radius, radius), scaled uniformly about it.
  const tx = round(radius - scale * cx);
  const ty = round(radius - scale * cy);
  const raw =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<g transform="translate(${tx} ${ty}) scale(${round(scale)})">${m.body}</g></svg>`;
  const { data } = optimize(raw, SVGO_CONFIG);
  writeFileSync(`${OUT_DIR}/${m.id}.svg`, data);

  const check = await measure(page, data, size, size, m.options);
  console.log(
    `${m.id.padEnd(7)} optical centre ${round(m.dx)}, ${round(m.dy)} from canvas centre; ` +
      `reach ${round(m.reach)} → scale ${round(scale)}, translate ${tx} ${ty}; ` +
      `${m.bytesBefore} → ${Buffer.byteLength(data)} bytes; ` +
      `check: centre off ${round(check.dx)}, ${round(check.dy)}, reach ${round(check.reach)}`
  );
}

await browser.close();
