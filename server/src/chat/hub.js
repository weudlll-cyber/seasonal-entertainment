// ============================================================
// File:        hub.js
// Path:        server/src/chat/hub.js
// Project:     Seasonal Entertainment
// Description: The live chat hub: the open sockets (socket.js), the session each belongs to,
//              which rooms they are subscribed to, and pushing new and hidden messages. Rights
//              are never cached: every subscribe and every push checks the account as it is
//              now. Account changes (logout, lock, role, password, 2FA) also close the sockets.
// ============================================================

import { WebSocket } from 'ws';
import { findRoom } from './store.js';
import { canRead, sessionViewer } from './viewer.js';

// Close code from the private range: the client reconnects and is judged afresh.
const SESSION_CHANGED = 4001;

export class ChatHub {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.sessions = new Map(); // socket -> { id, data } of its session at connect time
    this.rooms = new Map(); // room id -> Set of sockets
  }

  add(socket, sessionId, sessionData) {
    this.sessions.set(socket, { id: sessionId, data: sessionData });
  }

  remove(socket) {
    this.sessions.delete(socket);
    for (const sockets of this.rooms.values()) sockets.delete(socket);
  }

  // The socket's viewer as of now; a socket whose account no longer qualifies is closed.
  viewerOf(socket) {
    const session = this.sessions.get(socket);
    const viewer = session && sessionViewer(this.db, this.config, session.data);
    if (!viewer) this.close(socket);
    return viewer;
  }

  // true when subscribed; false when this viewer may not read the room.
  subscribe(socket, room) {
    const viewer = this.viewerOf(socket);
    if (!viewer || !canRead(room, viewer)) return false;
    if (!this.rooms.has(room.id)) this.rooms.set(room.id, new Set());
    this.rooms.get(room.id).add(socket);
    return true;
  }

  // Sends only to sockets that may read the room right now; the others are unsubscribed.
  broadcast(roomId, event) {
    const room = findRoom(this.db, roomId);
    const sockets = this.rooms.get(roomId) ?? new Set();
    // The room's slug on every event: a page's one connection serves panels of many rooms.
    const text = JSON.stringify({ ...event, room: room?.slug });
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const viewer = this.viewerOf(socket);
      if (viewer && room && canRead(room, viewer)) socket.send(text);
      else sockets.delete(socket);
    }
  }

  // All sockets of an account, except those of the session `keepSessionId` (the session
  // making its own change stays connected; its rights are re-checked on every push anyway).
  disconnectUser(userId, keepSessionId) {
    for (const [socket, session] of this.sessions) {
      if (session.data.userId === userId && session.id !== keepSessionId) this.close(socket);
    }
  }

  // To every open socket of one account (direct messages need no subscription). Rights are
  // checked as for room pushes: a socket whose account no longer qualifies is closed.
  sendToUser(userId, event) {
    const text = JSON.stringify(event);
    for (const [socket, session] of this.sessions) {
      if (session.data.userId !== userId || socket.readyState !== WebSocket.OPEN) continue;
      if (this.viewerOf(socket)?.user?.id === userId) socket.send(text);
    }
  }

  // To every account socket whose member may read `room` right now, subscribed or not (the
  // unread counters). Guests have no counters and get nothing.
  notifyReaders(room, event) {
    if (!room) return;
    const text = JSON.stringify(event);
    for (const [socket, session] of this.sessions) {
      if (session.data.userId === undefined || socket.readyState !== WebSocket.OPEN) continue;
      const viewer = this.viewerOf(socket);
      if (viewer?.user && canRead(room, viewer)) socket.send(text);
    }
  }

  // Accounts with an open chat socket right now: the "online" mark beside favourite members.
  onlineUserIds() {
    const ids = new Set();
    for (const session of this.sessions.values()) {
      if (session.data.userId !== undefined) ids.add(session.data.userId);
    }
    return ids;
  }

  disconnectSession(sessionId) {
    for (const [socket, session] of this.sessions) {
      if (session.id === sessionId) this.close(socket);
    }
  }

  close(socket) {
    this.remove(socket);
    socket.close(SESSION_CHANGED, 'session changed');
  }
}
