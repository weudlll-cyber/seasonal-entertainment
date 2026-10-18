// ============================================================
// File:        stageModel.js
// Path:        client/src/calls/stageModel.js
// Project:     Seasonal Entertainment
// Description: The call page's rules as plain functions (no LiveKit, no React): who is a
//              speaker and who listens, the audience order (raised hands first, then names,
//              hidden listeners last), finding a listener, which speaker the spotlight shows
//              (the server's room metadata, docs/CALLS.md "Spotlight"), and the notices around
//              screen sharing with sound.
// ============================================================

// The name the server gives a member who hides their online status (calls/people.js).
export const HIDDEN_LISTENER = 'A listener';

export const NO_SHARE_AUDIO =
  "Your browser can't send sound with screen sharing — for presentations with sound use Chrome or Edge.";
export const HEADPHONES_HINT =
  'Sharing with sound: use headphones, so the call does not hear itself (echo).';

// A LiveKit participant as the page needs it. kind and hand come from the attributes the
// server set; canPublish from the permission the server gave.
export function personOf(participant, isLocal = false) {
  const attributes = participant.attributes ?? {};
  return {
    identity: participant.identity,
    name: participant.name || HIDDEN_LISTENER,
    kind: attributes.kind ?? 'member',
    hand: attributes.hand === '1',
    handAt: attributes.handAt ?? '',
    speaker: Boolean(participant.permissions?.canPublish),
    isLocal,
  };
}

export const isHidden = (person) => person.name === HIDDEN_LISTENER;

// Raised hands first (who raised first, first), then by name; hidden listeners last.
export function audienceOrder(listeners) {
  const rank = (p) => (p.hand ? 0 : isHidden(p) ? 2 : 1);
  return [...listeners].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.hand && b.hand ? a.handAt.localeCompare(b.handAt) : 0) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

// "Find a listener": by name, case-insensitive. Hidden listeners have no name to find.
export function findListeners(listeners, query) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return listeners;
  return listeners.filter((p) => !isHidden(p) && p.name.toLowerCase().includes(wanted));
}

// The room metadata the server sets: { spotlight: { identity, by } | null }. Anything else
// (empty, broken) means nobody is highlighted.
export function spotlightOf(metadata) {
  try {
    const spotlight = JSON.parse(metadata || '{}').spotlight;
    return spotlight && typeof spotlight === 'object' ? spotlight : null;
  } catch {
    return null;
  }
}

// The speaker to show large, or null for the grid of all speakers. Only someone actually on
// the stage now: a stale choice (they left) falls back to the grid.
export function spotlightSpeaker(spotlight, speakers) {
  if (!spotlight?.identity) return null;
  return speakers.find((s) => s.identity === spotlight.identity) ?? null;
}

// After starting a screen share: the notice to show when it carries no sound, else null.
export const shareAudioNotice = (hasAudio) => (hasAudio ? null : NO_SHARE_AUDIO);
