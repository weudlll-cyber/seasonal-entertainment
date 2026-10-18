// ============================================================
// File:        mentions.js
// Path:        server/src/chat/mentions.js
// Project:     Seasonal Entertainment
// Description: @mentions in room messages (docs/CHAT.md, "@mentions"). Rooms are not end-to-end
//              encrypted, so the server reads the names (shared/chatRules.js, the rule the
//              client draws chips with); direct messages are left out. A mention counts only
//              for an existing member who may read the room and is not the sender; it is stored
//              per message and member. Messages carry their mentions ({ id, username }) so every
//              reader sees the chips and the mentioned member sees the highlight.
// ============================================================

import { mentionedNames } from '@seasonal-entertainment/shared/chatRules.js';
import { findLoginByUsername } from '../accounts/userStore.js';
import { accountViewer, canRead } from './viewer.js';

// Resolves and stores the mentions of a new message; returns the mentioned members' ids.
export function storeMentions(db, config, room, message, body) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO chat_mentions (message_id, user_id) VALUES (?, ?)'
  );
  const ids = [];
  for (const name of mentionedNames(body)) {
    const user = findLoginByUsername(db, name)?.user;
    if (!user || user.locked || user.id === message.authorUserId) continue;
    if (!canRead(room, accountViewer(db, config, user))) continue;
    insert.run(message.id, user.id);
    ids.push(user.id);
  }
  return ids;
}

// The messages with their mentions attached: mentions: [{ id, username }].
export function withMentions(db, messages) {
  if (messages.length === 0) return messages;
  const rows = db
    .prepare(
      `SELECT c.message_id AS messageId, u.id, u.username
       FROM chat_mentions c JOIN users u ON u.id = c.user_id
       WHERE c.message_id IN (${messages.map(() => '?').join(',')})`
    )
    .all(...messages.map((m) => m.id));
  return messages.map((m) => ({
    ...m,
    mentions: rows
      .filter((r) => r.messageId === m.id)
      .map(({ id, username }) => ({ id, username })),
  }));
}
