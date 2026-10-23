// ============================================================
// File:        people.js
// Path:        server/src/calls/people.js
// Project:     Seasonal Entertainment
// Description: How a participant appears to the others: the name (a member's username, a
//              guest's guest name; a member who hides their online status is "A listener" while
//              listening (shared/callPeople.js) — counted, not named, decided 2026-10-18) and the attributes every
//              client reads: kind (host, member, guest) and the raised hand with its time;
//              and how many are on the stage.
// ============================================================

import { HIDDEN_LISTENER } from '@seasonal-entertainment/shared/callPeople.js';

// who: { user, guest } (chat viewer); on the stage everyone is named.
export function shownName(who, onStage) {
  if (!who.user) return who.guest.name;
  return onStage || who.user.showOnline ? who.user.username : HIDDEN_LISTENER;
}

// kind: 'host' for organisers and admins (with 2FA in order), 'member', 'guest'.
export const kindOf = (who) => (who.staff ? 'host' : who.user ? 'member' : 'guest');

// How many are on the stage right now: those the call service lets publish.
export const countSpeakers = (inRoom) => inRoom.filter((p) => p.permission?.canPublish).length;

export const handAttributes = (handRaisedAt) => ({
  hand: handRaisedAt ? '1' : '0',
  handAt: handRaisedAt ?? '',
});
