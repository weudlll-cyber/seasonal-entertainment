// ============================================================
// File:        PriceChart.jsx
// Path:        client/src/prices/PriceChart.jsx
// Project:     Seasonal Entertainment
// Description: The price chart of /info/prices, hand-built SVG (no chart library), for one coin
//              or several. One coin: its price in US dollars. Several: each coin's % change since
//              its first point in the range (so coins of very different prices compare), with a
//              0 % line. Each coin's line in its own colour token, a legend below; the coins are
//              aligned by time, and a coin with no points in part of the range has no line there.
//              Pointing at the chart (or arrow keys, Home and End once it has focus) marks a time
//              and reads out each coin's price there, and its % change when several are shown.
// ============================================================

import { useState } from 'react';
import { gapsIn, linePath, nearestIndex, scaleSeries } from './chartGeometry.js';
import { formatWhen } from '../app/dates.js';
import { formatChange, formatUsd } from './priceFormat.js';

const BOX = { width: 640, height: 260, pad: 12 };
const STEP_KEYS = { ArrowLeft: -1, ArrowRight: 1 };
// Further apart than this (the data is hourly, or daily beyond 90 days): no data in between.
const MAX_GAP_MS = 2 * 24 * 60 * 60_000;

// series: [{ token, name, points: [[ms, price], ...] oldest first }], one or more.
export default function PriceChart({ series, timeZone }) {
  const [marked, setMarked] = useState(null); // index into the shared timeline
  const compare = series.length > 1;
  // In a comparison each coin is indexed to its first point in the range: % change since then.
  const values = series.map(({ points }) =>
    compare ? points.map(([t, p]) => [t, (p / points[0][1] - 1) * 100]) : points
  );
  // Every time any coin has a price, in order: what the pointer and the arrow keys step along.
  const timeline = [...new Set(series.flatMap((s) => s.points.map(([t]) => t)))].sort(
    (a, b) => a - b
  );
  if (timeline.length < 2) return <p>Not enough prices in this range yet.</p>;
  const scaled = scaleSeries(values, BOX);
  const time = (ms) => formatWhen(ms, timeZone);
  const at = marked === null ? null : timeline[Math.min(marked, timeline.length - 1)];
  // Each coin's point at the marked time: its nearest, unless it has no data around then.
  const pointsAt = (ms) =>
    series.map(({ points }, i) => {
      if (points.length === 0) return null;
      const index = nearestIndex(points, ms);
      return Math.abs(points[index][0] - ms) > MAX_GAP_MS ? null : { index, line: i };
    });
  const found = at === null ? [] : pointsAt(at);
  const unit = compare ? `% change since ${time(scaled.minX)}` : 'US dollars';
  const label = compare
    ? `Comparison of ${series.map((s) => s.name).join(', ')}: % change from ${time(scaled.minX)} to ${time(scaled.maxX)}`
    : `${series[0].name} price from ${time(scaled.minX)} to ${time(scaled.maxX)}`;

  function pointAt(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / (rect.width || 1)) * BOX.width;
    setMarked(
      nearestIndex(
        timeline.map((t) => [t]),
        scaled.xAt(px)
      )
    );
  }

  function onKeyDown(event) {
    const last = timeline.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key in STEP_KEYS
            ? Math.max(0, Math.min(last, (marked ?? last) + STEP_KEYS[event.key]))
            : null;
    if (next === null) return;
    event.preventDefault();
    setMarked(next);
  }

  return (
    <figure className="price-chart">
      <h3 className="price-chart__title">{compare ? 'Comparison' : series[0].name}</h3>
      <p className="price-chart__unit">{unit}</p>
      <div className="price-chart__frame">
        <div className="price-chart__axis" aria-hidden="true">
          <span>{compare ? formatChange(scaled.maxY / 100) : formatUsd(scaled.maxY)}</span>
          <span>{compare ? formatChange(scaled.minY / 100) : formatUsd(scaled.minY)}</span>
        </div>
        <div className="price-chart__plot">
          {/* The lines stretch with the frame; the marks are HTML on top, so dots stay round. */}
          <svg
            className="price-chart__svg"
            viewBox={`0 0 ${BOX.width} ${BOX.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={label}
            tabIndex={0}
            onPointerMove={pointAt}
            onPointerLeave={() => setMarked(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setMarked(null)}
          >
            {compare && (
              <line
                className="price-chart__zero"
                x1={0}
                x2={BOX.width}
                y1={scaled.sy(0)}
                y2={scaled.sy(0)}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {series.map(({ token, points }, i) => (
              <path
                key={token}
                className={`price-chart__line coin--${token}`}
                d={linePath(scaled.lines[i], gapsIn(points, MAX_GAP_MS))}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {found.map(
            (hit) =>
              hit && (
                <span
                  key={series[hit.line].token}
                  className={`price-chart__mark coin--${series[hit.line].token}`}
                  aria-hidden="true"
                  style={{
                    left: `${(scaled.lines[hit.line][hit.index][0] / BOX.width) * 100}%`,
                    top: `${(scaled.lines[hit.line][hit.index][1] / BOX.height) * 100}%`,
                  }}
                />
              )
          )}
        </div>
      </div>
      <div className="price-chart__times" aria-hidden="true">
        <span>{time(scaled.minX)}</span>
        <span>{time(scaled.maxX)}</span>
      </div>
      <ul className="price-chart__legend" aria-label="Legend">
        {series.map(({ token, name, points }) => (
          <li key={token}>
            <span className={`price-chart__swatch coin--${token}`} aria-hidden="true" />
            {name}
            {points.length === 0 && ' (no prices in this range)'}
          </li>
        ))}
      </ul>
      <figcaption className="price-chart__readout" aria-live="polite">
        {at === null ? (
          'Point at the chart, or focus it and use the arrow keys, to read the prices.'
        ) : !compare ? (
          `${formatUsd(series[0].points[found[0].index][1])} at ${time(series[0].points[found[0].index][0])}`
        ) : (
          <>
            At {time(at)}:
            <ul>
              {found.map(
                (hit) =>
                  hit && (
                    <li key={series[hit.line].token}>
                      {series[hit.line].name}: {formatUsd(series[hit.line].points[hit.index][1])} (
                      {formatChange(values[hit.line][hit.index][1] / 100)})
                    </li>
                  )
              )}
            </ul>
          </>
        )}
      </figcaption>
    </figure>
  );
}
