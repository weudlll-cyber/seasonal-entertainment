// ============================================================
// File:        PricesPage.jsx
// Path:        client/src/prices/PricesPage.jsx
// Project:     Seasonal Entertainment
// Description: /info/prices, in the "Seasonal Tokens" section: the four seasons' latest prices
//              (from the price bot) and a reference row with ETH and POL (from CoinGecko, with
//              its attribution), each a button showing price and 24-hour change; the picked
//              token's chart over 24 hours, 7 days, 30 days, a year or everything; then the fair
//              price and the converter with mining times, as the price bot's /value and /swap
//              (FairPriceTable.jsx, Converter.jsx; docs/BOTS.md). A source that is not connected
//              says so plainly. timeZone is a prop so tests can pin it.
// ============================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import Converter from './Converter.jsx';
import FairPriceTable from './FairPriceTable.jsx';
import PriceChart from './PriceChart.jsx';
import { RANGES, RANGE_LABELS, REFERENCE, TOKENS } from './priceFormat.js';
import TokenPicker from './TokenPicker.jsx';
import './prices.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const isReference = (id) => REFERENCE.some((t) => t.id === id);
const byId = (answer) => Object.fromEntries((answer?.prices ?? []).map((p) => [p.token, p]));

export default function PricesPage({ timeZone = deviceZone() }) {
  const [seasons, setSeasons] = useState(null); // /prices: { connected, prices, miningRates }
  const [reference, setReference] = useState(null); // /reference-prices: { connected, prices }
  const [token, setToken] = useState(null); // the picked token; null: the first one connected
  const [range, setRange] = useState('7d');
  const [history, setHistory] = useState(null); // { token, range, points }
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/prices')
      .then(setSeasons)
      .catch((err) => setError(err.message));
    api('/reference-prices')
      .then(setReference)
      .catch(() => setReference({ connected: false, prices: [] }));
  }, []);

  const shownToken = token ?? (seasons?.connected ? 'spring' : reference?.connected ? 'eth' : null);
  useEffect(() => {
    if (!shownToken) return;
    const path = isReference(shownToken) ? 'reference-prices' : 'prices';
    api(`/${path}/${shownToken}?range=${range}`)
      .then((data) => {
        setHistory(data);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [shownToken, range]);

  const seasonPrices = byId(seasons);
  const referencePrices = byId(reference);
  const actual = Object.fromEntries(Object.entries(seasonPrices).map(([t, p]) => [t, p.price]));
  const picked = [...TOKENS, ...REFERENCE].find((t) => t.id === shownToken);
  // An answer for an earlier pick is not shown while the new one loads.
  const shown = history?.token === shownToken && history?.range === range ? history : null;

  return (
    <section className="page prices">
      <p>
        <Link to="/info">Seasonal Tokens</Link>
      </p>
      <h1>Prices</h1>
      <FormMessage error={error} />
      <p>
        In US dollars, one price per hour. Times are in your time zone (<strong>{timeZone}</strong>
        ).
      </p>
      <h2 className="prices__row-title">Seasons</h2>
      {seasons?.connected ? (
        <TokenPicker
          label="Seasons"
          tokens={TOKENS}
          byToken={seasonPrices}
          picked={shownToken}
          onPick={setToken}
        />
      ) : (
        seasons && (
          <p role="status">
            The price data source is not connected, so there are no prices to show.
          </p>
        )
      )}
      <h2 className="prices__row-title">Reference</h2>
      {reference?.connected ? (
        <>
          <TokenPicker
            label="Reference"
            tokens={REFERENCE}
            byToken={referencePrices}
            picked={shownToken}
            onPick={setToken}
          />
          {/* CoinGecko's attribution, required for its data, next to that data. */}
          <p className="prices__note">
            ETH and POL:{' '}
            <a href="https://www.coingecko.com/en/api/" target="_blank" rel="noopener noreferrer">
              Powered by CoinGecko API
            </a>
          </p>
        </>
      ) : (
        reference && <p role="status">ETH and POL are not connected.</p>
      )}
      {shownToken && (
        <>
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
              token={shownToken}
              name={picked.name}
              timeZone={timeZone}
            />
          ) : (
            !error && <p>Loading…</p>
          )}
        </>
      )}
      {seasons?.connected && (
        <>
          <FairPriceTable actual={actual} rates={seasons.miningRates} />
          <Converter
            prices={{ ...actual, eth: referencePrices.eth?.price }}
            rates={seasons.miningRates}
          />
        </>
      )}
    </section>
  );
}
