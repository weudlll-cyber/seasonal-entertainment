// ============================================================
// File:        memberSearch.js
// Path:        server/src/chat/memberSearch.js
// Project:     Seasonal Entertainment
// Description: Finding members by name (docs/CHAT.md, "Finding a member"): usernames containing
//              the text, case-insensitively, names starting with it first, then by name.
//              Never the searcher, a locked account, or one banned from the chat. Returns only
//              ids and usernames (the full account rows stay here for the room check).
// ============================================================

import { findUserById } from '../accounts/userStore.js';
import { escapeLike } from '../db/like.js';

// Up to `limit` accounts (full user objects, toUser shape) for `query`.
export function findMembers(db, me, query, limit) {
  const text = escapeLike(query);
  return db
    .prepare(
      `SELECT u.id FROM users u
       WHERE u.username LIKE @contains ESCAPE '\\' AND u.id <> @me AND u.locked = 0
         AND NOT EXISTS (SELECT 1 FROM chat_sanctions s
                         WHERE s.user_id = u.id AND s.kind = 'ban' AND s.lifted_at IS NULL)
       ORDER BY (u.username LIKE @prefix ESCAPE '\\') DESC, u.username COLLATE NOCASE
       LIMIT @limit`
    )
    .all({ contains: `%${text}%`, prefix: `${text}%`, me, limit })
    .map((row) => findUserById(db, row.id));
}
