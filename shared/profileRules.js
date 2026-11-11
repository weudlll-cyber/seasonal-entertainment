// ============================================================
// File:        profileRules.js
// Path:        shared/profileRules.js
// Project:     Seasonal Entertainment
// Description: The rule of a member's "About me" (docs/AUTH.md, "Member profiles"; decided
//              2026-11-11), checked the same way in the account page's form and on the server:
//              at most 300 characters (counted as the reader sees them: an emoji is one), plain
//              text, line breaks allowed, nothing else. Empty means none. validateAbout answers
//              the problem as a sentence, or null; cleanAbout gives the text as it is stored.
// ============================================================

export const ABOUT_MAX = 300;

// Line ends as \n, the ends trimmed: what is stored and counted.
export const cleanAbout = (text) =>
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();

export const aboutLength = (text) => [...cleanAbout(text)].length;

export function validateAbout(text) {
  if (typeof text !== 'string') return 'About me must be text.';
  // Control characters other than the line break would show as nothing or as boxes.
  const control = (char) => char !== '\n' && (char < ' ' || char === '\u007f');
  if ([...cleanAbout(text)].some(control)) {
    return 'About me cannot contain control characters.';
  }
  if (aboutLength(text) > ABOUT_MAX) return `About me can be at most ${ABOUT_MAX} characters.`;
  return null;
}
