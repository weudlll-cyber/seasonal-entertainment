// ============================================================
// File:        chartGeometry.js
// Path:        client/src/prices/chartGeometry.js
// Project:     Seasonal Entertainment
// Description: The arithmetic of the hand-built SVG price lines (no chart library): several
//              lines of points [x, y] in data units scaled into one box on shared scales (y grows
//              downwards in SVG, so higher values sit higher), the path through a line, broken
//              where the data has a gap, and the point nearest a position. Used by the
//              sparkline and the chart alike.
// ============================================================

// box: { width, height, pad } in SVG units. lines: [[x, y], ...] each. Returns per line its
// coordinates, plus the data range and the scales both ways (x to data and back); a flat
// range sits in the middle.
export function scaleSeries(lines, { width, height, pad = 0 }) {
  const all = lines.flat();
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x) => pad + (maxX === minX ? 0.5 : (x - minX) / (maxX - minX)) * (width - 2 * pad);
  const sy = (y) =>
    pad + (maxY === minY ? 0.5 : 1 - (y - minY) / (maxY - minY)) * (height - 2 * pad);
  // From a horizontal position back to the data's x (the pointer's time on the chart).
  const xAt = (px) => minX + ((px - pad) / (width - 2 * pad)) * (maxX - minX);
  return {
    lines: lines.map((points) => points.map(([x, y]) => [sx(x), sy(y)])),
    minX,
    maxX,
    minY,
    maxY,
    sy,
    xAt,
  };
}

// One line on its own scales (the sparkline): { coords, minY, maxY }.
export function scalePoints(points, box) {
  const { lines, minY, maxY } = scaleSeries([points], box);
  return { coords: lines[0], minY, maxY };
}

// The path through the coordinates; `breaks` (indexes) start a new piece, leaving a gap.
export const linePath = (coords, breaks = new Set()) =>
  coords
    .map(([x, y], i) => `${i === 0 || breaks.has(i) ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');

// Indexes where the data jumps more than maxGap in x: no line is drawn across such a gap.
export function gapsIn(points, maxGap) {
  const breaks = new Set();
  points.forEach(([x], i) => {
    if (i > 0 && x - points[i - 1][0] > maxGap) breaks.add(i);
  });
  return breaks;
}

// The index of the point whose x lies closest to `x` (points sorted by x).
export function nearestIndex(points, x) {
  let best = 0;
  points.forEach(([px], i) => {
    if (Math.abs(px - x) < Math.abs(points[best][0] - x)) best = i;
  });
  return best;
}
