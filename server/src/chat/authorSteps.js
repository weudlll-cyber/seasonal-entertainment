// ============================================================
// File:        authorSteps.js
// Path:        server/src/chat/authorSteps.js
// Project:     Seasonal Entertainment
// Description: The Discord steps beside a name (docs/CHAT.md, "Discord steps"): each room
//              message gets its author's steps as they are now (authorSteps: [{ ladder, name,
//              icon }], the highest of each ladder; empty for guests, the site, and accounts
//              without steps), computed on the server from the author's account like the staff
//              badge's role, never taken from what a client sent. stepsOf: the same for a list
//              of accounts (the member search).
// ============================================================

import { shownSteps, stepsOfUsers } from '../discord/steps.js';
import { mediaUrl } from '../media/files.js';

// Map userId -> the steps as the browser shows them.
export function stepsOf(db, userIds) {
  const found = stepsOfUsers(db, userIds);
  return new Map([...found].map(([id, steps]) => [id, shownSteps(steps, mediaUrl)]));
}

export function withAuthorSteps(db, messages) {
  if (messages.length === 0) return messages;
  const steps = stepsOf(
    db,
    messages.map((m) => m.authorId)
  );
  return messages.map((m) => ({ ...m, authorSteps: steps.get(m.authorId) ?? [] }));
}
