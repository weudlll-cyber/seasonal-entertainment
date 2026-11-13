// ============================================================
// File:        profilePath.js
// Path:        client/src/profiles/profilePath.js
// Project:     Seasonal Entertainment
// Description: Where a member's profile is (/members/<name>; MemberProfilePage.jsx), and opening
//              it from a name in the chat module: the page itself goes there (a plain page load:
//              the chat module does not depend on the site's router), but from inside a frame
//              (the embedded chat in a game or on another site) a new tab, so the frame keeps
//              its chat.
// ============================================================

export const profilePath = (username) => `/members/${encodeURIComponent(username)}`;

export function openProfile(username) {
  if (window.parent !== window) window.open(profilePath(username), '_blank', 'noopener');
  else window.location.assign(profilePath(username));
}
