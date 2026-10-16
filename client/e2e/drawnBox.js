// ============================================================
// File:        drawnBox.js
// Path:        client/e2e/drawnBox.js
// Project:     Seasonal Entertainment
// Description: Playwright helper: screenshots one element and measures its drawn pixels, i.e.
//              the shape the visitor actually sees: bounding box, centroid and outermost reach.
// ============================================================

// A pixel counts as drawn when any colour channel is clearly below white; this ignores the
// page background and faint anti-aliasing at the very edge.
const DRAWN_BELOW = 235;

// Options select which pixels count:
//   colour       '#rrggbb': only pixels within `tolerance` of it per channel (anti-aliased edge
//                pixels fall outside, symmetrically, so a centroid stays true)
//   from         { x, y } CSS px from the element centre: the point `reach` is measured from
//                (default: the element centre itself)
// Returned lengths are CSS px; `dx`/`dy` are the centroid's offset from the element centre
// (positive = right/below) and `reach` the largest distance of a counted pixel from `from`.
// Used by the e2e tests and by scripts/build-season-marks.mjs.
export async function drawnBox(
  page,
  locator,
  { colour, tolerance = 6, from = { x: 0, y: 0 } } = {}
) {
  const png = await locator.screenshot();
  const { width: cssWidth } = await locator.boundingBox();
  // The PNG is decoded by the browser itself (canvas), so no image library is needed.
  return page.evaluate(
    async ({ base64, cssWidth, threshold, colour, tolerance, from }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);

      const scale = img.width / cssWidth; // device pixels per CSS px
      const target = colour && [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
      const cx = img.width / 2;
      const cy = img.height / 2;
      const rx = cx + from.x * scale;
      const ry = cy + from.y * scale;

      let left = img.width;
      let right = -1;
      let top = img.height;
      let bottom = -1;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let reach = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const drawn = target
            ? target.every((c, k) => Math.abs(data[i + k] - c) <= tolerance)
            : Math.min(data[i], data[i + 1], data[i + 2]) < threshold;
          if (!drawn) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          count += 1;
          sumX += x + 0.5;
          sumY += y + 0.5;
          // Pixel centres sit at +0.5, so distances and the centroid are measured from them.
          reach = Math.max(reach, Math.hypot(x + 0.5 - rx, y + 0.5 - ry));
        }
      }
      const width = right - left + 1;
      const height = bottom - top + 1;
      return {
        width,
        height,
        ratio: width / height,
        dx: count && (sumX / count - cx) / scale,
        dy: count && (sumY / count - cy) / scale,
        reach: reach / scale,
      };
    },
    {
      base64: png.toString('base64'),
      cssWidth,
      threshold: DRAWN_BELOW,
      colour,
      tolerance,
      from,
    }
  );
}
