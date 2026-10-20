// ============================================================
// File:        TokenPicker.jsx
// Path:        client/src/prices/TokenPicker.jsx
// Project:     Seasonal Entertainment
// Description: One row of coin buttons on /info/prices: each shows a coin's latest price and
//              its 24-hour change, and toggles whether the chart shows it (pressed: shown). A
//              coin without a price cannot be picked. Used for the seasons and for the reference
//              row (ETH, POL, BTC).
// ============================================================

import { changeClass, formatChange, formatUsd } from './priceFormat.js';

// label: the group's name; tokens: [{ id, name }]; byToken: latest prices by id; selected:
// the ids shown; onToggle(id).
export default function TokenPicker({ label, tokens, byToken, selected, onToggle }) {
  return (
    <div className="prices__tokens" role="group" aria-label={label}>
      {tokens.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`price-pick coin--${t.id}`}
          aria-pressed={selected.includes(t.id)}
          disabled={!byToken[t.id]}
          onClick={() => onToggle(t.id)}
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
