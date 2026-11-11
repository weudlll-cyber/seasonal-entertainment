// ============================================================
// File:        recordings.js
// Path:        server/src/calls/recordings.js
// Project:     Seasonal Entertainment
// Description: Data access for call recordings (docs/CALLS.md, "Recording"): the running one of
//              a call (at most one; "starting" until the egress reports it active, then
//              "active"), adding, activating and stopping its row, the rows still starting, a
//              failed start's time on the call, a call's recordings and
//              every recording (the archive), with their length and chapters, one recording,
//              and deleting one (the file goes with it). Nothing
//              is deleted automatically. The length is the file's own (mp4Duration.js), read
//              once the file is complete and then kept; never computed from the start and stop
//              times, which include the egress's start-up. Unknown: null (no length shown).
// ============================================================

import path from 'node:path';
import { chaptersOf } from './chapters.js';
import { mp4Duration } from './mp4Duration.js';

const now = () => new Date().toISOString();
const COLUMNS = `id, call_id AS callId, egress_id AS egressId, file, started_at AS startedAt,
  stopped_at AS stoppedAt, started_by AS startedBy, seconds, active_at AS activeAt,
  from_start AS fromStart`;

export function activeRecording(db, callId) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM call_recordings WHERE call_id = ? AND stopped_at IS NULL`)
    .get(callId);
}

// A running recording's state: 'starting' until the egress reports it active, then 'active';
// one started with its call is 'waiting' instead (for the first speaker, recordingStart.js).
export function stateOf(running) {
  if (running.activeAt) return 'active';
  return running.fromStart ? 'waiting' : 'starting';
}

// Live calls being recorded right now: call id -> its stateOf (the Calls page).
export function recordingStates(db) {
  return new Map(
    db
      .prepare(
        `SELECT call_id AS id, active_at AS activeAt, from_start AS fromStart
         FROM call_recordings WHERE stopped_at IS NULL`
      )
      .all()
      .map((r) => [r.id, stateOf(r)])
  );
}

// Every recording still starting (a restart picks their watch up again, recordingStart.js).
export function startingRecordings(db) {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM call_recordings WHERE stopped_at IS NULL AND active_at IS NULL`
    )
    .all();
}

// A new row, starting (fromStart: started with its call); its id. A new start also clears the
// call's last failed start.
export function addRecording(db, { callId, egressId, file, startedBy, fromStart = false }) {
  db.prepare('UPDATE calls SET recording_failed_at = NULL WHERE id = ?').run(callId);
  return Number(
    db
      .prepare(
        `INSERT INTO call_recordings (call_id, egress_id, file, started_at, started_by, from_start)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(callId, egressId, file, now(), startedBy, fromStart ? 1 : 0).lastInsertRowid
  );
}

// A start that did not come, for the organisers' "did not start" message.
export function noteFailedStart(db, callId) {
  db.prepare('UPDATE calls SET recording_failed_at = ? WHERE id = ?').run(now(), callId);
}

// The egress reported it active; true when this did it (the row still starting).
export function markRecordingActive(db, id) {
  return (
    db
      .prepare(
        'UPDATE call_recordings SET active_at = ? WHERE id = ? AND active_at IS NULL AND stopped_at IS NULL'
      )
      .run(now(), id).changes === 1
  );
}

// A start that did not come: the row goes (no file) and, notice: true, the call keeps the time
// for the organisers' message (recordingFailedAt).
export function dropStartingRecording(db, recording, { notice }) {
  db.transaction(() => {
    db.prepare('DELETE FROM call_recordings WHERE id = ?').run(recording.id);
    if (notice) noteFailedStart(db, recording.callId);
  })();
}

export const recordingFailedAt = (db, callId) =>
  db.prepare('SELECT recording_failed_at AS at FROM calls WHERE id = ?').get(callId)?.at ?? null;

// true when this stopped it (a second stop at the same time does nothing).
export function markRecordingStopped(db, id) {
  return (
    db
      .prepare('UPDATE call_recordings SET stopped_at = ? WHERE id = ? AND stopped_at IS NULL')
      .run(now(), id).changes === 1
  );
}

// A finished recording's length in seconds: the stored one, else read from its file once and
// kept; null while unknown. recording: { id, file, seconds }; dir: the recordings folder.
export function recordingLength(db, recording, dir) {
  if (recording.seconds !== null) return recording.seconds;
  const seconds = mp4Duration(path.join(dir, recording.file));
  if (seconds !== null) {
    db.prepare('UPDATE call_recordings SET seconds = ? WHERE id = ?').run(seconds, recording.id);
  }
  return seconds;
}

// Finished recordings as listed: with their length and their chapters.
function asListed(db, rows, dir) {
  const chapters = chaptersOf(
    db,
    rows.map((r) => r.id)
  );
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    seconds: recordingLength(db, r, dir),
    chapters: chapters.get(r.id),
  }));
}

// A call's finished recordings, newest first.
export function listRecordings(db, callId, dir) {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM call_recordings
       WHERE call_id = ? AND stopped_at IS NOT NULL ORDER BY id DESC`
    )
    .all(callId);
  return asListed(db, rows, dir);
}

// Every finished recording, newest first, with its call's id and title (the archive,
// /calls/recordings; calls, and so their recordings, are shown to everyone).
export function listAllRecordings(db, dir) {
  const rows = db
    .prepare(
      `SELECT r.id, r.call_id AS callId, r.file, r.started_at AS startedAt, r.seconds, c.title
       FROM call_recordings r JOIN calls c ON c.id = r.call_id
       WHERE r.stopped_at IS NOT NULL ORDER BY r.started_at DESC, r.id DESC`
    )
    .all();
  const listed = asListed(db, rows, dir);
  return rows.map((r, i) => ({ ...listed[i], callId: r.callId, title: r.title }));
}

// One finished recording as the archive lists it (its call's id and title too), or null: the
// share page (/recordings/:id, recordingShare.js) and GET /api/calls/recordings/:rid.
export function findListedRecording(db, id, dir) {
  const row = db
    .prepare(
      `SELECT r.id, r.call_id AS callId, r.file, r.started_at AS startedAt, r.seconds, c.title
       FROM call_recordings r JOIN calls c ON c.id = r.call_id
       WHERE r.id = ? AND r.stopped_at IS NOT NULL`
    )
    .get(id);
  if (!row) return null;
  return { ...asListed(db, [row], dir)[0], callId: row.callId, title: row.title };
}

export function findRecording(db, callId, id) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM call_recordings WHERE call_id = ? AND id = ?`)
    .get(callId, id);
}

export function deleteRecordingRow(db, id) {
  db.prepare('DELETE FROM call_recordings WHERE id = ?').run(id);
}
