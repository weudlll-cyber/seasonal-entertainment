// ============================================================
// File:        returnCheck.js
// Path:        client/src/session/returnCheck.js
// Project:     Seasonal Entertainment
// Description: The check when a member comes back to the site's tab or window (decided
//              2026-11-13): while the page shows a member, the tab becoming visible again or
//              the window regaining focus asks GET /api/auth/session once. If the server says
//              nobody is signed in, that goes through reportSessionEnded (api/http.js), the same
//              place a "not_authenticated" answer goes, so the same notice shows. One request
//              at a time and none within RETURN_CHECK_GAP_MS of the last, so fast switching
//              (or visibility and focus firing together) asks once. Used by SessionContext.jsx;
//              docs/AUTH.md, "Sessions".
// ============================================================

import { useEffect } from 'react';
import { api, reportSessionEnded } from '../api/http.js';

export const RETURN_CHECK_GAP_MS = 5_000;

export function useReturnCheck(signedIn) {
  useEffect(() => {
    if (!signedIn) return undefined;
    let asking = false;
    let lastAsked = 0;
    const check = () => {
      if (document.visibilityState !== 'visible' || asking) return;
      if (Date.now() - lastAsked < RETURN_CHECK_GAP_MS) return;
      asking = true;
      lastAsked = Date.now();
      api('/auth/session')
        .then((data) => {
          if (!data.user) reportSessionEnded();
        })
        // No answer is not "nobody": the member stays until the server says so.
        .catch(() => {})
        .finally(() => {
          asking = false;
        });
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [signedIn]);
}
