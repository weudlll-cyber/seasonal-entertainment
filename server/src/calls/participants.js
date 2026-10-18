// ============================================================
// File:        participants.js
// Path:        server/src/calls/participants.js
// Project:     Seasonal Entertainment
// Description: Who joined a call, as the server knows it: one row per call and person
//              (account or guest) with a random identity for the call service — it says nothing
//              about the account — whether their hand is raised (members only) and whether
//              they are on the stage.
// ============================================================

import { randomBytes } from 'node:crypto';

const now = () => new Date().toISOString();
const COLUMNS = `call_id AS callId, identity, user_id AS userId, guest_id AS guestId,
  hand_raised_at AS handRaisedAt, on_stage AS onStage`;
const toParticipant = (row) => row && { ...row, onStage: row.onStage === 1 };

export function findParticipant(db, callId, identity) {
  return toParticipant(
    db
      .prepare(`SELECT ${COLUMNS} FROM call_participants WHERE call_id = ? AND identity = ?`)
      .get(callId, identity)
  );
}

export function findParticipantOfUser(db, callId, userId) {
  return toParticipant(
    db
      .prepare(`SELECT ${COLUMNS} FROM call_participants WHERE call_id = ? AND user_id = ?`)
      .get(callId, userId)
  );
}

// who: { userId } or { guestId }. The same person keeps one identity for the whole call.
export function participantFor(db, callId, { userId = null, guestId = null }) {
  const find = () =>
    toParticipant(
      db
        .prepare(
          `SELECT ${COLUMNS} FROM call_participants
           WHERE call_id = ? AND (user_id = ? OR guest_id = ?)`
        )
        .get(callId, userId, guestId)
    );
  const existing = find();
  if (existing) return existing;
  db.prepare(
    'INSERT INTO call_participants (call_id, identity, user_id, guest_id) VALUES (?, ?, ?, ?)'
  ).run(callId, `p-${randomBytes(12).toString('hex')}`, userId, guestId);
  return find();
}

// Returns the stored time (null when lowered), which the clients see as well.
export function setHand(db, callId, identity, raised) {
  const at = raised ? now() : null;
  db.prepare(
    'UPDATE call_participants SET hand_raised_at = ? WHERE call_id = ? AND identity = ?'
  ).run(at, callId, identity);
  return at;
}

// Joining the stage lowers the hand.
export function setOnStage(db, callId, identity, onStage) {
  db.prepare(
    `UPDATE call_participants SET on_stage = ?, hand_raised_at = CASE WHEN ? THEN NULL ELSE hand_raised_at END
     WHERE call_id = ? AND identity = ?`
  ).run(onStage ? 1 : 0, onStage ? 1 : 0, callId, identity);
}
