// ============================================================
// File:        spotlightUpdate.js
// Path:        server/src/calls/spotlightUpdate.js
// Project:     Seasonal Entertainment
// Description: Applies a spotlight action (spotlight.js) to a call: stores the new state and
//              sets it as the room's metadata on the call service, which every client reads.
// ============================================================

import { nextSpotlight } from './spotlight.js';
import { setSpotlight, spotlightOf } from './store.js';

// Returns { state } or { refused }.
export async function applySpotlight(db, service, call, action) {
  const current = spotlightOf(db, call.id);
  const result = nextSpotlight(current, action);
  if (result.refused || result.state === current) return result;
  setSpotlight(db, call.id, result.state);
  await service.setRoomMetadata(call.roomName, JSON.stringify({ spotlight: result.state }));
  return result;
}
