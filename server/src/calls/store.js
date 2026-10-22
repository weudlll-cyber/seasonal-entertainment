// ============================================================
// File:        store.js
// Path:        server/src/calls/store.js
// Project:     Seasonal Entertainment
// Description: Data access for calls: create, find, the /calls listing (live, upcoming,
//              recent) and the status changes scheduled -> live -> ended (a scheduled call may
//              also be ended without ever going live: cancelled). A change applies only from
//              the expected status, so two organisers acting at once cannot both succeed.
//              Also the call's spotlight state, the live calls with since when their room
//              has been missing (the stale-call job, staleCalls.js), and the call's link to an
//              event bot occurrence (eventLink.js).
// ============================================================

import { randomBytes } from 'node:crypto';

const now = () => new Date().toISOString();
const RECENT = 10;

const COLUMNS = `c.id, c.title, c.description, c.status, c.scheduled_for AS scheduledFor,
  c.created_at AS createdAt, c.started_at AS startedAt, c.ended_at AS endedAt,
  c.chat_room_id AS chatRoomId, c.room_name AS roomName, u.username AS createdBy,
  c.bot_occurrence_id AS botOccurrenceId, c.bot_occurrence_start AS botOccurrenceStart`;
const FROM = 'calls c LEFT JOIN users u ON u.id = c.created_by';

export function findCall(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM ${FROM} WHERE c.id = ?`).get(id);
}

// call: { title, description, scheduledFor }; the call service room name is random, so it
// says nothing about the call.
export function createCall(db, call, createdBy) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO calls (title, description, scheduled_for, created_by, created_at, room_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      call.title,
      call.description ?? '',
      call.scheduledFor ?? null,
      createdBy,
      now(),
      `call-${randomBytes(8).toString('hex')}`
    );
  return Number(lastInsertRowid);
}

// occurrence: { id, start } of the event bot's occurrence, or null to unlink.
export function setCallEvent(db, id, occurrence) {
  db.prepare('UPDATE calls SET bot_occurrence_id = ?, bot_occurrence_start = ? WHERE id = ?').run(
    occurrence?.id ?? null,
    occurrence?.start ?? null,
    id
  );
}

export function setChatRoom(db, id, chatRoomId) {
  db.prepare('UPDATE calls SET chat_room_id = ? WHERE id = ?').run(chatRoomId, id);
}

// Live first, then upcoming (planned time first, unplanned last), then the latest ended.
export function listCalls(db) {
  const all = (where, order, limit = -1) =>
    db
      .prepare(`SELECT ${COLUMNS} FROM ${FROM} WHERE ${where} ORDER BY ${order} LIMIT ?`)
      .all(limit);
  return {
    live: all("c.status = 'live'", 'c.started_at DESC'),
    upcoming: all(
      "c.status = 'scheduled'",
      'c.scheduled_for IS NULL, c.scheduled_for, c.created_at'
    ),
    recent: all("c.status = 'ended'", 'c.ended_at DESC', RECENT),
  };
}

// The spotlight (spotlight.js): null, or { identity, by }.
export function spotlightOf(db, id) {
  const row = db
    .prepare('SELECT spotlight_identity AS identity, spotlight_by AS by FROM calls WHERE id = ?')
    .get(id);
  return row?.by ? row : null;
}

export function setSpotlight(db, id, state) {
  db.prepare('UPDATE calls SET spotlight_identity = ?, spotlight_by = ? WHERE id = ?').run(
    state?.identity ?? null,
    state?.by ?? null,
    id
  );
}

// The live calls the stale-call job looks at: { id, roomName, roomMissingSince }.
export const liveCallRooms = (db) =>
  db
    .prepare(
      `SELECT id, room_name AS roomName, room_missing_since AS roomMissingSince
       FROM calls WHERE status = 'live'`
    )
    .all();

// since: an ISO time the room was first found missing, or null once it is there again.
export function setRoomMissingSince(db, id, since) {
  db.prepare('UPDATE calls SET room_missing_since = ? WHERE id = ?').run(since, id);
}

export const anyCallLive = (db) =>
  Boolean(db.prepare("SELECT 1 FROM calls WHERE status = 'live' LIMIT 1").get());

// true when the call was scheduled and is live now.
export function markLive(db, id) {
  return (
    db
      .prepare(
        "UPDATE calls SET status = 'live', started_at = ? WHERE id = ? AND status = 'scheduled'"
      )
      .run(now(), id).changes === 1
  );
}

// true when the call was scheduled or live and is ended now.
export function markEnded(db, id) {
  return (
    db
      .prepare("UPDATE calls SET status = 'ended', ended_at = ? WHERE id = ? AND status != 'ended'")
      .run(now(), id).changes === 1
  );
}
