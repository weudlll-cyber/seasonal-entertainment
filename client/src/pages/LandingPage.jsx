// ============================================================
// File:        LandingPage.jsx
// Path:        client/src/pages/LandingPage.jsx
// Project:     Seasonal Entertainment
// Description: Home: a greeting (with the username when signed in) and a bento grid that
//              fits the main column at 1280 x 720 without scrolling: the featured game, the
//              next two events, Seasonal Tokens (homeCards.jsx). Real data only.
// ============================================================

import { useEffect, useState } from 'react';
import { upcomingOccurrences } from '@seasonal-entertainment/shared/eventSchedule.js';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { FeaturedGameCard, TokensCard, UpNextCard } from './homeCards.jsx';
import './LandingPage.css';

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function LandingPage({ timeZone = deviceZone() }) {
  const { user } = useSession();
  const [game, setGame] = useState(undefined); // undefined: loading; null: no games
  const [next, setNext] = useState(null);
  const userId = user?.id;

  // Visible games depend on who is signed in (members-only cards).
  useEffect(() => {
    api('/games')
      .then((data) => setGame(data.games[0] ?? null))
      .catch(() => setGame(null));
  }, [userId]);

  useEffect(() => {
    api('/events')
      .then((data) => setNext(upcomingOccurrences(data.events, Date.now(), timeZone, 2)))
      .catch(() => setNext([]));
  }, [timeZone]);

  return (
    <div className="home">
      <div className="home__header">
        <h1>{user ? `Welcome back, ${user.username}` : 'Welcome to Seasonal Entertainment'}</h1>
        <p className="home__text">Games, community and everything around Seasonal Tokens.</p>
      </div>
      <div className="home__grid">
        <FeaturedGameCard game={game} />
        <UpNextCard next={next} timeZone={timeZone} />
        <TokensCard />
      </div>
    </div>
  );
}
