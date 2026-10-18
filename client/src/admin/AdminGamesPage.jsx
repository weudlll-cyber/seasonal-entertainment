// ============================================================
// File:        AdminGamesPage.jsx
// Path:        client/src/admin/AdminGamesPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin games hub list: add, edit and delete game cards (delete asks once
//              more). Image, status and visibility come from fixed lists (shared/gameRules.js).
// ============================================================

import { useEffect, useState } from 'react';
import { GAME_STATUS_LABELS } from '@seasonal-entertainment/shared/gameRules.js';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import GameForm, { NEW_GAME } from './GameForm.jsx';

const payload = ({ id: _id, position: _position, ...fields }) => fields;

export default function AdminGamesPage() {
  const [games, setGames] = useState([]);
  const [editing, setEditing] = useState(null); // 'new', a game id, or null
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('/admin/games')
      .then((data) => setGames(data.games))
      .catch((err) => setError(err.message));
  }, [version]);

  async function run(call) {
    setError(null);
    try {
      await call();
      setEditing(null);
      setConfirmDelete(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  const save = (game) =>
    run(() =>
      editing === 'new'
        ? api('/admin/games', { method: 'POST', body: payload(game) })
        : api(`/admin/games/${editing}`, { method: 'PUT', body: payload(game) })
    );

  return (
    <>
      <h2>Games</h2>
      {editing === null ? (
        <>
          <p>
            <button className="button" type="button" onClick={() => setEditing('new')}>
              Add game
            </button>
          </p>
          <FormMessage error={error} />
        </>
      ) : (
        <GameForm
          key={editing}
          initial={editing === 'new' ? NEW_GAME : games.find((g) => g.id === editing)}
          onSave={save}
          onCancel={() => setEditing(null)}
          error={error}
        />
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Status</th>
              <th>Who sees it</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id}>
                <td>
                  <strong>{game.name}</strong>
                  <br />
                  {game.path}
                </td>
                <td>{GAME_STATUS_LABELS[game.status]}</td>
                <td>{game.visibility}</td>
                <td className="admin-row-actions">
                  <button className="link-button" type="button" onClick={() => setEditing(game.id)}>
                    Edit
                  </button>
                  {confirmDelete === game.id ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={() =>
                        run(() => api(`/admin/games/${game.id}`, { method: 'DELETE' }))
                      }
                    >
                      Really delete {game.name}?
                    </button>
                  ) : (
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setConfirmDelete(game.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
