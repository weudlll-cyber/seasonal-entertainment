// ============================================================
// File:        favouriteStore.js
// Path:        server/src/chat/favouriteStore.js
// Project:     Seasonal Entertainment
// Description: Data access for members' favourites: rooms and other members. Always keyed on
//              the member's own id, which the routes take from the session only. Adding twice
//              or removing what is not there changes nothing.
// ============================================================

const now = () => new Date().toISOString();

// Slugs of the member's favourite rooms, in the rooms' own order.
export function favouriteRoomSlugs(db, userId) {
  return db
    .prepare(
      `SELECT r.slug FROM chat_favourite_rooms f JOIN chat_rooms r ON r.id = f.room_id
       WHERE f.user_id = ? ORDER BY r.position, r.id`
    )
    .all(userId)
    .map((row) => row.slug);
}

// The member's favourite members, by name.
export function favouriteUsers(db, userId) {
  return db
    .prepare(
      `SELECT u.id, u.username FROM chat_favourite_users f JOIN users u ON u.id = f.favourite_id
       WHERE f.user_id = ? ORDER BY u.username COLLATE NOCASE`
    )
    .all(userId);
}

export function addFavouriteRoom(db, userId, roomId) {
  db.prepare(
    'INSERT OR IGNORE INTO chat_favourite_rooms (user_id, room_id, created_at) VALUES (?, ?, ?)'
  ).run(userId, roomId, now());
}

export function removeFavouriteRoom(db, userId, roomId) {
  db.prepare('DELETE FROM chat_favourite_rooms WHERE user_id = ? AND room_id = ?').run(
    userId,
    roomId
  );
}

export function addFavouriteUser(db, userId, favouriteId) {
  db.prepare(
    'INSERT OR IGNORE INTO chat_favourite_users (user_id, favourite_id, created_at) VALUES (?, ?, ?)'
  ).run(userId, favouriteId, now());
}

export function removeFavouriteUser(db, userId, favouriteId) {
  db.prepare('DELETE FROM chat_favourite_users WHERE user_id = ? AND favourite_id = ?').run(
    userId,
    favouriteId
  );
}
