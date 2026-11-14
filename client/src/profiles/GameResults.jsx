// ============================================================
// File:        GameResults.jsx
// Path:        client/src/profiles/GameResults.jsx
// Project:     Seasonal Entertainment
// Description: A member's results from the site's games on their profile (MemberProfilePage;
//              docs/GAME-INTEGRATION.md, "A member's results on their profile"; decided
//              2026-11-14): one card per game that answered, with the values the game names
//              itself (label and value), "Last played" as a date in the viewer's own time zone,
//              and a link into the game. Loaded on its own after the profile, so the page never
//              waits for a game; nothing shows while loading, without cards, or on any error.
//              The game's texts are written as text by React, never as markup.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { formatDate } from '../app/dates.js';

export default function GameResults({ username }) {
  const [games, setGames] = useState([]);
  useEffect(() => {
    let current = true;
    api(`/members/${encodeURIComponent(username)}/games`)
      .then((answer) => current && setGames(answer.games))
      // A game's results are extra: the profile stays as it is without them.
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [username]);

  if (!games.length) return null;
  return (
    <section className="game-results" aria-labelledby="game-results-title">
      <h2 id="game-results-title">Games</h2>
      <ul className="game-results__list">
        {games.map((game) => (
          <li key={game.slug} className="game-results__card">
            <h3>{game.name}</h3>
            <dl>
              {game.values.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
            {game.lastPlayedAt && (
              <p className="game-results__last">Last played {formatDate(game.lastPlayedAt)}</p>
            )}
            {/* The game is its own application: a full page load, not a route of this one. */}
            <a href={game.path}>Open {game.name}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
