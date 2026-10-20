// ============================================================
// File:        TokenPicker.jsx
// Path:        client/src/prices/TokenPicker.jsx
// Project:     Seasonal Entertainment
// Description: One row of token buttons on /info/prices: each shows a token's latest price and
//              its 24-hour change, the picked one is pressed, and picking one shows its chart.
//              Used for the seasons and for the reference row (ETH, POL).
// ============================================================

import { changeClass, formatChange, formatUsd } from './priceFormat.js';

// label: the group's name; tokens: [{ id, name }]; byToken: latest prices by id.
export default function TokenPicker({ label, tokens, byToken, picked, onPick }) {
  return (
    <div className="prices__tokens" role="group" aria-label={label}>
      {tokens.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`price-pick price-pick--${t.id}`}
          aria-pressed={t.id === picked}
          onClick={() => onPick(t.id)}
        >
          <strong>{t.name}</strong>
          <span>{formatUsd(byToken[t.id]?.price)}</span>
          <small className={changeClass(byToken[t.id]?.change24h)}>
            {formatChange(byToken[t.id]?.change24h)} (24 h)
          </small>
        </button>
      ))}
    </div>
  );
}
