// ============================================================
// File:        GamesPage.jsx
// Path:        client/src/pages/GamesPage.jsx
// Project:     Seasonal Entertainment
// Description: /games: the game cards the viewer may see (the server filters by role).
//              Available games link to their page; others show their status only. Reloads
//              when the signed-in user changes, so member-only games appear after login.
// ============================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GAME_STATUS_LABELS } from '@seasonal-entertainment/shared/gameRules.js';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import { GAME_IMAGE_FILES } from '../games/gameImages.js';
import { useSession } from '../session/SessionContext.jsx';
import './GamesPage.css';

export default function GamesPage() {
  const { user } = useSession();
  const [games, setGames] = useState(null);
  const [error, setError] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    api('/games')
      .then((data) => setGames(data.games))
      .catch((err) => setError(err.message));
  }, [userId]);

  return (
    <section className="page page--wide">
      <h1>Games</h1>
      <FormMessage error={error} />
      {games?.length === 0 && <p>No games yet.</p>}
      <ul className="game-grid">
        {games?.map((game) => (
          <li key={game.id} className="game-card">
            <img src={GAME_IMAGE_FILES[game.image]} alt="" width="96" height="96" />
            <h2>{game.name}</h2>
            <p>{game.description}</p>
            <p className={`game-card__status game-card__status--${game.status}`}>
              {GAME_STATUS_LABELS[game.status]}
            </p>
            {game.status === 'available' && (
              <Link className="button" to={game.path}>
                Play {game.name}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
