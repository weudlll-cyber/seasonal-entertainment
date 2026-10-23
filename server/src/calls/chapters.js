// ============================================================
// File:        chapters.js
// Path:        server/src/calls/chapters.js
// Project:     Seasonal Entertainment
// Description: Data access for a recording's chapter marks (docs/CALLS.md, "Recording"): a time
//              in seconds and a title, kept on this site; listed in time order; gone with their
//              recording (ON DELETE CASCADE).
// ============================================================

const now = () => new Date().toISOString();
const COLUMNS = 'id, recording_id AS recordingId, at_seconds AS at, title';

// The chapters of these recordings: Map recording id -> [{ id, at, title }], in time order.
export function chaptersOf(db, recordingIds) {
  const byRecording = new Map(recordingIds.map((id) => [id, []]));
  if (recordingIds.length === 0) return byRecording;
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM call_recording_chapters
       WHERE recording_id IN (${recordingIds.map(() => '?').join(',')})
       ORDER BY at_seconds, id`
    )
    .all(...recordingIds);
  for (const { recordingId, ...chapter } of rows) byRecording.get(recordingId).push(chapter);
  return byRecording;
}

export function findChapter(db, recordingId, id) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM call_recording_chapters WHERE recording_id = ? AND id = ?`)
    .get(recordingId, id);
}

export function addChapter(db, recordingId, { at, title }, by) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO call_recording_chapters (recording_id, at_seconds, title, created_by, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(recordingId, at, title, by, now());
  return findChapter(db, recordingId, Number(lastInsertRowid));
}

export function updateChapter(db, id, { at, title }) {
  db.prepare('UPDATE call_recording_chapters SET at_seconds = ?, title = ? WHERE id = ?').run(
    at,
    title,
    id
  );
}

export function deleteChapter(db, id) {
  db.prepare('DELETE FROM call_recording_chapters WHERE id = ?').run(id);
}
