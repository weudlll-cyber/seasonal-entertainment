// ============================================================
// File:        store.js
// Path:        server/src/chat/store.js
// Project:     Seasonal Entertainment
// Description: Data access for the chat: rooms, guest names (unique while held), reports and
//              sanctions. Messages: messages.js.
// ============================================================

import { randomBytes } from 'node:crypto';
import { GUEST_PREFIX } from '@seasonal-entertainment/shared/chatRules.js';
import { base32Encode } from '../twofa/totp.js';

const now = () => new Date().toISOString();
const ROOM_COLUMNS = `id, slug, name, read_access AS readAccess, write_access AS writeAccess,
  guest_writable AS guestWritable, position, listed, closed`;

const toRoom = (row) =>
  row && {
    ...row,
    guestWritable: row.guestWritable === 1,
    listed: row.listed === 1,
    closed: row.closed === 1,
  };

// --- rooms ---------------------------------------------------------------------------
// The listed rooms (room lists, unread counters, the admin's room editor); include: the slug
// of one unlisted room to add (a call's chat, for the panel that shows it).
export function listRooms(db, { include = null } = {}) {
  return db
    .prepare(
      `SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE listed = 1 OR slug = ? ORDER BY position, id`
    )
    .all(include)
    .map(toRoom);
}

// An unlisted room for another area (a call's chat, calls/): created hidden from the room
// lists; closeRoom() makes it read-only for everyone (messages stay, normal retention).
export function createUnlistedRoom(db, room) {
  const created = saveRoom(db, room);
  db.prepare('UPDATE chat_rooms SET listed = 0 WHERE id = ?').run(created.id);
  return findRoom(db, created.id);
}

export function closeRoom(db, id) {
  db.prepare('UPDATE chat_rooms SET closed = 1 WHERE id = ?').run(id);
}

export function findRoomBySlug(db, slug) {
  return toRoom(db.prepare(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE slug = ?`).get(slug));
}

export function findRoom(db, id) {
  return toRoom(db.prepare(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE id = ?`).get(id));
}

export function saveRoom(db, room, id) {
  const values = [
    room.slug,
    room.name,
    room.readAccess,
    room.writeAccess,
    room.guestWritable ? 1 : 0,
  ];
  if (id === undefined) {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO chat_rooms (slug, name, read_access, write_access, guest_writable, position)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM chat_rooms))`
      )
      .run(...values);
    return findRoom(db, Number(lastInsertRowid));
  }
  db.prepare(
    `UPDATE chat_rooms SET slug = ?, name = ?, read_access = ?, write_access = ?, guest_writable = ?
     WHERE id = ?`
  ).run(...values, id);
  return findRoom(db, id);
}

// --- guests --------------------------------------------------------------------------
// Six base32 characters (a-z, 2-7): about a billion names, so running out is impossible in
// practice while names are released after 30 days unused and new ones are limited per IP.
const randomGuestSuffix = () => base32Encode(randomBytes(4)).slice(0, 6).toLowerCase();

// A name nobody holds right now: retried until the UNIQUE constraint accepts it. null if
// every try collided (the route answers 503, never 500).
export function assignGuestName(db, random = randomGuestSuffix) {
  const id = randomBytes(16).toString('hex');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO chat_guests (id, name, last_seen) VALUES (?, ?, ?)'
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${GUEST_PREFIX}${random()}`;
    if (insert.run(id, name, now()).changes === 1) return { id, name };
  }
  return null;
}

export function touchGuest(db, guestId) {
  db.prepare('UPDATE chat_guests SET last_seen = ? WHERE id = ?').run(now(), guestId);
}

// --- reports -------------------------------------------------------------------------
// One report per reporter and message; reporting again changes nothing.
export function reportMessage(db, messageId, reporter) {
  db.prepare(
    'INSERT OR IGNORE INTO chat_reports (message_id, reporter, created_at) VALUES (?, ?, ?)'
  ).run(messageId, reporter, now());
}

// --- sanctions -----------------------------------------------------------------------
// The sanction (mute or ban) that currently stops this viewer from writing, if any.
export function activeSanction(db, { user, guest }) {
  if (!user && !guest) return null;
  return db
    .prepare(
      `SELECT kind, until FROM chat_sanctions
       WHERE lifted_at IS NULL AND (until IS NULL OR until > ?)
         AND ${user ? 'user_id = ?' : 'guest_id = ?'}
       ORDER BY until IS NULL DESC, until DESC LIMIT 1`
    )
    .get(now(), user ? user.id : guest.id);
}

// target: the message author, as stored on the message.
export function addSanction(db, { kind, message, minutes, moderator }) {
  const until = kind === 'mute' ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO chat_sanctions (kind, user_id, guest_id, target, until, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(kind, message.authorUserId, message.authorGuest, message.author, until, moderator, now());
  return Number(lastInsertRowid);
}

// A moderator looked at the reports and kept the message: they stop counting.
export function markReportsReviewed(db, messageId) {
  return db
    .prepare('UPDATE chat_reports SET reviewed_at = ? WHERE message_id = ? AND reviewed_at IS NULL')
    .run(now(), messageId).changes;
}

export function listActiveSanctions(db) {
  return db
    .prepare(
      `SELECT id, kind, target, until, created_by AS createdBy, created_at AS createdAt
       FROM chat_sanctions WHERE lifted_at IS NULL AND (until IS NULL OR until > ?)
       ORDER BY id DESC`
    )
    .all(now());
}

export function liftSanction(db, id) {
  return (
    db
      .prepare('UPDATE chat_sanctions SET lifted_at = ? WHERE id = ? AND lifted_at IS NULL')
      .run(now(), id).changes === 1
  );
}
