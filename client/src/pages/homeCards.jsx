// ============================================================
// File:        homeCards.jsx
// Path:        client/src/pages/homeCards.jsx
// Project:     Seasonal Entertainment
// Description: The boxes of the home page in the SE style (docs/DESIGN.md, "Home"), all from
//              real data: the featured game (the first game of the games list), "Up next" (the
//              event bot's occurrences and the site's calls, merged by LandingPage.jsx; a call
//              with the calls quarter, linking to its page), the four season price tiles (price
//              bot, docs/BOTS.md) and
//              the link to the fair prices and charts; the faint logo part (Wash) the boxes
//              share. Community and Next call have files of their own (CommunityCard.jsx,
//              NextCallCard.jsx). Each box but the tiles carries a faint part of the logo.
// ============================================================

import { Link } from 'react-router';
import { GAME_STATUS_LABELS } from '@seasonal-entertainment/shared/gameRules.js';
import { formatWhen } from '../app/dates.js';
import { EMBLEM, QUARTERS, SEASON_ICONS } from '../brand/brand.js';
import { formatChange, formatUsd, TOKENS } from '../prices/priceFormat.js';
import './priceTiles.css';

// A box's faint logo part: decoration behind its content; lazy, as on a phone most boxes start
// below the fold.
export const Wash = ({ src }) => (
  <img className="home__wash" src={src} alt="" aria-hidden="true" loading="lazy" />
);

export function FeaturedGameCard({ game }) {
  return (
    <section className="card home__card home__game" aria-label="Featured game">
      <Wash src={QUARTERS.games} />
      <p className="home__eyebrow">Featured game</p>
      {game && (
        <>
          {/* A badge only when the data says so. */}
          {game.status === 'coming_soon' && (
            <span className="home__badge">{GAME_STATUS_LABELS.coming_soon}</span>
          )}
          <h2 className="home__game-name">{game.name}</h2>
          <p className="home__text">{game.description}</p>
          <p className="home__actions">
            {game.status === 'available' ? (
              <Link className="button" to={game.path}>
                Play {game.name}
              </Link>
            ) : (
              <Link className="button" to="/games">
                All games
              </Link>
            )}
          </p>
        </>
      )}
      {game === null && <p className="home__text">No games yet.</p>}
    </section>
  );
}

// next: { connected | failed, next: the bot's occurrences and the site's calls (callEntries.js),
// soonest first }; null while loading.
export function UpNextCard({ next, timeZone }) {
  return (
    <section className="card home__card home__upnext" aria-label="Up next">
      <Wash src={QUARTERS.events} />
      <div className="home__card-head">
        <h2>Up next</h2>
        <Link to="/events">All events</Link>
      </div>
      {next?.connected === false && (
        <p className="home__text">The event calendar is not connected.</p>
      )}
      {next?.failed && <p className="home__text">The event calendar cannot be read right now.</p>}
      {next?.connected && next.next.length === 0 && (
        <p className="home__text">No events in the next seven days.</p>
      )}
      <ul className="home__events">
        {next?.next?.map((entry) =>
          entry.call ? (
            <CallEntry key={`call-${entry.id}`} entry={entry} timeZone={timeZone} />
          ) : (
            <BotEntry key={`${entry.id}-${entry.start}`} entry={entry} timeZone={timeZone} />
          )
        )}
      </ul>
    </section>
  );
}

function BotEntry({ entry: { name, start, image }, timeZone }) {
  return (
    <li>
      {/* The event's own image when it has one, else a dot in a season colour. */}
      {image ? (
        <img className="home__event-image" src={image} alt={name} loading="lazy" />
      ) : (
        <span className="home__event-dot" aria-hidden="true" />
      )}
      <strong>{name}</strong>
      <span className="home__text">{formatWhen(start, timeZone)}</span>
    </li>
  );
}

// A site call: the calls quarter as its picture, its title leading to its page.
function CallEntry({ entry: { id, name, start, live }, timeZone }) {
  return (
    <li>
      <img className="home__event-image" src={QUARTERS.calls} alt="" loading="lazy" />
      {/* One line (ellipsis), so a long title never pushes the box past the window; the
          whole title stays the link's text and is its tooltip. */}
      <strong className="home__event-name">
        <Link to={`/calls/${id}`} title={name}>
          {name}
        </Link>
      </strong>
      <span className="home__text">{live ? 'Live now' : formatWhen(start, timeZone)}</span>
    </li>
  );
}

// prices: the /api/prices answer ({ connected, prices }), or null while loading or failed.
// One tile per season in its token colour; with prices each opens that coin's chart.
export function PriceTiles({ prices }) {
  const byToken = Object.fromEntries((prices?.prices ?? []).map((p) => [p.token, p]));
  return (
    <section className="home__tiles" aria-label="Seasonal Tokens">
      <ul className="price-tiles" aria-label="Prices in US dollars">
        {TOKENS.map(({ id, name }) => {
          const price = byToken[id];
          const content = (
            <>
              <span className="price-tile__name">{name}</span>
              <span className="price-tile__price">{formatUsd(price?.price)}</span>
              <span className="price-tile__change">{formatChange(price?.change24h)} · 24 h</span>
              <span className="price-tile__mark">
                <img src={SEASON_ICONS[id]} alt="" width="48" height="48" />
              </span>
            </>
          );
          return (
            <li key={id} className={`price-tile price-tile--${id}`}>
              {prices?.connected ? (
                <Link className="price-tile__body" to={`/info/prices?coins=${id}`}>
                  {content}
                </Link>
              ) : (
                <div className="price-tile__body">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The way to the prices page (fair price, charts, converter); a plain note without prices.
export function FairPriceCard({ prices }) {
  const icons = (
    <span className="home__icons" aria-hidden="true">
      {TOKENS.map(({ id }) => (
        <img key={id} src={SEASON_ICONS[id]} alt="" width="30" height="30" />
      ))}
    </span>
  );
  if (!prices?.connected) {
    return (
      <section className="card home__card home__fair" aria-label="Prices">
        <Wash src={EMBLEM} />
        {icons}
        <p className="home__text">
          {/* null: still loading, or the request failed; then only the link. */}
          {prices && 'Prices: the data source is not connected. '}
          <Link to="/info">About Seasonal Tokens</Link>
        </p>
      </section>
    );
  }
  return (
    <Link className="card home__card home__fair" to="/info/prices">
      <Wash src={EMBLEM} />
      {icons}
      <span className="home__fair-text">
        <strong className="home__fair-title">
          {/* A non-breaking space keeps the arrow beside the title's last word. */}
          Fair price &amp; charts&nbsp;
          <span aria-hidden="true">→</span>
        </strong>
        <span className="home__text">Fair prices, charts and a converter for every coin.</span>
      </span>
    </Link>
  );
}
