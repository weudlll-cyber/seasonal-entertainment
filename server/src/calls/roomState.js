// ============================================================
// File:        roomState.js
// Path:        server/src/calls/roomState.js
// Project:     Seasonal Entertainment
// Description: What every client of a call reads from the room's metadata on the call service
//              (docs/CALLS.md): the spotlight (spotlight.js), whether a recording runs (also
//              while it starts: joining asks for consent from then on), how far it is (starting
//              or active) and when the last start failed (recordings.js, recordingStart.js). One
//              place builds it, so setting one never drops the other.
// ============================================================

import { activeRecording, recordingFailedAt, stateOf } from './recordings.js';
import { spotlightOf } from './store.js';

function roomState(db, callId) {
  const running = activeRecording(db, callId);
  return JSON.stringify({
    spotlight: spotlightOf(db, callId),
    recording: Boolean(running),
    recordingState: running ? stateOf(running) : null,
    recordingFailedAt: recordingFailedAt(db, callId),
  });
}

// Sets it on the call service for this call's room.
export const publishRoomState = (db, service, call) =>
  service.setRoomMetadata(call.roomName, roomState(db, call.id));
