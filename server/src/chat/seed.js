// ============================================================
// File:        seed.js
// Path:        server/src/chat/seed.js
// Project:     Seasonal Entertainment
// Description: First-start chat rooms. General: guests read and write. Seasonal Race:
//              members. Organisers: organisers and admins. Announcements: everyone reads,
//              organisers and admins write.
// ============================================================

export const SEED_ROOMS = [
  { slug: 'general', name: 'General', readAccess: 'everyone', writeAccess: 'everyone' },
  { slug: 'seasonal-race', name: 'Seasonal Race', readAccess: 'members', writeAccess: 'members' },
  { slug: 'organisers', name: 'Organisers', readAccess: 'organisers', writeAccess: 'organisers' },
  {
    slug: 'announcements',
    name: 'Announcements',
    readAccess: 'everyone',
    writeAccess: 'organisers',
  },
];

export function seedChatRooms(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM chat_rooms').get().n > 0) return 0;
  const insert = db.prepare(
    `INSERT INTO chat_rooms (slug, name, read_access, write_access, position)
     VALUES (@slug, @name, @readAccess, @writeAccess, @position)`
  );
  db.transaction(() => SEED_ROOMS.forEach((room, i) => insert.run({ ...room, position: i + 1 })))();
  return SEED_ROOMS.length;
}
