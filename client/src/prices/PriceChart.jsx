// ============================================================
// File:        PriceChart.jsx
// Path:        client/src/prices/PriceChart.jsx
// Project:     Seasonal Entertainment
// Description: One token's price line, hand-built SVG in the season's colour token (no chart
//              library): the highest and lowest price of the range at the left, its first and
//              last time below. Pointing at the line (or arrow keys, Home and End once it has
//              focus) marks the nearest snapshot and shows its price and local time.
// ============================================================

import { useState } from 'react';
import { linePath, nearestIndex, scalePoints } from './chartGeometry.js';
import { formatPriceTime, formatUsd } from './priceFormat.js';

const BOX = { width: 640, height: 260, pad: 12 };
const STEP_KEYS = { ArrowLeft: -1, ArrowRight: 1 };

// points: [[ms, price], ...] oldest first; name: the token's name; withDate: show dates.
export default function PriceChart({ points, token, name, withDate, timeZone }) {
  const [marked, setMarked] = useState(null); // index of the marked snapshot
  if (points.length < 2) return <p>Not enough prices in this range yet.</p>;
  const { coords, minY, maxY } = scalePoints(points, BOX);
  const at = marked === null ? null : Math.min(marked, points.length - 1);
  const time = (ms) => formatPriceTime(ms, withDate, timeZone);

  function pointAt(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / (rect.width || 1)) * BOX.width;
    setMarked(nearestIndex(coords, x));
  }

  function onKeyDown(event) {
    const last = points.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key in STEP_KEYS
            ? Math.max(0, Math.min(last, (at ?? last) + STEP_KEYS[event.key]))
            : null;
    if (next === null) return;
    event.preventDefault();
    setMarked(next);
  }

  return (
    <figure className={`price-chart price-chart--${token}`}>
      <div className="price-chart__frame">
        <div className="price-chart__axis" aria-hidden="true">
          <span>{formatUsd(maxY)}</span>
          <span>{formatUsd(minY)}</span>
        </div>
        <div className="price-chart__plot">
          {/* The line stretches with the frame; the mark is HTML on top, so the dot stays round. */}
          <svg
            className="price-chart__svg"
            viewBox={`0 0 ${BOX.width} ${BOX.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${name} price from ${time(points[0][0])} to ${time(points.at(-1)[0])}`}
            tabIndex={0}
            onPointerMove={pointAt}
            onPointerLeave={() => setMarked(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setMarked(null)}
          >
            <path
              className="price-chart__line"
              d={linePath(coords)}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {at !== null && (
            <span
              className="price-chart__mark"
              aria-hidden="true"
              style={{
                left: `${(coords[at][0] / BOX.width) * 100}%`,
                top: `${(coords[at][1] / BOX.height) * 100}%`,
              }}
            />
          )}
        </div>
      </div>
      <div className="price-chart__times" aria-hidden="true">
        <span>{time(points[0][0])}</span>
        <span>{time(points.at(-1)[0])}</span>
      </div>
      <figcaption className="price-chart__readout" aria-live="polite">
        {at === null
          ? 'Point at the line, or focus it and use the arrow keys, to read a price.'
          : `${formatUsd(points[at][1])} at ${time(points[at][0])}`}
      </figcaption>
    </figure>
  );
}
