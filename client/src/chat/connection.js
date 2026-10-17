// ============================================================
// File:        connection.js
// Path:        client/src/chat/connection.js
// Project:     Seasonal Entertainment
// Description: The chat module's one live connection per page: however many chat panels a
//              page shows, they share one WebSocket to /ws/chat. Each room is subscribed once;
//              pushed events (which name their room) go to that room's panels only. Reconnects
//              after a drop and subscribes again; closes once the last panel has left.
// ============================================================

const RECONNECT_MS = 3000;
// An unused socket is closed after the current render, not during it: a panel that leaves and
// comes straight back (React's StrictMode remounts every effect in development) reuses it.
const listeners = new Map(); // room slug -> Set of event handlers
let socket = null;
let retry = null;
let idle = null;

const socketUrl = () =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/chat`;

const OPEN = 1; // WebSocket.OPEN
const subscribeOn = (target, room) => target.send(JSON.stringify({ type: 'subscribe', room }));

function open() {
  retry = null;
  const current = new WebSocket(socketUrl());
  socket = current;
  current.onopen = () => listeners.forEach((_handlers, room) => subscribeOn(current, room));
  current.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const room = data.room ?? data.message?.room;
    listeners.get(room)?.forEach((handler) => handler(data));
  };
  current.onclose = () => {
    // A socket replaced meanwhile (closed on purpose, then reopened) must not interfere.
    if (socket !== current) return;
    socket = null;
    if (listeners.size > 0) retry = setTimeout(open, RECONNECT_MS);
  };
}

function closeWhenUnused() {
  idle = null;
  if (listeners.size > 0) return;
  clearTimeout(retry);
  retry = null;
  const closing = socket;
  socket = null;
  closing?.close();
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
    if (listeners.size === 0) idle = setTimeout(closeWhenUnused, 0);
  };
}
