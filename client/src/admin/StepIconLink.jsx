// ============================================================
// File:        StepIconLink.jsx
// Path:        client/src/admin/StepIconLink.jsx
// Project:     Seasonal Entertainment
// Description: "Icon from link" in a Discord step's row (StepRow.jsx): the link of a role icon on
//              Discord's image servers (cdn.discordapp.com or media.discordapp.net). The server
//              fetches it once and stores it like an uploaded icon (server/src/discord/
//              iconLink.js); its refusals (wrong host, not an image, too large, unreachable) show
//              as the page's error.
// ============================================================

import { api } from '../api/http.js';

// run(call): the page's runner (errors shown, list reloaded).
export default function StepIconLink({ step, run }) {
  function fetchIcon(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const url = String(new FormData(form).get('url')).trim();
    run(async () => {
      await api(`/admin/discord/steps/${step.id}/icon-link`, { method: 'POST', body: { url } });
      form.reset();
    });
  }

  return (
    <form className="step-row__fields" onSubmit={fetchIcon}>
      <input
        name="url"
        type="url"
        aria-label={`Icon link of ${step.name}`}
        placeholder="https://cdn.discordapp.com/…"
        required
      />
      <button className="button button--secondary" type="submit">
        Icon from link
      </button>
    </form>
  );
}
