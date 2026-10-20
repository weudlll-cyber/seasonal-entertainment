// ============================================================
// File:        Converter.jsx
// Path:        client/src/prices/Converter.jsx
// Project:     Seasonal Entertainment
// Description: The converter of /info/prices, as the price bot's /swap works it out
//              (fairPrice.js): an amount of one token in another at their prices, and for each
//              side that is a season how long mining that many takes. ETH (no mining time) is
//              offered only while its price is connected; without the mining rates the
//              conversion still works and the mining times say they are not available.
// ============================================================

import { useId, useState } from 'react';
import { convert, formatHours } from './fairPrice.js';
import { TOKENS } from './priceFormat.js';

const ETH = { id: 'eth', name: 'ETH' };

// A converted amount: four decimals as the bot shows them, more significant digits below 1.
const amountText = (value) =>
  value >= 1
    ? value.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : value.toLocaleString('en-US', { maximumSignificantDigits: 6 });

// prices: { spring, summer, autumn, winter, eth? } in US dollars; rates: tokens mined per hour
// per season, or null.
export default function Converter({ prices, rates }) {
  const tokens = [...TOKENS, ...(prices.eth ? [ETH] : [])].filter((t) => prices[t.id]);
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('summer');
  const [to, setTo] = useState('winter');
  const id = useId();
  const name = (id) => tokens.find((t) => t.id === id)?.name;
  const value = Number(amount);
  const ready = value > 0 && name(from) && name(to);
  const result = ready ? convert(value, from, to, prices, rates) : null;

  // Labels beside their controls (htmlFor), not around them: a wrapping label would put the
  // options' text, or the typed amount, into the control's accessible name.
  const picker = (label, current, onChange) => (
    <div className="form-field">
      <label className="form-field__label" htmlFor={`${id}-${label}`}>
        {label}
      </label>
      <select id={`${id}-${label}`} value={current} onChange={(e) => onChange(e.target.value)}>
        {tokens.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <section className="prices__section" aria-labelledby="converter">
      <h2 id="converter">Converter</h2>
      <div className="converter">
        <div className="form-field">
          <label className="form-field__label" htmlFor={`${id}-amount`}>
            Amount
          </label>
          <input
            id={`${id}-amount`}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {picker('From', from, setFrom)}
        {picker('To', to, setTo)}
      </div>
      {result && (
        <div className="converter__result" aria-live="polite">
          <p>
            <strong>
              {amountText(value)} {name(from)} ≈ {amountText(result.converted)} {name(to)}
            </strong>
          </p>
          {rates ? (
            <ul>
              {result.hoursFrom !== null && (
                <li>
                  Mining time ({name(from)}): {formatHours(result.hoursFrom)}
                </li>
              )}
              {result.hoursTo !== null && (
                <li>
                  Mining time ({name(to)}): {formatHours(result.hoursTo)}
                </li>
              )}
            </ul>
          ) : (
            <p role="status">Mining times: the mining rates are not available.</p>
          )}
        </div>
      )}
      {!prices.eth && <p className="prices__note">ETH is not connected, so only the seasons.</p>}
    </section>
  );
}
