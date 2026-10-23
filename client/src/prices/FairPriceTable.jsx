// ============================================================
// File:        FairPriceTable.jsx
// Path:        client/src/prices/FairPriceTable.jsx
// Project:     Seasonal Entertainment
// Description: The "Fair price" table of /info/prices, as the price bot's /value works it out
//              (fairPrice.js): each season's actual and fair price, how far apart they are,
//              under- or overpriced, and its rank by that distance (only the number, no
//              recommending words; decided 2026-10-23), with a line under the table saying what
//              the rank shows, information only, not financial advice (the Disclaimer). Without
//              the mining rates it says they are not available.
// ============================================================

import { Link } from 'react-router';
import { DISCLAIMER_PATH } from '@seasonal-entertainment/shared/disclaimer.js';
import { fairTable } from './fairPrice.js';
import { TOKENS, formatUsd } from './priceFormat.js';

const nameOf = Object.fromEntries(TOKENS.map((t) => [t.id, t.name]));
const signed = (pct) => `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct).toFixed(0)} %`;

// actual: { season: price }; rates: { season: tokens mined per hour }, or null.
export default function FairPriceTable({ actual, rates }) {
  const rows = rates ? fairTable(actual, rates) : [];
  return (
    <section className="prices__section" aria-labelledby="fair-price">
      <h2 id="fair-price">Fair price</h2>
      {!rates ? (
        <p role="status">The mining rates are not available, so there is no fair price.</p>
      ) : (
        <>
          <p>
            A season mined at half the rate is worth twice as much: fair price = K ÷ mining rate,
            with K = average market price ÷ average of 1 ÷ mining rate over the priced seasons.
          </p>
          <table className="fair-table">
            <thead>
              <tr>
                <th scope="col">Season</th>
                <th scope="col">Actual</th>
                <th scope="col">Fair</th>
                <th scope="col">Deviation</th>
                <th scope="col">Price</th>
                <th scope="col">Rank (vs. fair price)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.season}>
                  <th scope="row">{nameOf[row.season]}</th>
                  <td>{formatUsd(row.actual)}</td>
                  <td>{formatUsd(row.fair)}</td>
                  <td>{signed(row.deviation)}</td>
                  <td className={row.underpriced ? 'price-change--up' : 'price-change--down'}>
                    {row.underpriced ? 'underpriced' : 'overpriced'}
                  </td>
                  <td>{row.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="not-advice">
            The rank only shows how far each price is below or above its calculated fair price.
            Information only — <Link to={DISCLAIMER_PATH}>not financial advice</Link>.
          </p>
        </>
      )}
    </section>
  );
}
