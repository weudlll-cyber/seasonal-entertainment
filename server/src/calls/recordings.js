// ============================================================
// File:        recordings.js
// Path:        server/src/calls/recordings.js
// Project:     Seasonal Entertainment
// Description: Data access for call recordings (docs/CALLS.md, "Recording"): the running one of
//              a call (at most one), starting and stopping its row, a call's recordings and
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
  stopped_at AS stoppedAt, started_by AS startedBy, seconds`;

export function activeRecording(db, callId) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM call_recordings WHERE call_id = ? AND stopped_at IS NULL`)
    .get(callId);
}

// Live calls being recorded right now, by call id (the Calls page's "Being recorded").
export function recordedCallIds(db) {
  return new Set(
    db
      .prepare('SELECT call_id AS id FROM call_recordings WHERE stopped_at IS NULL')
      .all()
      .map((r) => r.id)
  );
}

export function addRecording(db, { callId, egressId, file, startedBy }) {
  db.prepare(
    `INSERT INTO call_recordings (call_id, egress_id, file, started_at, started_by)
     VALUES (?, ?, ?, ?, ?)`
  ).run(callId, egressId, file, now(), startedBy);
}

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

export function findRecording(db, callId, id) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM call_recordings WHERE call_id = ? AND id = ?`)
    .get(callId, id);
}

export function deleteRecordingRow(db, id) {
  db.prepare('DELETE FROM call_recordings WHERE id = ?').run(id);
}
