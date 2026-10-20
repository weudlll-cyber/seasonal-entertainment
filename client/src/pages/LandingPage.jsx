// ============================================================
// File:        LandingPage.jsx
// Path:        client/src/pages/LandingPage.jsx
// Project:     Seasonal Entertainment
// Description: Home: a greeting (with the username when signed in) and a bento grid that
//              fits the main column at 1280 x 720 without scrolling: the featured game, the
//              event bot's next two occurrences (/api/bot-events), Seasonal Tokens with the
//              prices (homeCards.jsx; /api/prices, docs/BOTS.md). Real data only.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { FeaturedGameCard, TokensCard, UpNextCard } from './homeCards.jsx';
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
      <div className="home__header">
        <h1>{user ? `Welcome back, ${user.username}` : 'Welcome to Seasonal Entertainment'}</h1>
        <p className="home__text">Games, community and everything around Seasonal Tokens.</p>
      </div>
      <div className="home__grid">
        <FeaturedGameCard game={game} />
        <UpNextCard next={next} timeZone={timeZone} />
        <TokensCard prices={prices} />
      </div>
    </div>
  );
}
