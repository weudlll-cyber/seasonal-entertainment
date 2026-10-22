// ============================================================
// File:        spotlightUpdate.js
// Path:        server/src/calls/spotlightUpdate.js
// Project:     Seasonal Entertainment
// Description: Applies a spotlight action (spotlight.js) to a call: stores the new state and
//              sets it in the room's metadata on the call service (with the recording state,
//              roomState.js), which every client reads.
//              A failure (database or call service) is logged with its details and reported as
//              { failed: true }: the spotlight is a convenience, the call goes on without it
//              (every client shows a screen share large by itself, SE-CALLS-2).
// ============================================================

import { publishRoomState } from './roomState.js';
import { nextSpotlight } from './spotlight.js';
import { setSpotlight, spotlightOf } from './store.js';

// Returns { state }, { refused } or { failed: true }.
export async function applySpotlight(db, service, call, action) {
  try {
    const current = spotlightOf(db, call.id);
    const result = nextSpotlight(current, action);
    if (result.refused || result.state === current) return result;
    setSpotlight(db, call.id, result.state);
    await publishRoomState(db, service, call);
    return result;
  } catch (error) {
    console.error(`[calls] spotlight update failed for call ${call.id} (${action.type}):`, error);
    return { failed: true };
  }
}
