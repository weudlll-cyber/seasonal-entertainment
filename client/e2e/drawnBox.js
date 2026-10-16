// ============================================================
// File:        drawnBox.js
// Path:        client/e2e/drawnBox.js
// Project:     Seasonal Entertainment
// Description: Playwright helper: screenshots one element and returns the bounding box of its
//              drawn (non-white) pixels, i.e. the shape the visitor actually sees.
// ============================================================

// A pixel counts as drawn when any colour channel is clearly below white; this ignores the
// page background and faint anti-aliasing at the very edge.
const DRAWN_BELOW = 235;

export async function drawnBox(page, locator) {
  const png = await locator.screenshot();
  // The PNG is decoded by the browser itself (canvas), so no image library is needed.
  return page.evaluate(
    async ({ base64, threshold }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      let left = img.width;
      let right = -1;
      let top = img.height;
      let bottom = -1;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          if (Math.min(data[i], data[i + 1], data[i + 2]) < threshold) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      const width = right - left + 1;
      const height = bottom - top + 1;
      return { width, height, ratio: width / height };
    },
    { base64: png.toString('base64'), threshold: DRAWN_BELOW }
  );
}
