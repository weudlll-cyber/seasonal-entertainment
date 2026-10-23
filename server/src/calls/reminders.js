// ============================================================
// File:        reminders.js
// Path:        server/src/calls/reminders.js
// Project:     Seasonal Entertainment
// Description: "Remind me on this site" (docs/CALLS.md, "Reminders"): a member's reminder for
//              a call (table call_reminders, schema.js), and the job that tells their open
//              pages when the call is 10 minutes from its planned start ("soon") and when it
//              goes live ("live"). The notice travels as a personal event over the chat's live
//              connection (mountChat's notify). Each kind is sent once per member and call:
//              marked in the table only once it reached an open page, so a member who opens the
//              site within the window still gets it, and a restart never repeats one. The job
//              runs like the stale-call job (staleCalls.js): at start, then every 30 seconds,
//              and a round runs at once when a call goes live (routes.js). Reminders go with
//              the call's end (endCall.js).
// ============================================================

const SOON_MS = 10 * 60_000;
const CHECK_MS = 30_000;
const now = () => new Date().toISOString();

export function setReminder(db, userId, callId) {
  db.prepare(
    'INSERT OR IGNORE INTO call_reminders (user_id, call_id, created_at) VALUES (?, ?, ?)'
  ).run(userId, callId, now());
}

export function removeReminder(db, userId, callId) {
  db.prepare('DELETE FROM call_reminders WHERE user_id = ? AND call_id = ?').run(userId, callId);
}

// When a call ends (endCall.js): nothing more to remind of.
export function removeCallReminders(db, callId) {
  db.prepare('DELETE FROM call_reminders WHERE call_id = ?').run(callId);
}

// The ids of the calls this member has a reminder for.
export const reminderCallIds = (db, userId) =>
  db
    .prepare('SELECT call_id AS id FROM call_reminders WHERE user_id = ?')
    .all(userId)
    .map((row) => row.id);

// Notices due at `at` (ms) and not yet delivered: "soon" for a scheduled call starting within
// 10 minutes (not after its start: then it is late, and "live" follows), "live" for a live
// call. Each row: { userId, callId, title, scheduledFor, kind }.
function dueNotices(db, at = Date.now()) {
  const from = new Date(at).toISOString();
  const until = new Date(at + SOON_MS).toISOString();
  return db
    .prepare(
      `SELECT r.user_id AS userId, c.id AS callId, c.title, c.scheduled_for AS scheduledFor,
              CASE c.status WHEN 'live' THEN 'live' ELSE 'soon' END AS kind
       FROM call_reminders r JOIN calls c ON c.id = r.call_id
       WHERE (c.status = 'live' AND r.live_sent_at IS NULL)
          OR (c.status = 'scheduled' AND r.soon_sent_at IS NULL
              AND c.scheduled_for > ? AND c.scheduled_for <= ?)`
    )
    .all(from, until);
}

function markSent(db, { userId, callId, kind }) {
  const column = kind === 'live' ? 'live_sent_at' : 'soon_sent_at';
  db.prepare(`UPDATE call_reminders SET ${column} = ? WHERE user_id = ? AND call_id = ?`).run(
    now(),
    userId,
    callId
  );
}

// One round: every due notice to its member's open pages. notify(userId, event) returns how
// many pages got it; a notice nobody received stays due. Returns the number delivered.
export function sendCallReminders(db, notify, at = Date.now()) {
  let delivered = 0;
  for (const due of dueNotices(db, at)) {
    const event = {
      type: 'callReminder',
      kind: due.kind,
      call: { id: due.callId, title: due.title, scheduledFor: due.scheduledFor },
    };
    if (notify(due.userId, event) > 0) {
      markSent(db, due);
      delivered += 1;
    }
  }
  return delivered;
}

// Starts the job; returns the function that stops it, or null when background jobs are off.
export function startCallReminders(db, config, notify, log = console.log) {
  if (!config.backgroundJobs) return null;
  const run = () => {
    try {
      sendCallReminders(db, notify);
    } catch (error) {
      log(`[calls] reminder round skipped: ${error.message}`);
    }
  };
  run();
  const timer = setInterval(run, CHECK_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
