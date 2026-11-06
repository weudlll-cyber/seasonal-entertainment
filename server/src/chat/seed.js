// ============================================================
// File:        seed.js
// Path:        server/src/chat/seed.js
// Project:     Seasonal Entertainment
// Description: First-start chat rooms. General: guests read and write (the only room marked
//              guest-writable). Seasonal Race: members. Organisers: organisers and admins.
//              Announcements: everyone reads, organisers and admins write. And the room of each
//              switched-on embedded game (games/embedded.js; decided 2026-11-04), created on any
//              start where its slug is missing: guests read, members write (docs/CHAT.md).
// ============================================================

import { EMBEDDED_GAMES } from '../games/embedded.js';

const SEED_ROOMS = [
  {
    slug: 'general',
    name: 'General',
    readAccess: 'everyone',
    writeAccess: 'everyone',
    guestWritable: 1,
  },
  {
    slug: 'seasonal-race',
    name: 'Seasonal Race',
    readAccess: 'members',
    writeAccess: 'members',
    guestWritable: 0,
  },
  {
    slug: 'organisers',
    name: 'Organisers',
    readAccess: 'organisers',
    writeAccess: 'organisers',
    guestWritable: 0,
  },
  {
    slug: 'announcements',
    name: 'Announcements',
    readAccess: 'everyone',
    writeAccess: 'organisers',
    guestWritable: 0,
  },
];

export function seedChatRooms(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM chat_rooms').get().n > 0) return 0;
  const insert = db.prepare(
    `INSERT INTO chat_rooms (slug, name, read_access, write_access, guest_writable, position)
     VALUES (@slug, @name, @readAccess, @writeAccess, @guestWritable, @position)`
  );
  db.transaction(() => SEED_ROOMS.forEach((room, i) => insert.run({ ...room, position: i + 1 })))();
  return SEED_ROOMS.length;
}

// The rooms of the switched-on games (config.games.embedded), each only if no room has its slug:
// an admin's later changes to it are never overwritten, and switching the game off leaves room
// and messages alone. A room an admin deleted (or gave another slug) comes back on the next
// start while its game is on: its game shows it. After seedChatRooms, which fills only an empty
// table. Returns the slugs created.
export function ensureGameRooms(db, games) {
  const insert = db.prepare(
    `INSERT INTO chat_rooms (slug, name, read_access, write_access, guest_writable, position)
     VALUES (?, ?, 'everyone', 'members', 0,
             (SELECT COALESCE(MAX(position), 0) + 1 FROM chat_rooms))
     ON CONFLICT (slug) DO NOTHING`
  );
  return db.transaction(() =>
    games.filter((slug) => insert.run(slug, EMBEDDED_GAMES[slug].roomName).changes > 0)
  )();
}
