// ============================================================
// File:        seasonMarks.spec.js
// Path:        client/e2e/seasonMarks.spec.js
// Project:     Seasonal Entertainment
// Description: Guards the four season marks on the home page's price tiles (each in a white
//              circle on its token colour), at phone and desktop width:
//              - round: the circle as the visitor sees it is as wide as it is tall within 2 %;
//              - centred: each motif's optical centre is within 1 px of the circle centre;
//              - inside: each motif stays at least 1 px clear of the circle's edge.
//              The circle is page CSS; the mark files carry the centring (no CSS correction).
//              The floating chat button is hidden while the pixels are read.
// ============================================================

import { expect, test } from '@playwright/test';
import { drawnBox } from './drawnBox.js';
import { SEASON_MARKS } from './opticalCentres.js';

// 3x device pixels give about 150 px per mark, so one pixel is well under both tolerances.
test.use({ deviceScaleFactor: 3 });

// Phone and desktop: the tiles sit two and four in a row.
const VIEWPORTS = [
  { name: 'phone', width: 360, height: 780 },
  { name: 'desktop', width: 1280, height: 900 },
];

// The white circle holding the motif: that is the visible mark.
async function openMark(page, viewport, season) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  // The prices arrive after the first paint and change the tiles' height: measure after.
  await page.waitForLoadState('networkidle');
  const circle = page.locator(`.price-tile--${season.id} .price-tile__mark`);
  await circle.locator('img').evaluate((img) => img.decode());
  // The floating chat button lies over the page by design (bottom right); on a phone it can
  // cover a mark, so it is hidden from the pixel checks.
  await page.locator('.chat-launcher').evaluate((button) => (button.style.visibility = 'hidden'));
  await circle.scrollIntoViewIfNeeded();
  return circle;
}

// Paints the tiles white without moving anything: the white circle then disappears and every
// drawn pixel inside it is motif; `circle` paints the circle itself black, so it shows whole.
// Set through the DOM, not an injected <style>: the page's CSP rightly blocks inline styles.
async function paint(page, { circle } = {}) {
  await page.$$eval(
    '.price-tile',
    (tiles, black) =>
      tiles.forEach((tile) => {
        tile.style.setProperty('background', '#ffffff', 'important');
        if (black) tile.querySelector('.price-tile__mark').style.background = '#000000';
      }),
    Boolean(circle)
  );
}

for (const viewport of VIEWPORTS) {
  for (const season of SEASON_MARKS) {
    test(`${season.name} mark is drawn round (${viewport.name})`, async ({ page }) => {
      const mark = await openMark(page, viewport, season);
      await paint(page, { circle: true });

      const { width, height, ratio } = await drawnBox(page, mark);
      expect(width, 'mark drew no pixels').toBeGreaterThan(0);
      expect(ratio, `drawn ${width} x ${height}`).toBeGreaterThanOrEqual(0.98);
      expect(ratio, `drawn ${width} x ${height}`).toBeLessThanOrEqual(1.02);
    });

    test(`${season.name} motif is centred in its circle (${viewport.name})`, async ({ page }) => {
      const mark = await openMark(page, viewport, season);
      await paint(page);

      const { dx, dy } = await drawnBox(page, mark, season.options);
      const off = Math.hypot(dx, dy);
      expect(
        off,
        `${season.centre} off by dx ${dx.toFixed(2)}, dy ${dy.toFixed(2)} px`
      ).toBeLessThanOrEqual(1);
    });

    test(`${season.name} motif sits inside its circle (${viewport.name})`, async ({ page }) => {
      const mark = await openMark(page, viewport, season);
      const { width } = await mark.boundingBox();
      await paint(page);

      // reach = the motif pixel furthest from the circle centre; it must stay 1 px clear of
      // the circle's edge.
      const { reach } = await drawnBox(page, mark);
      const gap = width / 2 - reach;
      expect(gap, `motif-to-edge gap ${gap.toFixed(2)} px`).toBeGreaterThanOrEqual(1);
    });
  }
}
