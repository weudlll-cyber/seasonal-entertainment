// ============================================================
// File:        LandingPage.jsx
// Path:        client/src/pages/LandingPage.jsx
// Project:     Seasonal Entertainment
// Description: Home in the SE style (docs/DESIGN.md, "Home"): the night-blue banner with the
//              emblem, the lettering and the greeting (with the username when signed in) and
//              the season clock (SeasonClock.jsx), then
//              a grid that fits the main column at 1280 x 720 without scrolling: the featured
//              game and "Up next": the next two of the event bot's occurrences (/api/bot-events)
//              and the site's live and planned calls (callEntries.js) in time order (a call
//              linked to a listed bot event rides on it: "Listen on this site"), the four
//              season price tiles (/api/prices, docs/BOTS.md), then Community (live:
//              CommunityCard.jsx), the next call (only when one is live or planned:
//              NextCallCard.jsx; else the fair-price box takes its column) and the way to the
//              fair prices and charts (homeCards.jsx). Calls: /api/calls, as the Calls page
//              (useCalls.js). Real data only.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { deviceZone } from '../app/dates.js';
import { withCalls } from '../calls/callEntries.js';
import { useCalls } from '../calls/useCalls.js';
import { useSession } from '../session/SessionContext.jsx';
import { EMBLEM } from '../brand/brand.js';
import CommunityCard from './CommunityCard.jsx';
import { FairPriceCard, FeaturedGameCard, PriceTiles, UpNextCard } from './homeCards.jsx';
import NextCallCard from './NextCallCard.jsx';
import SeasonClock from './SeasonClock.jsx';
import '../brand/seasonPattern.css';
import './LandingPage.css';
import './homeBottomRow.css';

const HOUR_MS = 60 * 60_000;
const UP_NEXT_COUNT = 2;

// The seven days "Up next" covers, from the full hour, so every visitor in that hour asks the
// bot the same (server-cached) question.
function upNextRange() {
  const from = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  return { from, to: from + 7 * 24 * HOUR_MS };
}

// The event bot's occurrences in the window that still take place: { connected, next }.
async function upNext({ from, to }) {
  const now = Date.now();
  const data = await api(`/bot-events?from=${from}&to=${to}`);
  const next = data.occurrences.filter((o) => o.start >= now && o.status === 'scheduled');
  return { connected: data.connected, next };
}

// "Up next": the bot's occurrences and the site's calls up to the window's end, soonest first.
// Live calls and planned ones whose time has passed come first: the Calls page still lists
// them as live or upcoming. The bot's note (not connected, failed) stays beside the calls.
function merged(next, calls, to) {
  if (!next) return null; // the bot's answer is still loading
  const entries = withCalls(next.next ?? [], calls, { to });
  return { ...next, next: entries.slice(0, UP_NEXT_COUNT) };
}

export default function LandingPage({ timeZone = deviceZone() }) {
  const { user } = useSession();
  const [game, setGame] = useState(undefined); // undefined: loading; null: no games
  const [range] = useState(upNextRange); // fixed while the page is open
  const [next, setNext] = useState(null); // upNext()'s answer; null while loading
  const [prices, setPrices] = useState(null); // null while loading or when it failed
  const calls = useCalls(); // as the Calls page; null while loading or failed
  const userId = user?.id;

  // Visible games depend on who is signed in (members-only cards).
  useEffect(() => {
    api('/games')
      .then((data) => setGame(data.games[0] ?? null))
      .catch(() => setGame(null));
  }, [userId]);

  useEffect(() => {
    upNext(range)
      .then(setNext)
      .catch(() => setNext({ failed: true }));
  }, [range]);

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
        <SeasonClock timeZone={timeZone} />
      </div>
      <div className="home__grid">
        <FeaturedGameCard game={game} />
        <UpNextCard next={merged(next, calls, range.to)} timeZone={timeZone} />
        <PriceTiles prices={prices} />
        <CommunityCard />
        <NextCallCard calls={calls} timeZone={timeZone} />
        <FairPriceCard prices={prices} />
      </div>
    </div>
  );
}
