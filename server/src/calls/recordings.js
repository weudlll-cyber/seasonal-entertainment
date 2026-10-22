// ============================================================
// File:        recordings.js
// Path:        server/src/calls/recordings.js
// Project:     Seasonal Entertainment
// Description: Data access for call recordings (docs/CALLS.md, "Recording"): the running one of
//              a call (at most one), starting and stopping its row, a call's recordings with
//              their length, one recording, and deleting one (the file goes with it). Nothing
//              is deleted automatically.
// ============================================================

const now = () => new Date().toISOString();
const COLUMNS = `id, call_id AS callId, egress_id AS egressId, file, started_at AS startedAt,
  stopped_at AS stoppedAt, started_by AS startedBy`;

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

// A call's finished recordings, newest first, with their length in seconds.
export function listRecordings(db, callId) {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM call_recordings
       WHERE call_id = ? AND stopped_at IS NOT NULL ORDER BY id DESC`
    )
    .all(callId)
    .map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      seconds: Math.round((Date.parse(r.stoppedAt) - Date.parse(r.startedAt)) / 1000),
    }));
}

export function findRecording(db, callId, id) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM call_recordings WHERE call_id = ? AND id = ?`)
    .get(callId, id);
}

export function deleteRecordingRow(db, id) {
  db.prepare('DELETE FROM call_recordings WHERE id = ?').run(id);
}
