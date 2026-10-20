// ============================================================
// File:        Sparkline.jsx
// Path:        client/src/prices/Sparkline.jsx
// Project:     Seasonal Entertainment
// Description: A token's last day of prices as a small line beside its price on the home
//              page: decoration only (the price and the change are the text), in the season's
//              colour token.
// ============================================================

import { linePath, scalePoints } from './chartGeometry.js';

const BOX = { width: 80, height: 24, pad: 2 };

// values: prices, oldest first; token: the season id (its colour).
export default function Sparkline({ values, token }) {
  if (!values || values.length < 2) return null;
  const { coords } = scalePoints(
    values.map((v, i) => [i, v]),
    BOX
  );
  return (
    <svg
      className={`sparkline coin--${token}`}
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      width={BOX.width}
      height={BOX.height}
      aria-hidden="true"
      focusable="false"
    >
      <path d={linePath(coords)} />
    </svg>
  );
}
