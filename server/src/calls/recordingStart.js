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
//              (resumeRecordingStarts, from the calls job in app.js). startCallRecording is the
//              one way a recording starts: the button (recordingRoutes.js) and a call recorded
//              from its start (routes.js, decided 2026-11-07). That one waits for the first
//              speaker without a time limit (the egress's template waits for media, egress
//              v1.15.0 template-default/src/Room.tsx:66-110): no 60 s rule, and when the egress
//              ends it unstarted because its room closed or the call ended, the row goes without
//              the failure notice; any other end (failed, or aborted with the room still there)
//              is a real failure and gets it, as for the button (fixed 2026-11-09).
// ============================================================

import { randomBytes } from 'node:crypto';
import { publishRoomState } from './roomState.js';
import {
  activeRecording,
  addRecording,
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

// The call is over for its recording: ended on the site, or its room gone on the call service
// (LiveKit's empty timeout). Egress reports both as aborted, like a real failure (egress v1.15.0
// pkg/pipeline/controller.go:381-396, :561-564), so the site asks itself. Unknown (the call
// service does not answer): not over, so the organisers hear of it.
async function callOver(db, service, call) {
  if (findCall(db, call.id)?.status === 'ended') return true;
  try {
    return !(await service.existingRooms([call.roomName])).includes(call.roomName);
  } catch {
    return false;
  }
}

// The start did not come: the egress stopped (a stop of one that ended is fine, service.js),
// the row dropped and the call noted for the organisers' "did not start" message, except for a
// recording that waited for the first speaker of a call that is over now (nobody spoke).
async function failed(db, service, call, running, why) {
  const notice = !(running.fromStart && (await callOver(db, service, call)));
  if (notice) console.error(`[calls] recording of call ${call.id} did not start (${why})`);
  try {
    await service.stopRecording(running.egressId);
  } catch (error) {
    console.error(`[calls] recording of call ${call.id} not stopped: ${error.message}`);
  }
  dropStartingRecording(db, running, { notice });
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
      if (!running.fromStart && Date.now() - Date.parse(running.startedAt) >= START_LIMIT_MS) {
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

// Starts recording `call` ({ id, roomName }) for the organiser `startedBy` (a username);
// fromStart: started with the call. Resolves once the egress took the job; service.startRecording's
// error is the caller's (the button answers 503, a call's start keeps running).
export async function startCallRecording(db, service, call, startedBy, { fromStart = false } = {}) {
  const file = `call-${call.id}-${Date.now()}-${randomBytes(4).toString('hex')}.mp4`;
  const egressId = await service.startRecording(call.roomName, file);
  const id = addRecording(db, { callId: call.id, egressId, file, startedBy, fromStart });
  await publishRoomState(db, service, call);
  watchRecordingStart(db, service, call, id);
}

// After a restart: every recording still starting is watched again.
export function resumeRecordingStarts(db, service) {
  for (const running of startingRecordings(db)) {
    const call = findCall(db, running.callId);
    if (call) watchRecordingStart(db, service, call, running.id);
  }
}
