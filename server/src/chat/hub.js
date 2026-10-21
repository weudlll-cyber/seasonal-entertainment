// ============================================================
// File:        hub.js
// Path:        server/src/chat/hub.js
// Project:     Seasonal Entertainment
// Description: The live chat hub: the open sockets (socket.js), the session each belongs to,
//              which rooms they are subscribed to, and pushing new and hidden messages. Rights
//              are never cached: every subscribe and every push checks the account as it is
//              now. Account changes (logout, lock, role, password, 2FA) also close the sockets.
//              A socket of the embedded chat on a foreign site (embed/) holds an embed token
//              instead of a session: it is closed as soon as that token no longer works. The
//              number of members shown online goes to the readers of "general" whenever it
//              changes (the home page's Community box). It also counts the open sockets per
//              account and per guest address, for the connection limits (socket.js).
// ============================================================

import { WebSocket } from 'ws';
import { idsShowingOnline } from '../accounts/userStore.js';
import { tokenStillActive } from '../embed/tokens.js';
import { findRoom, findRoomBySlug } from './store.js';
import { canRead, sessionViewer } from './viewer.js';

// Close code from the private range: the client reconnects and is judged afresh.
const SESSION_CHANGED = 4001;

export class ChatHub {
  // embedOrigins: the approved sites (embed/origins.js), to judge embed-token sockets.
  constructor(db, config, embedOrigins) {
    this.db = db;
    this.config = config;
    this.embedOrigins = embedOrigins;
    this.sessions = new Map(); // socket -> { id, data } of its session at connect time
    this.rooms = new Map(); // room id -> Set of sockets
    this.onlineShown = null; // the online count last pushed
  }

  // ip: the client's address (counts guests' sockets for the connection limit).
  add(socket, sessionId, sessionData, ip) {
    this.sessions.set(socket, { id: sessionId, data: sessionData, ip });
    if (sessionData.userId !== undefined) this.announceOnline();
  }

  remove(socket) {
    const member = this.sessions.get(socket)?.data.userId !== undefined;
    this.sessions.delete(socket);
    for (const sockets of this.rooms.values()) sockets.delete(socket);
    if (member) this.announceOnline();
  }

  // The online count, to everyone reading "general", when it changed (a member came, left,
  // or showed or hid their status). Only the number: who is online stays as private as before.
  announceOnline() {
    if (!this.db.open) return; // sockets closing while the server shuts down
    const count = this.onlineUserIds().size;
    if (count === this.onlineShown) return;
    this.onlineShown = count;
    const general = findRoomBySlug(this.db, 'general');
    if (general) this.broadcast(general.id, { type: 'online', count });
  }

  // Open sockets of one account (userId), or of guests from one address (ip), whatever
  // the page: tabs, the chat drawer and embedded chats all count.
  countOpen({ userId, ip }) {
    let count = 0;
    for (const session of this.sessions.values()) {
      const own = session.data.userId;
      if (userId !== undefined ? own === userId : own === undefined && session.ip === ip)
        count += 1;
    }
    return count;
  }

  // The socket's viewer as of now; a socket whose account no longer qualifies is closed.
  viewerOf(socket) {
    const session = this.sessions.get(socket);
    const tokenId = session?.data.embedTokenId;
    const tokenOk = !tokenId || tokenStillActive(this.db, this.embedOrigins, tokenId);
    const viewer = session && tokenOk && sessionViewer(this.db, this.config, session.data);
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
  // checked as for room pushes: a socket whose account no longer qualifies is closed. Returns
  // how many sockets got it (call reminders count as delivered only then).
  sendToUser(userId, event) {
    const text = JSON.stringify(event);
    let sent = 0;
    for (const [socket, session] of this.sessions) {
      if (session.data.userId !== userId || socket.readyState !== WebSocket.OPEN) continue;
      if (this.viewerOf(socket)?.user?.id === userId) {
        socket.send(text);
        sent += 1;
      }
    }
    return sent;
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

  // Accounts others may see as online right now: an open chat socket, and "Show when I'm
  // online" on. Every presence the server hands out comes from here, so a member who hides it
  // never appears online anywhere.
  onlineUserIds() {
    const ids = new Set();
    for (const session of this.sessions.values()) {
      if (session.data.userId !== undefined) ids.add(session.data.userId);
    }
    return idsShowingOnline(this.db, ids);
  }

  // To every signed-in member's sockets (e.g. "presence": someone's visibility changed).
  sendToMembers(event) {
    const text = JSON.stringify(event);
    for (const [socket, session] of this.sessions) {
      if (session.data.userId !== undefined && socket.readyState === WebSocket.OPEN) {
        socket.send(text);
      }
    }
  }

  // Embed-token sockets matching { tokenId } or { origin } or { userId } (embed/ revoked them).
  disconnectEmbeds({ tokenId, origin, userId }) {
    for (const [socket, { data }] of this.sessions) {
      if (data.embedTokenId === undefined) continue;
      const hit =
        data.embedTokenId === tokenId || data.embedOrigin === origin || data.userId === userId;
      if (hit) this.close(socket);
    }
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
