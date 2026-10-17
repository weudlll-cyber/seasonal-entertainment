// ============================================================
// File:        chatRules.js
// Path:        shared/chatRules.js
// Project:     Seasonal Entertainment
// Description: Chat rules shared by server and client: message length, room access levels,
//              guest names, and link detection. The server refuses links from guests with the
//              same detector the client uses to auto-link members' links, so the two can never
//              disagree about what counts as a link.
// ============================================================

export const MESSAGE_MAX = 500;

// Who may read / write a room. "everyone" includes guests (not signed in).
export const ROOM_ACCESS = ['everyone', 'members', 'organisers'];

// Guest names look like "Guest-7k2f". Registered usernames may not start with "guest-".
export const GUEST_PREFIX = 'Guest-';

// http(s):// and www. links, and bare domains such as "example.com/x".
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/i;

export function containsLink(text) {
  return LINK.test(text);
}

// Splits text into plain parts and http(s) links, for auto-linking members' messages.
// Only explicit http(s):// URLs become links; nothing is ever treated as HTML.
export function splitLinks(text) {
  const parts = [];
  const pattern = /https?:\/\/[^\s<>"]+/gi;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ link: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function validateMessage(body) {
  if (typeof body !== 'string' || !body.trim()) return 'Message is empty.';
  if (body.length > MESSAGE_MAX) return `Message is longer than ${MESSAGE_MAX} characters.`;
  return null;
}
