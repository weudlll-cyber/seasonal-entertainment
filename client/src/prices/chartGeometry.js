// ============================================================
// File:        chartGeometry.js
// Path:        client/src/prices/chartGeometry.js
// Project:     Seasonal Entertainment
// Description: The arithmetic of the hand-built SVG price lines (no chart library): points
//              [x, y] in data units scaled into a box (y grows downwards in SVG, so higher
//              prices sit higher), and the path through them. Used by the sparkline and the
//              chart alike.
// ============================================================

// box: { width, height, pad } in SVG units. Returns the scaled coordinates and the data's
// y range; a flat line (all prices equal) sits in the middle.
export function scalePoints(points, { width, height, pad = 0 }) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x) => pad + (maxX === minX ? 0.5 : (x - minX) / (maxX - minX)) * (width - 2 * pad);
  const sy = (y) =>
    pad + (maxY === minY ? 0.5 : 1 - (y - minY) / (maxY - minY)) * (height - 2 * pad);
  return { coords: points.map(([x, y]) => [sx(x), sy(y)]), minY, maxY };
}

export const linePath = (coords) =>
  coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

// The index of the point whose x lies closest to `x` (coords sorted by x).
export function nearestIndex(coords, x) {
  let best = 0;
  coords.forEach(([cx], i) => {
    if (Math.abs(cx - x) < Math.abs(coords[best][0] - x)) best = i;
  });
  return best;
}
