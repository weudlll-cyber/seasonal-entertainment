// ============================================================
// File:        shareWithGames.js
// Path:        client/src/calls/shareWithGames.js
// Project:     Seasonal Entertainment
// Description: Sharing a call with the games from the browser (docs/CALLS.md): only one call
//              is shared, so when the server answers that another one is (409 shared_elsewhere,
//              with its title), the organiser is asked whether to replace it. Used by the
//              switch (ShareSwitch.jsx) and the New call form (pages/CallsPage.jsx).
// ============================================================

import { ApiError } from '../api/http.js';

// send(replace) makes the request. Resolves to true once it went through, false when another
// call is shared and the organiser keeps it so (nothing changed).
export async function replacingIfAsked(send) {
  try {
    await send(false);
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'shared_elsewhere') throw err;
    const { title } = err.details.call;
    const question = `"${title}" is shared with the games. Replace it with this call?`;
    if (!window.confirm(question)) return false;
    await send(true);
  }
  return true;
}
