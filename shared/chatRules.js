// ============================================================
// File:        chatRules.js
// Path:        shared/chatRules.js
// Project:     Seasonal Entertainment
// Description: Chat rules shared by server and client: message length, room access levels,
//              guest names, and link detection. The server refuses links from guests with the
//              same detector the client uses to auto-link members' links, so the two can never
//              disagree about what counts as a link. Links are https only (members' plain
//              http:// links are refused); the first https link gets a preview. @mentions:
//              "@" and a username-shaped name, not inside a word or an email address; the
//              server notifies with the same rule the client draws chips with.
// ============================================================

export const MESSAGE_MAX = 500;

// Who may read / write a room. "everyone" includes guests (not signed in) for reading; guests
// write only in rooms that are also marked guest-writable (server/src/chat/viewer.js).
export const ROOM_ACCESS = ['everyone', 'members', 'organisers'];

// Guest names look like "Guest-k7m2qa". Registered usernames may not start with "guest-".
export const GUEST_PREFIX = 'Guest-';

// http(s):// and www. links, and bare domains such as "example.com/x".
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/i;

export function containsLink(text) {
  return LINK.test(text);
}

// Links in the chat are https only: a plain http:// link is refused when sent.
const HTTPS_LINK = /https:\/\/[^\s<>"]+/gi;

export function containsPlainHttpLink(text) {
  return /\bhttp:\/\//i.test(text);
}

// The link a preview is made for: the first https link, if any.
export function firstHttpsLink(text) {
  return text.match(HTTPS_LINK)?.[0] ?? null;
}

// Splits text into plain parts and https links, for auto-linking members' messages.
// Only explicit https:// URLs become links; nothing is ever treated as HTML.
export function splitLinks(text) {
  const parts = [];
  const pattern = new RegExp(HTTPS_LINK);
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

// "@name" where name has the shape of a username (accountRules.js: 3-24 characters, letters,
// digits, "_", "-", "."), not preceded by a letter, digit or one of those (so not in emails),
// and not the start of a longer word. A dot right after the name ends the sentence instead.
const MENTION =
  /(?<![A-Za-z0-9_.@-])@([A-Za-z0-9][A-Za-z0-9_.-]{1,22}[A-Za-z0-9_-])(?![A-Za-z0-9_-])(?!\.[A-Za-z0-9])/g;

// Splits text into plain parts and mentions ({ mention: name }), in order.
export function splitMentions(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ mention: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// The names mentioned in a text, once each, lower-cased (usernames are case-insensitive).
export const mentionedNames = (text) => [
  ...new Set([...text.matchAll(MENTION)].map((m) => m[1].toLowerCase())),
];
