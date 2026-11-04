// ============================================================
// File:        callRoom.js
// Path:        shared/callRoom.js
// Project:     Seasonal Entertainment
// Description: A call's chat room (docs/CALLS.md, "The call's chat"): the unlisted room the server
//              creates with each call is named call-<call id> (server/src/calls/routes.js), and
//              is shown on that call's page, /calls/<call id>. Links into such a room (a mention's
//              notification, client/src/notify/useSystemNotifications.js) lead to that page.
// ============================================================

const CALL_ROOM = /^call-(\d+)$/;

export const callRoomSlug = (callId) => `call-${callId}`;

// The page a room is shown on: its call's page for a call's room, else the chat page.
export function roomPagePath(slug) {
  const call = CALL_ROOM.exec(slug);
  return call ? `/calls/${call[1]}` : `/chat?room=${encodeURIComponent(slug)}`;
}
