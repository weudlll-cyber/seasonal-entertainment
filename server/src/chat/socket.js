// ============================================================
// File:        socket.js
// Path:        server/src/chat/socket.js
// Project:     Seasonal Entertainment
// Description: The chat WebSocket endpoint (/ws/chat), push only: clients subscribe to rooms
//              they may read; the hub (hub.js) pushes new and hidden messages. Everything that
//              changes data goes through the HTTP API (CSRF, access, validation, audit apply
//              there). The upgrade is refused unless the Origin is this site (cross-site
//              WebSocket hijacking), and it reuses the session middleware to know who connects.
// ============================================================

import { WebSocketServer } from 'ws';
import { selfOrigin } from '../http/csrf.js';
import { currentUser } from '../http/session.js';
import { findRoomBySlug } from './store.js';
import { canRead, chatViewer } from './viewer.js';

export const CHAT_SOCKET_PATH = '/ws/chat';

// The same rule as the CSRF guard: the full origin (scheme, host and port) must be this
// site's. Browsers always send Origin on a WebSocket upgrade, so a missing one is refused.
const originAllowed = (req, config) => req.headers.origin === selfOrigin(req, config);

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
