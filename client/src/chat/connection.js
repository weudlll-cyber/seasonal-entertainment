// ============================================================
// File:        connection.js
// Path:        client/src/chat/connection.js
// Project:     Seasonal Entertainment
// Description: The chat module's one live connection per page: however many chat panels a
//              page shows, they share one WebSocket to /ws/chat. Each room is subscribed once;
//              pushed events (which name their room) go to that room's panels only. Reconnects
//              after a drop and subscribes again; closes once the last panel has left. The
//              server knows the reader from the session cookie at connect time only, so a new
//              account (login, logout, switch) opens a fresh connection (connectAs). Events
//              for the account itself need no subscription — new direct messages, activity in a
//              readable room, the member's own reads and mutes (the unread counters), someone's
//              changed online visibility ("presence"), a call reminder of the site's
//              ("callReminder", calls/CallNotices.jsx) — and
//              joinPersonal() hands them on. The chat embedded on an approved foreign site has
//              no cookie there: it offers its embed token as a subprotocol (api/http.js), and when
//              that socket closes, asks whether the token still works (if not, it is dropped).
// ============================================================

import { api, socketProtocols } from '../api/http.js';

const RECONNECT_MS = 3000;
// An unused socket is closed after the current render, not during it: a panel that leaves and
// comes straight back (React's StrictMode remounts every effect in development) reuses it.
const listeners = new Map(); // room slug -> Set of event handlers
// Events for the account itself.
const PERSONAL = new Set(['direct', 'activity', 'read', 'muted', 'presence', 'callReminder']);
const personal = new Set(); // their handlers
let socket = null;
let retry = null;
let idle = null;
// The account the open socket belongs to (a user id, or null for a guest); undefined until a
// panel has told it. The first value needs no new socket: the cookie was there at connect.
let account;

const socketUrl = () =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/chat`;

const OPEN = 1; // WebSocket.OPEN
const inUse = () => listeners.size > 0 || personal.size > 0;
const subscribeOn = (target, room) => target.send(JSON.stringify({ type: 'subscribe', room }));

function open() {
  retry = null;
  const protocols = socketProtocols();
  const current = new WebSocket(socketUrl(), protocols);
  socket = current;
  current.onopen = () => listeners.forEach((_handlers, room) => subscribeOn(current, room));
  current.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (PERSONAL.has(data.type)) return personal.forEach((handler) => handler(data));
    const room = data.room ?? data.message?.room;
    listeners.get(room)?.forEach((handler) => handler(data));
  };
  current.onclose = () => {
    // A socket replaced meanwhile (closed on purpose, then reopened) must not interfere.
    if (socket !== current) return;
    socket = null;
    // Closed for a token that ended? The answer drops it (api/http.js), and the page then
    // reconnects as a guest.
    if (protocols.length > 0) api('/embed/me').catch(() => {});
    if (inUse()) retry = setTimeout(open, RECONNECT_MS);
  };
}

function closeWhenUnused() {
  idle = null;
  if (inUse()) return;
  clearTimeout(retry);
  retry = null;
  const closing = socket;
  socket = null;
  closing?.close();
}

// Tells the connection whose page this is. Another account than before: the old socket is
// dropped and a new one opened (its onopen subscribes every room again).
export function connectAs(next) {
  const changed = account !== undefined && next !== account;
  account = next;
  if (!changed || !socket) return;
  const stale = socket;
  socket = null; // onclose of the stale socket then does nothing
  stale.close();
  if (inUse()) open();
}

// Starts receiving `room`'s events; returns the function that stops it.
export function joinRoom(room, handler) {
  clearTimeout(idle);
  idle = null;
  if (!listeners.has(room)) {
    listeners.set(room, new Set());
    // Not yet open: onopen subscribes every room then.
    if (socket?.readyState === OPEN) subscribeOn(socket, room);
  }
  listeners.get(room).add(handler);
  if (!socket && !retry) open();
  return () => {
    const handlers = listeners.get(room);
    handlers?.delete(handler);
    if (handlers?.size === 0) listeners.delete(room);
    if (!inUse()) idle = setTimeout(closeWhenUnused, 0);
  };
}

// Starts receiving the account's own events (handler gets each { type, ... }); returns the
// function that stops.
export function joinPersonal(handler) {
  clearTimeout(idle);
  idle = null;
  personal.add(handler);
  if (!socket && !retry) open();
  return () => {
    personal.delete(handler);
    if (!inUse()) idle = setTimeout(closeWhenUnused, 0);
  };
}
