// ============================================================
// File:        homeCards.jsx
// Path:        client/src/pages/homeCards.jsx
// Project:     Seasonal Entertainment
// Description: The boxes of the home page in the SE style (docs/DESIGN.md, "Home"), all from
//              real data: the featured games in rotation (open sign-ups first, 8 s each, with
//              previous/next, dots and a pause; games/featuredRotation.js), "Up next" (the
//              event bot's occurrences and the site's calls, merged by LandingPage.jsx; a call
//              with the calls quarter, linking to its page; only the entries that fit whole,
//              useWholeItems.js), the four season price tiles (price bot, docs/BOTS.md) and the
//              link to the fair prices and charts (with the notice "Information only — not
//              financial advice."); the faint logo part (Wash) the boxes share. Community and Next call have files of their own (CommunityCard.jsx,
//              NextCallCard.jsx). Each box but the tiles carries a faint part of the logo.
// ============================================================

import { useRef } from 'react';
import { Link } from 'react-router';
import { GAME_STATUS_LABELS } from '@seasonal-entertainment/shared/gameRules.js';
import { formatWhen } from '../app/dates.js';
import { EMBLEM, QUARTERS, SEASON_ICONS } from '../brand/brand.js';
import NotAdvice from '../components/NotAdvice.jsx';
import { featuredOrder, useRotation } from '../games/featuredRotation.js';
import OpenRoundHint from '../games/OpenRoundHint.jsx';
import { formatChange, formatUsd, TOKENS } from '../prices/priceFormat.js';
import './priceTiles.css';
import { useWholeItems } from './useWholeItems.js';

// A box's faint logo part: decoration behind its content; lazy, as on a phone most boxes start
// below the fold.
export const Wash = ({ src }) => (
  <img className="home__wash" src={src} alt="" aria-hidden="true" loading="lazy" />
);

// One game in the box: its name, description, open sign-up (games/OpenRoundHint.jsx) and Play.
function FeaturedGame({ game, timeZone }) {
  return (
    <>
      {/* A badge only when the data says so. */}
      {game.status === 'coming_soon' && (
        <span className="home__badge">{GAME_STATUS_LABELS.coming_soon}</span>
      )}
      <h2 className="home__game-name">{game.name}</h2>
      <p className="home__text">{game.description}</p>
      <OpenRoundHint rounds={game.openRounds} timeZone={timeZone} />
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
  );
}

// games: GET /api/games's list (undefined while loading; [] for none). In rotation
// (games/featuredRotation.js): games with an open sign-up first, 8 s each.
export function FeaturedGameCard({ games, timeZone }) {
  const ordered = games ? featuredOrder(games) : [];
  const { index, go, paused, togglePause, reducedMotion, boxProps } = useRotation(ordered.length);
  const game = ordered[index];
  const many = ordered.length > 1;
  return (
    <section className="card home__card home__game" aria-label="Featured game" {...boxProps}>
      <Wash src={QUARTERS.games} />
      <p className="home__eyebrow">Featured game</p>
      {/* Not announced on every turn: a screen reader reads it when it gets there. */}
      {game && (
        <div className="home__game-slide" aria-live="off">
          <FeaturedGame key={game.id} game={game} timeZone={timeZone} />
        </div>
      )}
      {many && (
        <div className="home__game-controls" role="group" aria-label="Featured games">
          <button
            type="button"
            className="home__game-step"
            aria-label="Previous game"
            title="Previous game"
            onClick={() => go(index - 1)}
          >
            ‹
          </button>
          {ordered.map((g, i) => (
            <button
              key={g.id}
              type="button"
              className="home__game-dot"
              aria-label={`Show ${g.name}`}
              title={g.name}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => go(i)}
            />
          ))}
          <button
            type="button"
            className="home__game-step"
            aria-label="Next game"
            title="Next game"
            onClick={() => go(index + 1)}
          >
            ›
          </button>
          {/* With reduced motion nothing moves by itself: nothing to pause. */}
          {!reducedMotion && (
            <button
              type="button"
              className="home__game-step"
              aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
              title={paused ? 'Resume rotation' : 'Pause rotation'}
              aria-pressed={paused}
              onClick={togglePause}
            >
              {paused ? '▶' : '❚❚'}
            </button>
          )}
        </div>
      )}
      {games?.length === 0 && <p className="home__text">No games yet.</p>}
    </section>
  );
}

// next: { connected | failed, next: the bot's occurrences and the site's calls (withCalls),
// soonest first }; null while loading.
export function UpNextCard({ next, timeZone }) {
  const list = useRef(null);
  const entries = next?.next ?? [];
  // Only whole entries: one that does not fit the box's height is hidden, never shown cut.
  const whole = useWholeItems(list, entries.length);
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
      <ul className="home__events" ref={list}>
        {entries.map((entry, index) =>
          entry.call ? (
            <CallEntry
              key={`call-${entry.id}`}
              entry={entry}
              timeZone={timeZone}
              cut={index >= whole}
            />
          ) : (
            <BotEntry
              key={`${entry.id}-${entry.start}`}
              entry={entry}
              timeZone={timeZone}
              cut={index >= whole}
            />
          )
        )}
      </ul>
    </section>
  );
}

// An entry that does not fit the box (cut): kept in the layout for measuring, but invisible
// and out of reach of focus and screen readers.
const cutProps = (cut) => (cut ? { className: 'home__event--cut', inert: true } : {});

// A bot event; with a call linked to it (listen), "Listen on this site" and, while that call
// is live, "Live now" instead of the date.
function BotEntry({ entry: { name, start, image, listen }, timeZone, cut }) {
  return (
    <li {...cutProps(cut)}>
      {/* The event's own image when it has one, else a dot in a season colour. */}
      {image ? (
        <img className="home__event-image" src={image} alt={name} loading="lazy" />
      ) : (
        <span className="home__event-dot" aria-hidden="true" />
      )}
      <strong>{name}</strong>
      <span className="home__text">
        {listen?.live ? 'Live now' : formatWhen(start, timeZone)}
        {listen && (
          <>
            {' · '}
            <Link to={`/calls/${listen.id}`}>Listen on this site</Link>
          </>
        )}
      </span>
    </li>
  );
}

// A site call: the calls quarter as its picture, its title leading to its page.
function CallEntry({ entry: { id, name, start, live }, timeZone, cut }) {
  return (
    <li {...cutProps(cut)}>
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
          const text = formatUsd(price?.price);
          const content = (
            <>
              <span className="price-tile__name">{name}</span>
              {/* Its length sizes it to the tile's text column (priceTiles.css): never under
                  the mark, whatever its digits. */}
              <span className="price-tile__price" style={{ '--chars': text.length }}>
                {text}
              </span>
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
  // The title's link covers the whole box (home__fair-link), so the box is clickable as one;
  // the notice's Disclaimer link sits above it and stays a link of its own.
  return (
    <section className="card home__card home__fair" aria-label="Prices">
      <Wash src={EMBLEM} />
      {icons}
      <span className="home__fair-text">
        <Link className="home__fair-title home__fair-link" to="/info/prices">
          {/* A non-breaking space keeps the arrow beside the title's last word. */}
          Fair price &amp; charts&nbsp;
          <span aria-hidden="true">→</span>
        </Link>
        <span className="home__text">Fair prices, charts and a converter for every coin.</span>
        <NotAdvice className="home__fair-notice" />
      </span>
    </section>
  );
}
