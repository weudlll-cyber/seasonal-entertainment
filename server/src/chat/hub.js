// ============================================================
// File:        hub.js
// Path:        server/src/chat/hub.js
// Project:     Seasonal Entertainment
// Description: Live chat over WebSocket (/ws/chat), push only: clients subscribe to rooms
//              they may read and receive new and hidden messages. Everything that changes
//              data goes through the HTTP API (CSRF, access, validation, audit apply there).
//              The upgrade is refused unless the Origin is this site (cross-site WebSocket
//              hijacking), and it reuses the session middleware to know who is connecting.
// ============================================================

import { WebSocket, WebSocketServer } from 'ws';
import { currentUser } from '../http/session.js';
import { findRoomBySlug } from './store.js';
import { canRead, chatViewer } from './viewer.js';

export const CHAT_SOCKET_PATH = '/ws/chat';

export class ChatHub {
  constructor() {
    this.rooms = new Map(); // room id -> Set of sockets
  }

  subscribe(socket, roomId) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId).add(socket);
  }

  remove(socket) {
    for (const sockets of this.rooms.values()) sockets.delete(socket);
  }

  broadcast(roomId, event) {
    const text = JSON.stringify(event);
    for (const socket of this.rooms.get(roomId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
    }
  }
}

// Same check as the CSRF guard: the configured origin, or this request's own host.
function originAllowed(req, config) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (config.publicOrigin) return origin === config.publicOrigin;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function attachChatSocket(server, { app, db, config }) {
  const { chatHub: hub, sessionParser } = app.locals;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== CHAT_SOCKET_PATH || !originAllowed(req, config)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    // Run the normal session + account lookup on the upgrade request.
    sessionParser(req, {}, () =>
      currentUser(db)(req, {}, () => {
        const viewer = chatViewer(req);
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.on('message', (data) => {
            let request;
            try {
              request = JSON.parse(String(data));
            } catch {
              return;
            }
            if (request?.type !== 'subscribe' || typeof request.room !== 'string') return;
            const room = findRoomBySlug(db, request.room);
            if (!room || !canRead(room, viewer)) {
              return ws.send(JSON.stringify({ type: 'error', error: 'not_allowed' }));
            }
            hub.subscribe(ws, room.id);
            ws.send(JSON.stringify({ type: 'subscribed', room: room.slug }));
          });
          ws.on('close', () => hub.remove(ws));
        });
      })
    );
  });

  return wss;
}
