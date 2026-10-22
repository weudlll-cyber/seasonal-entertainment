// ============================================================
// File:        roomState.js
// Path:        server/src/calls/roomState.js
// Project:     Seasonal Entertainment
// Description: What every client of a call reads from the room's metadata on the call service
//              (docs/CALLS.md): the spotlight (spotlight.js) and whether a recording runs
//              (recordings.js). One place builds it, so setting one never drops the other.
// ============================================================

import { activeRecording } from './recordings.js';
import { spotlightOf } from './store.js';

export const roomState = (db, callId) =>
  JSON.stringify({
    spotlight: spotlightOf(db, callId),
    recording: Boolean(activeRecording(db, callId)),
  });

// Sets it on the call service for this call's room.
export const publishRoomState = (db, service, call) =>
  service.setRoomMetadata(call.roomName, roomState(db, call.id));
