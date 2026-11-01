// ============================================================
// File:        UpdateNotice.jsx
// Path:        client/src/app/UpdateNotice.jsx
// Project:     Seasonal Entertainment
// Description: "A new version of this site is available" with a Reload button, at the top of
//              the main column (Layout), once the server reports another commit than the one
//              this page was built from (docs/DEPLOYMENT.md, "Updating"). It asks
//              GET /api/health every CHECK_MS while the tab is visible, and when the chat
//              connection is back after a drop (the site restarts on an update). A page without
//              a build commit (the dev server, unless SE_DEV_BUILD_COMMIT is set; vite.config.js)
//              never asks.
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { onReconnect } from '../chat/index.js';
import './SiteBanner.css';

export const CHECK_MS = 5 * 60_000;

// Set by the build (vite.config.js): the commit, 12 characters as /api/health reports it.
const BUILD_COMMIT = import.meta.env.SE_BUILD_COMMIT;

// Neither side knows its commit (a build without git): nothing to compare.
const known = (commit) => Boolean(commit) && commit !== 'unknown';

export default function UpdateNotice({ buildCommit = BUILD_COMMIT }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!known(buildCommit) || available) return undefined;
    let stopped = false;
    const check = async () => {
      // A hidden tab waits: the next check after it is shown again is soon enough.
      if (document.visibilityState === 'hidden') return;
      try {
        const { commit } = await api('/health');
        if (!stopped && known(commit) && commit !== buildCommit) setAvailable(true);
      } catch {
        // Down for the moment (the update restarts it): the next check asks again.
      }
    };
    const timer = setInterval(check, CHECK_MS);
    const stopListening = onReconnect(check);
    return () => {
      stopped = true;
      clearInterval(timer);
      stopListening();
    };
  }, [buildCommit, available]);

  if (!available) return null;
  return (
    // News for the reader, not an emergency: announced when the reader is free.
    <p className="banner site-banner site-banner--info" role="status">
      <span>A new version of this site is available.</span>
      <button
        type="button"
        className="button button--primary"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </p>
  );
}
