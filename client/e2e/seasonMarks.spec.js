// ============================================================
// File:        seasonMarks.spec.js
// Path:        client/e2e/seasonMarks.spec.js
// Project:     Seasonal Entertainment
// Description: Guards that each season mark looks round on the landing page: the drawn
//              (non-white) pixels of the mark as the visitor sees it, ring included, must be
//              as wide as they are tall, within 2 %. The ring is page CSS; the motif inside
//              keeps its natural shape and is not measured on its own.
// ============================================================

import { expect, test } from '@playwright/test';
import { drawnBox } from './drawnBox.js';

// 3x device pixels give 170-290 px per mark, so one pixel is well under the 2 % tolerance.
test.use({ deviceScaleFactor: 3 });

// Phone and desktop: the mark size is fluid, so both ends of its range are checked.
const VIEWPORTS = [
  { name: 'phone', width: 360, height: 780 },
  { name: 'desktop', width: 1280, height: 900 },
];

for (const viewport of VIEWPORTS) {
  for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
    test(`${season} mark is drawn round (${viewport.name})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const motif = page.getByAltText(`${season} season mark`);
      await motif.evaluate((img) => img.decode());
      // The list item holds the ring and the motif together: that is the visible mark.
      const mark = page.getByRole('listitem').filter({ has: motif });

      const { width, height, ratio } = await drawnBox(page, mark);
      expect(width, 'mark drew no pixels').toBeGreaterThan(0);
      expect(ratio, `drawn ${width} x ${height}`).toBeGreaterThanOrEqual(0.98);
      expect(ratio, `drawn ${width} x ${height}`).toBeLessThanOrEqual(1.02);
    });
  }
}
