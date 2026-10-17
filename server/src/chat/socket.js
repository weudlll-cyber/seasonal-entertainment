// ============================================================
// File:        socket.js
// Path:        server/src/chat/socket.js
// Project:     Seasonal Entertainment
// Description: The chat WebSocket endpoint (/ws/chat), push only: clients subscribe to rooms
//              they may read; the hub (hub.js) pushes new and hidden messages. Everything that
//              changes data goes through the HTTP API (CSRF, access, validation, audit apply
//              there). The upgrade is refused unless the Origin is this site (cross-site
//              WebSocket hijacking), and it reuses the session middleware to know who connects;
//              what that session may read, the hub decides on every subscribe and push.
// ============================================================

import { WebSocketServer } from 'ws';
import { selfOrigin } from '../http/csrf.js';
import { findRoomBySlug } from './store.js';

export const CHAT_SOCKET_PATH = '/ws/chat';

// The same rule as the CSRF guard: the full origin (scheme, host and port) must be this
// site's. Browsers always send Origin on a WebSocket upgrade, so a missing one is refused.
const originAllowed = (req, config) => req.headers.origin === selfOrigin(req, config);

// Called through the chat handle (mount.js): attach(server).
export function attachChatSocket(server, { hub, sessionParser, db, config }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== CHAT_SOCKET_PATH || !originAllowed(req, config)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    // The normal session middleware tells who is connecting; the hub judges their rights.
    sessionParser(req, {}, () => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        hub.add(ws, req.sessionID, req.session);
        ws.on('message', (data) => {
          let request;
          try {
            request = JSON.parse(String(data));
          } catch {
            return;
          }
          if (request?.type !== 'subscribe' || typeof request.room !== 'string') return;
          const room = findRoomBySlug(db, request.room);
          if (!room || !hub.subscribe(ws, room)) {
            return ws.send(JSON.stringify({ type: 'error', error: 'not_allowed' }));
          }
          ws.send(JSON.stringify({ type: 'subscribed', room: room.slug }));
        });
        ws.on('close', () => hub.remove(ws));
      });
    });
  });

  return wss;
}
