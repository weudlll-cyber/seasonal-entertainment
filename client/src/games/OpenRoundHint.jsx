// ============================================================
// File:        OpenRoundHint.jsx
// Path:        client/src/games/OpenRoundHint.jsx
// Project:     Seasonal Entertainment
// Description: A game's open sign-up (docs/OPEN-ROUNDS.md), for everyone, signed in or not
//              (decided 2026-11-04), in two parts the home page's Featured game box and the games
//              page's cards place themselves: OpenRoundLine, one compact line ("Sign-up open", the
//              soonest round's title, its start in the site's date format, players / max players,
//              "+N more"; full false: the badge and the start only), and JoinLink, the "Join"
//              button to the round's own page on the game's site. Nothing without open rounds.
//              The rounds arrive sorted, soonest first (the server's). In development the fake
//              game's Join leads to its local placeholder page (devPages/TestGamePage.jsx).
// ============================================================

import { DEV_TEST_GAME } from '@seasonal-entertainment/shared/gameRules.js';
import { formatWhen } from '../app/dates.js';
import './openRounds.css';

const players = ({ players: n, maxPlayers }) =>
  maxPlayers ? `${n} / ${maxPlayers} players` : `${n} ${n === 1 ? 'player' : 'players'}`;

// The fake status host's rounds (npm run dev:game-status) cannot be opened by a browser: in a
// development build their Join leads to the test game's placeholder page instead.
const joinAddress = (url) =>
  import.meta.env.DEV && new URL(url).host === DEV_TEST_GAME.statusHost ? DEV_TEST_GAME.path : url;

// rounds: the game's openRounds (GET /api/games); timeZone: the viewer's, for the start.
export function OpenRoundLine({ rounds, timeZone, full = true }) {
  if (!rounds?.length) return null;
  const [round] = rounds;
  const starts = round.startsAt
    ? `Starts ${formatWhen(round.startsAt, timeZone)}`
    : 'Start to be set';
  const more = rounds.length - 1;
  const facts = full ? `${starts} · ${players(round)}` : starts;
  const moreText = more > 0 ? ` · +${more} more` : '';
  // The line is clamped to one line (openRounds.css); the tooltip holds all of it.
  const whole = `${full ? `${round.title} · ` : ''}${facts}${moreText}`;
  return (
    <p className="open-round" title={whole}>
      <span className="open-round__badge">Sign-up open</span>{' '}
      {full && <strong className="open-round__title">{round.title}</strong>}
      {full && ' · '}
      <span className="open-round__facts">{facts}</span>
      {moreText && <span className="open-round__more">{moreText}</span>}
    </p>
  );
}

// The soonest round's Join, the box's primary button.
export function JoinLink({ rounds }) {
  if (!rounds?.length) return null;
  const [round] = rounds;
  return (
    <a
      className="button open-round__join"
      href={joinAddress(round.joinUrl)}
      rel="noopener noreferrer"
      aria-label={`Join ${round.title}`}
    >
      Join
    </a>
  );
}
