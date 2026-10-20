// ============================================================
// File:        PricesPage.jsx
// Path:        client/src/prices/PricesPage.jsx
// Project:     Seasonal Entertainment
// Description: /info/prices, in the "Seasonal Tokens" section: the four seasons' latest prices
//              (from the price bot) and a reference row with ETH, POL and BTC (from CoinGecko,
//              with its attribution), each a button showing price and 24-hour change that
//              toggles the coin on the one chart; "All coins" shows every coin and, pressed
//              again, the single coin shown before. The chosen coins live in the address
//              (?coins=…), so a link shows the same view (coinSelection.js). The chart covers
//              24 hours, 7 days, 30 days, a year or everything; then the fair price and the
//              converter with mining times, as the price bot's /value and /swap
//              (FairPriceTable.jsx, Converter.jsx; docs/BOTS.md). A source that is not
//              connected says so plainly. timeZone is a prop so tests can pin it. SE style: the
//              title on a small night-blue banner with the season pattern and the four marks.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/http.js';
import { SEASON_ICONS } from '../brand/brand.js';
import { FormMessage } from '../components/FormField.jsx';
import { ALL_COINS, parseCoins, shownCoins, toggleAll, toggleCoin } from './coinSelection.js';
import Converter from './Converter.jsx';
import FairPriceTable from './FairPriceTable.jsx';
import PriceChart from './PriceChart.jsx';
import { RANGES, RANGE_LABELS, REFERENCE, TOKENS } from './priceFormat.js';
import TokenPicker from './TokenPicker.jsx';
import '../brand/seasonPattern.css';
import './prices.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const isReference = (id) => REFERENCE.some((t) => t.id === id);
const nameOf = Object.fromEntries([...TOKENS, ...REFERENCE].map((t) => [t.id, t.name]));
const byId = (answer) => Object.fromEntries((answer?.prices ?? []).map((p) => [p.token, p]));

export default function PricesPage({ timeZone = deviceZone() }) {
  const [params, setParams] = useSearchParams();
  const [seasons, setSeasons] = useState(null); // /prices: { connected, prices, miningRates }
  const [reference, setReference] = useState(null); // /reference-prices: { connected, prices }
  const [range, setRange] = useState('7d');
  const [histories, setHistories] = useState({}); // "token:range" -> points
  // The coin "All coins" goes back to: the one shown alone last (at first: the address's
  // first).
  const [single, setSingle] = useState(() => parseCoins(params.get('coins'))[0]);
  const asked = useRef(new Set()); // "token:range" already requested: never asked twice
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/prices')
      .then(setSeasons)
      .catch((err) => setError(err.message));
    api('/reference-prices')
      .then(setReference)
      .catch(() => setReference({ connected: false, prices: [] }));
  }, []);

  const seasonPrices = byId(seasons);
  const referencePrices = byId(reference);
  const latest = { ...seasonPrices, ...referencePrices };
  const available = ALL_COINS.filter((id) => latest[id]);
  // Nothing is chosen before both answers are in: a link's coins may be among the second.
  const selected =
    seasons && reference ? shownCoins(parseCoins(params.get('coins')), available) : [];
  const selectedKey = selected.join(',');

  useEffect(() => {
    for (const id of selectedKey ? selectedKey.split(',') : []) {
      const key = `${id}:${range}`;
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      const path = isReference(id) ? 'reference-prices' : 'prices';
      api(`/${path}/${id}?range=${range}`)
        .then((data) => setHistories((known) => ({ ...known, [key]: data.points })))
        .catch((err) => setError(err.message));
    }
  }, [selectedKey, range]);

  // The address keeps the view (replace: picking coins is not a step back in the history).
  function show(coins) {
    if (coins.length === 1) setSingle(coins[0]);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('coins', coins.join(','));
        return next;
      },
      { replace: true }
    );
  }
  const onToggle = (id) => show(toggleCoin(selected, id));
  const allShown = available.length > 0 && available.every((id) => selected.includes(id));

  // The chart once every chosen coin's prices for this range are in.
  const series = selected.map((id) => ({
    token: id,
    name: nameOf[id],
    points: histories[`${id}:${range}`],
  }));
  const ready = series.length > 0 && series.every((s) => s.points);
  const actual = Object.fromEntries(Object.entries(seasonPrices).map(([t, p]) => [t, p.price]));
  const allPrices = Object.fromEntries(Object.entries(latest).map(([t, p]) => [t, p.price]));

  return (
    <section className="page prices">
      <p>
        <Link to="/info">Seasonal Tokens</Link>
      </p>
      <div className="prices__banner season-pattern">
        <span className="prices__marks" aria-hidden="true">
          {TOKENS.map(({ id }) => (
            <img key={id} src={SEASON_ICONS[id]} alt="" width="40" height="40" />
          ))}
        </span>
        <h1>Prices</h1>
      </div>
      <FormMessage error={error} />
      <p>
        In US dollars, one price per hour. Times are in your time zone (<strong>{timeZone}</strong>
        ). Pick one coin for its price, or several to compare them.
      </p>
      <div role="group" aria-label="Coins">
        <h2 className="prices__row-title">Seasons</h2>
        {seasons?.connected ? (
          <TokenPicker
            label="Seasons"
            tokens={TOKENS}
            byToken={seasonPrices}
            selected={selected}
            onToggle={onToggle}
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
              selected={selected}
              onToggle={onToggle}
            />
            {/* CoinGecko's attribution, required for its data, next to that data. */}
            <p className="prices__note">
              ETH, POL and BTC:{' '}
              <a href="https://www.coingecko.com/en/api/" target="_blank" rel="noopener noreferrer">
                Powered by CoinGecko API
              </a>
            </p>
          </>
        ) : (
          reference && <p role="status">ETH, POL and BTC are not connected.</p>
        )}
        {available.length > 1 && (
          <button
            type="button"
            className="button button--secondary prices__all"
            aria-pressed={allShown}
            onClick={() => show(toggleAll(selected, available, single))}
          >
            {/* Not just "All": the range buttons below have an "All" of their own. */}
            All coins
          </button>
        )}
      </div>
      {selected.length > 0 && (
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
          {ready ? <PriceChart series={series} timeZone={timeZone} /> : !error && <p>Loading…</p>}
        </>
      )}
      {seasons?.connected && (
        <>
          <FairPriceTable actual={actual} rates={seasons.miningRates} />
          <Converter prices={allPrices} rates={seasons.miningRates} />
        </>
      )}
    </section>
  );
}
