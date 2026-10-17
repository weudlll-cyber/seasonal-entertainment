// ============================================================
// File:        homeCards.jsx
// Path:        client/src/pages/homeCards.jsx
// Project:     Seasonal Entertainment
// Description: The three cards of the home page's bento grid, all from real data: the
//              featured game (the first game of the games list), the next two events, and
//              Seasonal Tokens with the four season marks (linking to the info section).
// ============================================================

import { Link } from 'react-router';
import { formatDay, formatLocal } from '@seasonal-entertainment/shared/eventSchedule.js';
import { GAME_STATUS_LABELS } from '@seasonal-entertainment/shared/gameRules.js';
import springMark from '../assets/seasons/spring.svg';
import summerMark from '../assets/seasons/summer.svg';
import autumnMark from '../assets/seasons/autumn.svg';
import winterMark from '../assets/seasons/winter.svg';
import { GAME_IMAGE_FILES } from '../games/gameImages.js';

// Calendar order; `id` picks the season colour token in LandingPage.css.
const SEASONS = [
  { id: 'spring', name: 'Spring', mark: springMark },
  { id: 'summer', name: 'Summer', mark: summerMark },
  { id: 'autumn', name: 'Autumn', mark: autumnMark },
  { id: 'winter', name: 'Winter', mark: winterMark },
];

export function FeaturedGameCard({ game }) {
  return (
    <section className="card home__card home__game" aria-label="Featured game">
      <p className="home__eyebrow">Featured game</p>
      {game && (
        <>
          <img
            className="home__game-image"
            src={GAME_IMAGE_FILES[game.image]}
            alt=""
            width="160"
            height="160"
          />
          <h2>{game.name}</h2>
          {/* A badge only when the data says so. */}
          {game.status === 'coming_soon' && (
            <span className="home__badge">{GAME_STATUS_LABELS.coming_soon}</span>
          )}
          <p className="home__text">{game.description}</p>
          {game.status === 'available' ? (
            <Link className="button" to={game.path}>
              Play {game.name}
            </Link>
          ) : (
            <Link to="/games">All games</Link>
          )}
        </>
      )}
      {game === null && <p className="home__text">No games yet.</p>}
    </section>
  );
}

// next: [{ event, start }] (upcomingOccurrences), or null while loading.
export function UpNextCard({ next, timeZone }) {
  return (
    <section className="card home__card" aria-label="Up next">
      <p className="home__eyebrow">Up next</p>
      {next?.length === 0 && <p className="home__text">No events planned.</p>}
      <ul className="home__events">
        {next?.map(({ event, start }) => {
          const local = formatLocal(start, timeZone);
          return (
            <li key={`${event.id}-${start}`}>
              <strong>{event.title}</strong>
              <span className="home__text">
                {formatDay(start, timeZone)}, {local.time} {local.zone}
              </span>
            </li>
          );
        })}
      </ul>
      <Link to="/events">All events</Link>
    </section>
  );
}

export function TokensCard() {
  return (
    <section className="card home__card" aria-label="Seasonal Tokens">
      <p className="home__eyebrow">Seasonal Tokens</p>
      <ul className="landing__seasons" aria-label="The four seasons">
        {SEASONS.map((season) => (
          <li key={season.id} className={`landing__season landing__season--${season.id}`}>
            <img src={season.mark} alt={`${season.name} season mark`} width="96" height="96" />
          </li>
        ))}
      </ul>
      <Link to="/info">About Seasonal Tokens</Link>
    </section>
  );
}
