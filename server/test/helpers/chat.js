// ============================================================
// File:        chat.js
// Path:        server/test/helpers/chat.js
// Project:     Seasonal Entertainment
// Description: Chat test helpers: an app with the seeded rooms, posting, reading a room's
//              message texts, and the audit actions written so far.
// ============================================================

import { seedChatRooms } from '../../src/chat/seed.js';
import { makeTestApp } from './testApp.js';

export function chatApp(overrides) {
  const t = makeTestApp(overrides);
  seedChatRooms(t.db);
  return t;
}

export const post = (agent, room, body) =>
  agent.post(`/api/chat/rooms/${room}/messages`).send({ body });

export const bodies = async (agent, room) =>
  (await agent.get(`/api/chat/rooms/${room}/messages`)).body.messages.map((m) => m.body);

export const auditActions = (t) =>
  t.db
    .prepare('SELECT action FROM audit_log ORDER BY id')
    .all()
    .map((r) => r.action);
