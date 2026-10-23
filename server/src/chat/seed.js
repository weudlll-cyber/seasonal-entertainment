// ============================================================
// File:        seed.js
// Path:        server/src/chat/seed.js
// Project:     Seasonal Entertainment
// Description: First-start chat rooms. General: guests read and write (the only room marked
//              guest-writable). Seasonal Race:
//              members. Organisers: organisers and admins. Announcements: everyone reads,
//              organisers and admins write.
// ============================================================

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
