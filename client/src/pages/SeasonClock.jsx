// ============================================================
// File:        SeasonClock.jsx
// Path:        client/src/pages/SeasonClock.jsx
// Project:     Seasonal Entertainment
// Description: The season clock in the home banner (docs/DESIGN.md, "Home"): the token in
//              season (the highest reward now: its season colour and icon) and the next
//              halving of any token, by the day only, both from the contracts' schedule
//              (shared/seasonClock.js). Worked out once when the page opens; a halving is
//              months apart, so it never needs a timer.
// ============================================================

import { useState } from 'react';
import { seasonClock } from '@seasonal-entertainment/shared/seasonClock.js';
import { formatDate } from '../app/dates.js';
import { SEASON_ICONS } from '../brand/brand.js';
import { TOKENS } from '../prices/priceFormat.js';

const nameOf = (id) => TOKENS.find((t) => t.id === id).name;

// now: milliseconds, pinned by tests; timeZone: the viewer's (dates.js) unless pinned.
export default function SeasonClock({ now, timeZone }) {
  const [clock] = useState(() => seasonClock(Math.floor((now ?? Date.now()) / 1000)));
  const { inSeason, next } = clock;
  return (
    <section className="season-clock" aria-label="Season clock">
      <span className="season-clock__mark" style={{ '--mark': `var(--color-${inSeason})` }}>
        <img src={SEASON_ICONS[inSeason]} alt="" width="28" height="28" />
      </span>
      <span className="season-clock__text">
        <span className="season-clock__now">
          In season: <strong>{nameOf(inSeason)}</strong>
        </span>
        <span>
          Next halving: {nameOf(next.token)}, {formatDate(next.at * 1000, timeZone)}
        </span>
        <span className="season-clock__source">
          Calculated from the token contracts&apos; halving schedule.
        </span>
      </span>
    </section>
  );
}
