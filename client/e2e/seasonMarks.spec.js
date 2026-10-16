// ============================================================
// File:        seasonMarks.spec.js
// Path:        client/e2e/seasonMarks.spec.js
// Project:     Seasonal Entertainment
// Description: Guards the four season marks on the landing page, at phone and desktop width:
//              - round: the mark as the visitor sees it, ring included, is as wide as it is
//                tall within 2 %;
//              - centred: each motif's optical centre is within 1 px of the ring centre;
//              - inside: each motif stays at least 1 px clear of the ring's inner edge.
//              The ring is page CSS; the mark files carry the centring (no CSS correction).
// ============================================================

import { expect, test } from '@playwright/test';
import { drawnBox } from './drawnBox.js';
import { SEASON_MARKS } from './opticalCentres.js';

// 3x device pixels give 170-290 px per mark, so one pixel is well under both tolerances.
test.use({ deviceScaleFactor: 3 });

// Phone and desktop: the mark size is fluid, so both ends of its range are checked.
const VIEWPORTS = [
  { name: 'phone', width: 360, height: 780 },
  { name: 'desktop', width: 1280, height: 900 },
];

// The list item holds the ring and the motif together: that is the visible mark.
async function openMark(page, viewport, season) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  const motif = page.getByAltText(`${season} season mark`);
  await motif.evaluate((img) => img.decode());
  return page.getByRole('listitem').filter({ has: motif });
}

// Hides the ring (same colour as some motifs) without moving anything: the border keeps its
// width, so the element centre is still the ring centre and every drawn pixel is motif.
async function hideRing(page) {
  await page.addStyleTag({ content: '.landing__season { border-color: transparent !important; }' });
}

for (const viewport of VIEWPORTS) {
  for (const season of SEASON_MARKS) {
    test(`${season.name} mark is drawn round (${viewport.name})`, async ({ page }) => {
      const mark = await openMark(page, viewport, season.name);

      const { width, height, ratio } = await drawnBox(page, mark);
      expect(width, 'mark drew no pixels').toBeGreaterThan(0);
      expect(ratio, `drawn ${width} x ${height}`).toBeGreaterThanOrEqual(0.98);
      expect(ratio, `drawn ${width} x ${height}`).toBeLessThanOrEqual(1.02);
    });

    test(`${season.name} motif is centred in its ring (${viewport.name})`, async ({ page }) => {
      const mark = await openMark(page, viewport, season.name);
      await hideRing(page);

      const { dx, dy } = await drawnBox(page, mark, season.options);
      const off = Math.hypot(dx, dy);
      expect(
        off,
        `${season.centre} off by dx ${dx.toFixed(2)}, dy ${dy.toFixed(2)} px`
      ).toBeLessThanOrEqual(1);
    });

    test(`${season.name} motif sits inside its ring (${viewport.name})`, async ({ page }) => {
      const mark = await openMark(page, viewport, season.name);
      const { width } = await mark.boundingBox();
      const ringWidth = await mark.evaluate((li) =>
        parseFloat(getComputedStyle(li).borderTopWidth)
      );
      await hideRing(page);

      // reach = the motif pixel furthest from the ring centre; it must stay 1 px clear of
      // the ring's inner edge.
      const { reach } = await drawnBox(page, mark);
      const gap = width / 2 - ringWidth - reach;
      expect(gap, `motif-to-ring gap ${gap.toFixed(2)} px`).toBeGreaterThanOrEqual(1);
    });
  }
}
