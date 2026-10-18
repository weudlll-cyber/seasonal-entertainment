// ============================================================
// File:        spotlight.js
// Path:        server/src/calls/spotlight.js
// Project:     Seasonal Entertainment
// Description: Who is highlighted on the stage (docs/CALLS.md, "Spotlight"), as one pure rule
//              the routes apply. State: null (nobody chose: all speakers) or { identity, by }
//              with identity null for an organiser's explicit "all speakers" and by one of
//              'organiser', 'self', 'share'.
//              - A screen share always takes the spotlight: the newest share wins.
//              - A speaker may highlight themselves, unless an organiser's choice stands.
//              - An organiser may highlight any speaker or return to all speakers; that choice
//                stands until an organiser or a new screen share changes it.
//              - Stopping one's share, or leaving the stage, releases one's own spotlight.
// ============================================================

// action: { type: 'organiser', identity } | { type: 'self', identity, on } |
//         { type: 'share', identity, sharing } | { type: 'left', identity }.
// Returns { state } or { refused: 'organiser_choice' }.
export function nextSpotlight(current, action) {
  const holds = (by) => current?.by === by && current.identity === action.identity;
  switch (action.type) {
    case 'organiser':
      return { state: { identity: action.identity, by: 'organiser' } };
    case 'share':
      if (action.sharing) return { state: { identity: action.identity, by: 'share' } };
      return { state: holds('share') ? null : current };
    case 'self':
      if (!action.on) return { state: holds('self') ? null : current };
      if (current?.by === 'organiser') return { refused: 'organiser_choice' };
      return { state: { identity: action.identity, by: 'self' } };
    case 'left':
      return { state: current?.identity === action.identity ? null : current };
    default:
      throw new Error(`unknown spotlight action ${action.type}`);
  }
}
