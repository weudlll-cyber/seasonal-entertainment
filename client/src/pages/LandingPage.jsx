// ============================================================
// File:        LandingPage.jsx
// Path:        client/src/pages/LandingPage.jsx
// Project:     Seasonal Entertainment
// Description: Home in the SE style (docs/DESIGN.md, "Home"): the night-blue banner with the
//              emblem, the lettering and the greeting (with the username when signed in), then
//              a grid that fits the main column at 1280 x 720 without scrolling: the featured
//              game and the event bot's next two occurrences (/api/bot-events), the four season
//              price tiles (/api/prices, docs/BOTS.md), Community and the way to the fair prices
//              and charts (homeCards.jsx). Real data only.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { EMBLEM } from '../brand/brand.js';
import {
  CommunityCard,
  FairPriceCard,
  FeaturedGameCard,
  PriceTiles,
  UpNextCard,
} from './homeCards.jsx';
import '../brand/seasonPattern.css';
import './LandingPage.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const HOUR_MS = 60 * 60_000;

// The event bot's next two occurrences that still take place: { connected, next }.
async function upNext() {
  const now = Date.now();
  // From the full hour, so every visitor in that hour asks the same (server-cached) question.
  const from = Math.floor(now / HOUR_MS) * HOUR_MS;
  const data = await api(`/bot-events?from=${from}&to=${from + 7 * 24 * HOUR_MS}`);
  const next = data.occurrences.filter((o) => o.start >= now && o.status === 'scheduled');
  return { connected: data.connected, next: next.slice(0, 2) };
}

export default function LandingPage({ timeZone = deviceZone() }) {
  const { user } = useSession();
  const [game, setGame] = useState(undefined); // undefined: loading; null: no games
  const [next, setNext] = useState(null); // upNext()'s answer; null while loading
  const [prices, setPrices] = useState(null); // null while loading or when it failed
  const userId = user?.id;

  // Visible games depend on who is signed in (members-only cards).
  useEffect(() => {
    api('/games')
      .then((data) => setGame(data.games[0] ?? null))
      .catch(() => setGame(null));
  }, [userId]);

  useEffect(() => {
    upNext()
      .then(setNext)
      .catch(() => setNext({ failed: true }));
  }, []);

  useEffect(() => {
    api('/prices')
      .then(setPrices)
      .catch(() => setPrices(null));
  }, []);

  return (
    <div className="home">
      <div className="home__banner season-pattern">
        <img className="home__emblem" src={EMBLEM} alt="" width="206" height="166" />
        <div className="home__banner-text">
          {/* The lettering is the logo's (read as the greeting's context, not twice). */}
          <span className="home__lettering" aria-hidden="true">
            SEASONAL
          </span>
          <span className="home__lettering-sub" aria-hidden="true">
            ENTERTAINMENT
          </span>
          <h1 className="home__greeting">
            {user ? `Welcome back, ${user.username}` : 'Welcome to Seasonal Entertainment'}
          </h1>
        </div>
      </div>
      <div className="home__grid">
        <FeaturedGameCard game={game} />
        <UpNextCard next={next} timeZone={timeZone} />
        <PriceTiles prices={prices} />
        <CommunityCard />
        <FairPriceCard prices={prices} />
      </div>
    </div>
  );
}
