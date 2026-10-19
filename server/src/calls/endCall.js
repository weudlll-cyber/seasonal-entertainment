// ============================================================
// File:        endCall.js
// Path:        server/src/calls/endCall.js
// Project:     Seasonal Entertainment
// Description: The one way a call ends, for an organiser's "End call" (routes.js) and for the
//              stale-call job (staleCalls.js) alike: status ended, the call service's room
//              closed (which disconnects everyone), the call's chat room read-only, an audit
//              entry naming who ended it.
// ============================================================

import { recordAudit } from '../audit/auditLog.js';
import { markEnded } from './store.js';

// The audit actor of what the site does by itself (no account).
export const SYSTEM = { id: null, username: 'system' };

// call: findCall's row. actor: the signed-in user, or SYSTEM. Returns false when the call had
// ended already (two ends at once: only one succeeds).
export async function endCall(db, service, chat, call, actor) {
  if (!markEnded(db, call.id)) return false;
  // After the status change: nobody can join any more while the room closes.
  await service.closeRoom(call.roomName);
  if (call.chatRoomId) chat.rooms.close(call.chatRoomId);
  recordAudit(db, actor, {
    action: 'call.end',
    targetType: 'call',
    targetId: call.id,
    after: { title: call.title },
  });
  return true;
}
