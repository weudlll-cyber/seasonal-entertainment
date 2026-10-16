// ============================================================
// File:        seasonMarks.spec.js
// Path:        client/e2e/seasonMarks.spec.js
// Project:     Seasonal Entertainment
// Description: Guards that each season mark is drawn round on the landing page: the drawn
//              (non-white) pixels of every mark must be as wide as they are tall, within 2 %.
//              The source artwork is not round by itself; the mark files carry a correction.
// ============================================================

import { expect, test } from '@playwright/test';
import { drawnBox } from './drawnBox.js';

// 3x device pixels give about 290 px per mark, so one pixel is well under the 2 % tolerance.
test.use({ deviceScaleFactor: 3 });

for (const season of ['Spring', 'Summer', 'Autumn', 'Winter']) {
  test(`${season} mark is drawn round`, async ({ page }) => {
    await page.goto('/');
    const mark = page.getByAltText(`${season} season mark`);
    await mark.evaluate((img) => img.decode());

    const { width, height, ratio } = await drawnBox(page, mark);
    expect(width, 'mark drew no pixels').toBeGreaterThan(0);
    expect(ratio, `drawn ${width} x ${height}`).toBeGreaterThanOrEqual(0.98);
    expect(ratio, `drawn ${width} x ${height}`).toBeLessThanOrEqual(1.02);
  });
}
