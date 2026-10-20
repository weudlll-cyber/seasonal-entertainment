// ============================================================
// File:        PricesPage.jsx
// Path:        client/src/prices/PricesPage.jsx
// Project:     Seasonal Entertainment
// Description: /info/prices, in the "Seasonal Tokens" section: the four tokens' latest prices
//              (a token picker showing price and 24-hour change) and the picked token's chart
//              over 24 hours, 7 days, 30 days, a year or everything (docs/BOTS.md); then the
//              fair price and the converter with mining times, as the price bot's /value and
//              /swap (FairPriceTable.jsx, Converter.jsx). The data is the price bot's, read by
//              the server; without it the page says so plainly. timeZone is a prop so tests
//              can pin it.
// ============================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import Converter from './Converter.jsx';
import FairPriceTable from './FairPriceTable.jsx';
import PriceChart from './PriceChart.jsx';
import {
  RANGES,
  RANGE_LABELS,
  TOKENS,
  changeClass,
  formatChange,
  formatUsd,
} from './priceFormat.js';
import './prices.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function PricesPage({ timeZone = deviceZone() }) {
  const [latest, setLatest] = useState(null); // { connected, prices }
  const [token, setToken] = useState('spring');
  const [range, setRange] = useState('7d');
  const [history, setHistory] = useState(null); // { token, range, points }
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/prices')
      .then(setLatest)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!latest?.connected) return;
    api(`/prices/${token}?range=${range}`)
      .then((data) => {
        setHistory(data);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [latest, token, range]);

  const byToken = Object.fromEntries((latest?.prices ?? []).map((p) => [p.token, p]));
  const actual = Object.fromEntries((latest?.prices ?? []).map((p) => [p.token, p.price]));
  const picked = TOKENS.find((t) => t.id === token);
  // An answer for an earlier pick is not shown while the new one loads.
  const shown = history?.token === token && history?.range === range ? history : null;

  return (
    <section className="page prices">
      <p>
        <Link to="/info">Seasonal Tokens</Link>
      </p>
      <h1>Prices</h1>
      <FormMessage error={error} />
      {latest && !latest.connected && (
        <p role="status">The price data source is not connected, so there are no prices to show.</p>
      )}
      {latest?.connected && (
        <>
          <p>
            In US dollars, from the Seasonal Tokens price bot (one price per hour). Times are in
            your time zone (<strong>{timeZone}</strong>).
          </p>
          <div className="prices__tokens" role="group" aria-label="Token">
            {TOKENS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`price-pick price-pick--${t.id}`}
                aria-pressed={t.id === token}
                onClick={() => setToken(t.id)}
              >
                <strong>{t.name}</strong>
                <span>{formatUsd(byToken[t.id]?.price)}</span>
                <small className={changeClass(byToken[t.id]?.change24h)}>
                  {formatChange(byToken[t.id]?.change24h)} (24 h)
                </small>
              </button>
            ))}
          </div>
          <div className="prices__ranges" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className="button button--secondary"
                aria-pressed={r === range}
                onClick={() => setRange(r)}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {shown ? (
            <PriceChart
              points={shown.points}
              token={token}
              name={picked.name}
              timeZone={timeZone}
            />
          ) : (
            !error && <p>Loading…</p>
          )}
          <FairPriceTable actual={actual} rates={latest.miningRates} />
          <Converter prices={actual} rates={latest.miningRates} />
        </>
      )}
    </section>
  );
}
