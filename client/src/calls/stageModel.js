// ============================================================
// File:        stageModel.js
// Path:        client/src/calls/stageModel.js
// Project:     Seasonal Entertainment
// Description: The call page's rules as plain functions (no LiveKit, no React): who is a
//              speaker and who listens, the audience order (raised hands first, then names,
//              hidden listeners last), finding a listener, which speaker is shown large (the
//              server's spotlight, docs/CALLS.md "Spotlight"; without one, a screen share — so a
//              share shows even when the spotlight update failed, SE-CALLS-2), and the notices
//              around screen sharing with sound (Chromium browsers can send it, others cannot).
// ============================================================

// The name the server gives a member who hides their online status (calls/people.js).
export const HIDDEN_LISTENER = 'A listener';

// Browsers that cannot send sound with a screen share at all (Firefox, Safari).
export const NO_SHARE_AUDIO =
  "Your browser can't send sound with screen sharing — for presentations with sound use Chrome or Edge.";
// Chromium browsers (Chrome, Edge) can, but only for the whole screen with system audio ticked
// or for a tab with tab audio; a single window never carries sound on Windows.
export const NO_SOUND_SHARED =
  "No sound is being shared. For sound, choose 'Entire screen' and tick 'Share system audio', or a browser tab with 'Share tab audio'.";
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

// The name each listener's buttons speak: the member's name, or for hidden listeners
// "listener 1", "listener 2", ... in list order — every Invite button gets its own name.
export function listenerNames(listeners) {
  let hidden = 0;
  return new Map(
    listeners.map((p) => [p.identity, isHidden(p) ? `listener ${(hidden += 1)}` : p.name])
  );
}

// The collapsed listener panel's one row: every raised hand (organisers must not miss one),
// then others up to `size` chips; `more` counts the rest ("+N"). ordered: audienceOrder().
export const COLLAPSED_CHIPS = 4;
export function collapsedListeners(ordered, size = COLLAPSED_CHIPS) {
  const hands = ordered.filter((p) => p.hand).length;
  const shown = ordered.slice(0, Math.max(size, hands));
  return { shown, more: ordered.length - shown.length };
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

// Whether the server says a recording runs ({ recording: true } in the same metadata).
export function recordingOf(metadata) {
  try {
    return JSON.parse(metadata || '{}').recording === true;
  } catch {
    return false;
  }
}

// The speaker the server's spotlight names, if they are on the stage now (a stale choice —
// they left — counts as none).
export function spotlightSpeaker(spotlight, speakers) {
  if (!spotlight?.identity) return null;
  return speakers.find((s) => s.identity === spotlight.identity) ?? null;
}

// The speaker to show large, or null for the grid of all speakers. sharers: the identities
// with a screen share now, in stage order. The server's choice first; without one a share is
// shown large anyway (the last sharer), so a share never depends on the spotlight update. Only an organiser's explicit "all speakers" keeps the grid (shares show in tiles).
export function shownLarge(spotlight, speakers, sharers) {
  const chosen = spotlightSpeaker(spotlight, speakers);
  if (chosen || (spotlight?.by === 'organiser' && spotlight.identity === null)) return chosen;
  const latest = sharers.at(-1);
  return speakers.find((s) => s.identity === latest) ?? null;
}

// Chrome, Edge and other Chromium browsers: Client Hints where offered, else the user agent
// (Edge says "Edg/", Chrome "Chrome/"; Firefox and Safari say neither).
export function isChromium(nav) {
  if (nav.userAgentData?.brands?.some((b) => b.brand === 'Chromium')) return true;
  return /\b(Chrome|Chromium|Edg)\//.test(nav.userAgent ?? '');
}

// After starting a screen share: null when it carries sound, else { text, reshare } — reshare
// offers "Share again with sound" where the browser could send it.
export function shareAudioNotice(hasAudio, chromium) {
  if (hasAudio) return null;
  return chromium
    ? { text: NO_SOUND_SHARED, reshare: true }
    : { text: NO_SHARE_AUDIO, reshare: false };
}
