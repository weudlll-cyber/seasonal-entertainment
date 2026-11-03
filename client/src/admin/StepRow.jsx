// ============================================================
// File:        StepRow.jsx
// Path:        client/src/admin/StepRow.jsx
// Project:     Seasonal Entertainment
// Description: One Discord step on Admin → Discord steps (AdminDiscordPage.jsx): its icon (or the
//              neutral placeholder), name and Discord role id (saved together), move up / down
//              in its ladder, upload or clear the icon (PNG, WebP or SVG; the server draws it into
//              a 64 x 64 WebP) or take it from a link to Discord's image servers
//              (StepIconLink.jsx), and remove it (the server refuses a step a room is open from, and
//              the row names those rooms).
// ============================================================

import { api, upload } from '../api/http.js';
import { StepIcon } from '../chat/index.js';
import StepIconLink from './StepIconLink.jsx';

// run(call): the page's runner (errors shown, list reloaded); move(step): -1 up, 1 down.
export default function StepRow({ step, first, last, run, move }) {
  function save(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const roleId = String(data.get('roleId')).trim();
    run(() =>
      api(`/admin/discord/steps/${step.id}`, {
        method: 'PUT',
        body: { name: data.get('name'), roleId: roleId || null },
      })
    );
  }

  function iconChosen(event) {
    const file = event.currentTarget.files[0];
    if (file) run(() => upload(`/admin/discord/steps/${step.id}/icon`, file, {}));
  }

  return (
    <li className="step-row">
      <StepIcon step={step} />
      <form className="step-row__fields" onSubmit={save}>
        <input
          name="name"
          aria-label={`Name of ${step.name}`}
          defaultValue={step.name}
          maxLength={40}
          required
        />
        <input
          name="roleId"
          aria-label={`Discord role id of ${step.name}`}
          defaultValue={step.roleId ?? ''}
          placeholder="Discord role id"
          inputMode="numeric"
          pattern="\d{17,20}"
        />
        <button className="button button--secondary" type="submit">
          Save
        </button>
      </form>
      <div className="step-row__actions">
        <button
          className="button button--secondary"
          type="button"
          disabled={first}
          aria-label={`Move ${step.name} down the ladder`}
          title={`Move ${step.name} down the ladder`}
          onClick={() => move(step, -1)}
        >
          ↓
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={last}
          aria-label={`Move ${step.name} up the ladder`}
          title={`Move ${step.name} up the ladder`}
          onClick={() => move(step, 1)}
        >
          ↑
        </button>
        <label className="button button--secondary">
          Icon…
          <input
            type="file"
            accept="image/png,image/webp,image/svg+xml"
            aria-label={`Icon of ${step.name}`}
            onChange={iconChosen}
          />
        </label>
        {step.icon && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() =>
              run(() => api(`/admin/discord/steps/${step.id}/icon`, { method: 'DELETE' }))
            }
          >
            Clear icon
          </button>
        )}
        <button
          className="button button--secondary"
          type="button"
          disabled={step.rooms.length > 0}
          onClick={() => run(() => api(`/admin/discord/steps/${step.id}`, { method: 'DELETE' }))}
        >
          Remove
        </button>
      </div>
      <StepIconLink step={step} run={run} />
      {step.rooms.length > 0 && (
        <p className="form-field__hint">Rooms open from this step on: {step.rooms.join(', ')}</p>
      )}
    </li>
  );
}
