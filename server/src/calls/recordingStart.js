// ============================================================
// File:        recordingStart.js
// Path:        server/src/calls/recordingStart.js
// Project:     Seasonal Entertainment
// Description: A recording is "starting" until the egress really records (docs/CALLS.md,
//              "Recording"; decided 2026-11-07): live, the egress took about 20 s from the start
//              request to its first frame, and the site said "Recording" all that time. This
//              watch asks the egress for the recording's state (service.listEgress) at once and
//              then every POLL_MS instead of a LiveKit webhook (no receiver, no new config). Active: the row
//              becomes active and every client is told (publishRoomState). Failed, aborted or
//              ended, or still not active after START_LIMIT_MS: the egress is stopped if it still
//              runs, the row goes (no file) and the call keeps the time of the failed start for
//              the organisers' message. A recording stopped meanwhile (the stop route, the call
//              ending) ends the watch. A restart picks up every recording still starting
//              (resumeRecordingStarts, from the calls job in app.js).
// ============================================================

import { publishRoomState } from './roomState.js';
import {
  activeRecording,
  dropStartingRecording,
  markRecordingActive,
  startingRecordings,
} from './recordings.js';
import { findCall } from './store.js';

export const POLL_MS = 2000;
export const START_LIMIT_MS = 60_000;
// The egress's states (service.js EGRESS_STATES) after which this recording will not start.
const OVER = new Set(['ending', 'complete', 'failed', 'aborted', 'limit_reached']);

// Tells every client; a room already gone (the call ended) only means nobody is left to tell.
async function publish(db, service, call) {
  try {
    await publishRoomState(db, service, call);
  } catch (error) {
    console.error(`[calls] recording state of call ${call.id} not published: ${error.message}`);
  }
}

// The start did not come: the egress stopped (a stop of one that ended is fine, service.js),
// the row dropped, the call noted for the organisers' "did not start" message.
async function failed(db, service, call, running, why) {
  console.error(`[calls] recording of call ${call.id} did not start (${why})`);
  try {
    await service.stopRecording(running.egressId);
  } catch (error) {
    console.error(`[calls] recording of call ${call.id} not stopped: ${error.message}`);
  }
  dropStartingRecording(db, running, { notice: true });
  await publish(db, service, call);
}

// Watches recording `recordingId` of `call` ({ id, roomName }) until it is active or given up.
// The limit runs from the row's start time, so a watch picked up after a restart keeps it.
export function watchRecordingStart(db, service, call, recordingId) {
  const tick = async () => {
    try {
      const running = activeRecording(db, call.id);
      // Stopped meanwhile, or already active: nothing left to watch.
      if (running?.id !== recordingId || running.activeAt) return;
      let status = null;
      try {
        [{ status } = {}] = await service.listEgress(running.egressId);
      } catch (error) {
        // Asked again next time: one lost answer is no failed start.
        console.error(`[calls] recording of call ${call.id}: no egress state: ${error.message}`);
      }
      if (status === 'active') {
        if (markRecordingActive(db, running.id)) await publish(db, service, call);
        return;
      }
      if (OVER.has(status)) return await failed(db, service, call, running, `egress ${status}`);
      if (Date.now() - Date.parse(running.startedAt) >= START_LIMIT_MS) {
        return await failed(db, service, call, running, 'not active within 60 s');
      }
      schedule();
    } catch (error) {
      console.error(`[calls] recording watch of call ${call.id} failed: ${error.message}`);
    }
  };
  // Never keeps the process alive on its own (a stopping server, a test run).
  const schedule = () => setTimeout(tick, POLL_MS).unref?.();
  tick();
}

// After a restart: every recording still starting is watched again.
export function resumeRecordingStarts(db, service) {
  for (const running of startingRecordings(db)) {
    const call = findCall(db, running.callId);
    if (call) watchRecordingStart(db, service, call, running.id);
  }
}
