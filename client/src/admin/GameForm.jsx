// ============================================================
// File:        GameForm.jsx
// Path:        client/src/admin/GameForm.jsx
// Project:     Seasonal Entertainment
// Description: Form for one game card: name, description, image, status, path, visibility.
// ============================================================

import { useState } from 'react';
import {
  GAME_IMAGES,
  GAME_STATUSES,
  GAME_STATUS_LABELS,
  GAME_VISIBILITIES,
} from '@seasonal-entertainment/shared/gameRules.js';
import { FormField, FormMessage } from '../components/FormField.jsx';

export const NEW_GAME = {
  name: '',
  description: '',
  image: 'seasonal-tokens',
  status: 'coming_soon',
  path: '/games/',
  visibility: 'everyone',
};

function Choice({ label, value, options, onChange, labels = {} }) {
  return (
    <label className="form-field">
      <span className="form-field__label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function GameForm({ initial, onSave, onCancel, error }) {
  const [game, setGame] = useState(initial);
  const set = (name) => (value) => setGame({ ...game, [name]: value });

  return (
    <form
      className="form"
      aria-label="Game"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(game);
      }}
    >
      <FormField
        label="Name"
        type="text"
        value={game.name}
        onChange={(e) => set('name')(e.target.value)}
        required
      />
      <FormField
        label="Description"
        type="text"
        value={game.description}
        onChange={(e) => set('description')(e.target.value)}
      />
      <Choice label="Image" value={game.image} options={GAME_IMAGES} onChange={set('image')} />
      <Choice
        label="Status"
        value={game.status}
        options={GAME_STATUSES}
        labels={GAME_STATUS_LABELS}
        onChange={set('status')}
      />
      <FormField
        label="Path"
        type="text"
        value={game.path}
        onChange={(e) => set('path')(e.target.value)}
        hint="Where the game lives, e.g. /games/race."
        required
      />
      <Choice
        label="Who sees it"
        value={game.visibility}
        options={GAME_VISIBILITIES}
        onChange={set('visibility')}
      />
      <FormMessage error={error} />
      <div className="admin-row-actions">
        <button className="button" type="submit">
          Save game
        </button>
        <button className="link-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
