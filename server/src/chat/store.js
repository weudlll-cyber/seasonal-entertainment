// ============================================================
// File:        store.js
// Path:        server/src/chat/store.js
// Project:     Seasonal Entertainment
// Description: Data access for the chat: rooms, messages (visible / hidden), guest names
//              (unique while held), reports and sanctions.
// ============================================================

import { randomBytes } from 'node:crypto';
import { GUEST_PREFIX } from '@seasonal-entertainment/shared/chatRules.js';

const now = () => new Date().toISOString();
const ROOM_COLUMNS = `id, slug, name, read_access AS readAccess, write_access AS writeAccess, position`;
const MESSAGE_COLUMNS = `m.id, r.slug AS room, m.author_name AS author,
  (m.author_guest IS NOT NULL) AS isGuest, m.body, m.created_at AS createdAt,
  m.hidden_at AS hiddenAt, m.hidden_by AS hiddenBy`;

const toMessage = (row) => row && { ...row, isGuest: row.isGuest === 1 };

// --- rooms ---------------------------------------------------------------------------
export function listRooms(db) {
  return db.prepare(`SELECT ${ROOM_COLUMNS} FROM chat_rooms ORDER BY position, id`).all();
}

export function findRoomBySlug(db, slug) {
  return db.prepare(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE slug = ?`).get(slug);
}

export function findRoom(db, id) {
  return db.prepare(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE id = ?`).get(id);
}

export function saveRoom(db, room, id) {
  const values = [room.slug, room.name, room.readAccess, room.writeAccess];
  if (id === undefined) {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO chat_rooms (slug, name, read_access, write_access, position)
         VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM chat_rooms))`
      )
      .run(...values);
    return findRoom(db, Number(lastInsertRowid));
  }
  db.prepare(
    'UPDATE chat_rooms SET slug = ?, name = ?, read_access = ?, write_access = ? WHERE id = ?'
  ).run(...values, id);
  return findRoom(db, id);
}

// --- messages ------------------------------------------------------------------------
export function addMessage(db, room, { user, guest }, body) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO chat_messages (room_id, author_user_id, author_guest, author_name, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(room.id, user?.id ?? null, guest?.id ?? null, user?.username ?? guest.name, body, now());
  return findMessage(db, Number(lastInsertRowid));
}

export function findMessage(db, id) {
  return toMessage(
    db
      .prepare(
        `SELECT ${MESSAGE_COLUMNS}, m.room_id AS roomId, m.author_user_id AS authorUserId,
                m.author_guest AS authorGuest
         FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id WHERE m.id = ?`
      )
      .get(id)
  );
}

// The newest `limit` messages, oldest first. Hidden ones only for moderators.
export function listMessages(db, room, { includeHidden = false, limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT ${MESSAGE_COLUMNS} FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id
         WHERE m.room_id = ? AND (? OR m.hidden_at IS NULL) ORDER BY m.id DESC LIMIT ?
       ) ORDER BY id`
    )
    .all(room.id, includeHidden ? 1 : 0, limit)
    .map(toMessage);
}

export function hideMessage(db, id, moderator) {
  db.prepare('UPDATE chat_messages SET hidden_at = ?, hidden_by = ? WHERE id = ?').run(
    now(),
    moderator,
    id
  );
}

// --- guests --------------------------------------------------------------------------
// A name nobody holds right now: retried until the UNIQUE constraint accepts it.
export function assignGuestName(db, random = () => randomBytes(3).toString('hex').slice(0, 4)) {
  const id = randomBytes(16).toString('hex');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO chat_guests (id, name, last_seen) VALUES (?, ?, ?)'
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${GUEST_PREFIX}${random()}`;
    if (insert.run(id, name, now()).changes === 1) return { id, name };
  }
  throw new Error('could not find a free guest name');
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

export function listReported(db) {
  return db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS}, COUNT(c.id) AS reports
       FROM chat_reports c JOIN chat_messages m ON m.id = c.message_id
       JOIN chat_rooms r ON r.id = m.room_id
       WHERE m.hidden_at IS NULL GROUP BY m.id ORDER BY MAX(c.id) DESC`
    )
    .all()
    .map(toMessage);
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
