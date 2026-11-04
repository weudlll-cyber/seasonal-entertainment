// ============================================================
// File:        OpenRoundHint.jsx
// Path:        client/src/games/OpenRoundHint.jsx
// Project:     Seasonal Entertainment
// Description: A game's open sign-up (docs/OPEN-ROUNDS.md), for everyone, signed in or not
//              (decided 2026-11-04): "Sign-up open" with the soonest round's title, its start in the
//              site's date format (app/dates.js), players / max players, a "Join" link to the
//              round's own page on the game's site, and "+N more" when more rounds are open.
//              compact (the games page's cards): the badge, the start and "Join" only. Nothing at
//              all without open rounds. The rounds arrive sorted, soonest first (the server's).
// ============================================================

import { formatWhen } from '../app/dates.js';
import './openRounds.css';

const players = ({ players: n, maxPlayers }) =>
  maxPlayers ? `${n} / ${maxPlayers} players` : `${n} ${n === 1 ? 'player' : 'players'}`;

// rounds: the game's openRounds (GET /api/games); timeZone: the viewer's, for the start.
export default function OpenRoundHint({ rounds, timeZone, compact = false }) {
  if (!rounds?.length) return null;
  const [round] = rounds;
  const starts = round.startsAt
    ? `Starts ${formatWhen(round.startsAt, timeZone)}`
    : 'Start to be set';
  const more = rounds.length - 1;
  return (
    <div className={`open-round${compact ? ' open-round--compact' : ''}`}>
      <p className="open-round__head">
        <span className="open-round__badge">Sign-up open</span>
        {more > 0 && <span className="open-round__more">+{more} more</span>}
      </p>
      {!compact && <p className="open-round__title">{round.title}</p>}
      <p className="open-round__facts">
        {starts}
        {!compact && ` · ${players(round)}`}
      </p>
      <a
        className="button open-round__join"
        href={round.joinUrl}
        rel="noopener noreferrer"
        aria-label={`Join ${round.title}`}
      >
        Join
      </a>
    </div>
  );
}
