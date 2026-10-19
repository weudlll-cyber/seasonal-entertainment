// ============================================================
// File:        staleCalls.js
// Path:        server/src/calls/staleCalls.js
// Project:     Seasonal Entertainment
// Description: The stale-call job: a call marked live whose room no longer exists on the call
//              service (everyone left and the service closed it, or the service restarted) is
//              ended by the site after 10 minutes without that room (decided 2026-10-18),
//              exactly like "End call" (endCall.js, audited as "system"). Runs at server start
//              and then every minute; off when backgroundJobs is off, like the chat retention.
// ============================================================

import { endCall, SYSTEM } from './endCall.js';
import { findCall, liveCallRooms, setRoomMissingSince } from './store.js';

export const STALE_AFTER_MS = 10 * 60_000;
const CHECK_MS = 60_000;

// One check; returns the ids of the calls it ended. The time a room was first found missing
// is stored, so a server restart neither resets nor skips the grace period.
export async function endStaleCalls(db, service, chat, now = Date.now()) {
  const live = liveCallRooms(db);
  if (live.length === 0) return [];
  // Throws when the call service cannot be reached: then nothing counts as missing.
  const existing = new Set(await service.existingRooms(live.map((call) => call.roomName)));
  const ended = [];
  for (const call of live) {
    if (existing.has(call.roomName)) {
      if (call.roomMissingSince) setRoomMissingSince(db, call.id, null); // back again
    } else if (!call.roomMissingSince) {
      setRoomMissingSince(db, call.id, new Date(now).toISOString());
    } else if (now - Date.parse(call.roomMissingSince) >= STALE_AFTER_MS) {
      if (await endCall(db, service, chat, findCall(db, call.id), SYSTEM)) ended.push(call.id);
    }
  }
  return ended;
}

// Starts the job; returns the function that stops it, or null when it does not run (calls not
// configured, or background jobs switched off).
export function startStaleCalls(db, config, service, chat, log = console.log) {
  if (!service || !config.backgroundJobs) return null;
  const run = () =>
    endStaleCalls(db, service, chat)
      .then((ended) => {
        if (ended.length) log(`[calls] ended ${ended.length} live calls whose room was gone`);
      })
      .catch((error) => log(`[calls] stale-call check skipped: ${error.message}`));
  run();
  const timer = setInterval(run, CHECK_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
