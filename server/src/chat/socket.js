// ============================================================
// File:        socket.js
// Path:        server/src/chat/socket.js
// Project:     Seasonal Entertainment
// Description: The chat WebSocket endpoint (/ws/chat), push only: clients subscribe to rooms
//              they may read; the hub (hub.js) pushes new and hidden messages. Everything that
//              changes data goes through the HTTP API (CSRF, access, validation, audit apply
//              there). The upgrade is refused unless the Origin is this site (cross-site
//              WebSocket hijacking), and it reuses the session middleware to know who connects;
//              what that session may read, the hub decides on every subscribe and push. The
//              chat embedded on an approved foreign site has no cookie there: it offers the
//              subprotocols "se-chat" and "se-embed.<token>" (embed/tokens.js), and the socket
//              then acts for the token's member, closed as soon as the token stops working.
// ============================================================

import { WebSocketServer } from 'ws';
import { findActiveToken } from '../embed/tokens.js';
import { selfOrigin } from '../http/csrf.js';
import { findRoomBySlug } from './store.js';

export const CHAT_SOCKET_PATH = '/ws/chat';
export const CHAT_PROTOCOL = 'se-chat';
export const EMBED_PROTOCOL_PREFIX = 'se-embed.';

// The embed token offered as a subprotocol, or undefined when none is.
function embedTokenOf(req) {
  const offered = (req.headers['sec-websocket-protocol'] ?? '').split(',').map((p) => p.trim());
  return offered
    .find((p) => p.startsWith(EMBED_PROTOCOL_PREFIX))
    ?.slice(EMBED_PROTOCOL_PREFIX.length);
}

// The same rule as the CSRF guard: the full origin (scheme, host and port) must be this
// site's. Browsers always send Origin on a WebSocket upgrade, so a missing one is refused.
const originAllowed = (req, config) => req.headers.origin === selfOrigin(req, config);

// Subscribing to rooms: the only thing a client says on the socket.
function serve(ws, { hub, db }) {
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
}

// Called through the chat handle (mount.js): attach(server).
export function attachChatSocket(server, { hub, sessionParser, db, config, embedOrigins }) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    // A client that names protocols (the embed) gets "se-chat" back; others name none.
    handleProtocols: (protocols) => (protocols.has(CHAT_PROTOCOL) ? CHAT_PROTOCOL : false),
  });
  const refuse = (socket, status) => {
    socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
    socket.destroy();
  };

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== CHAT_SOCKET_PATH || !originAllowed(req, config)) {
      return refuse(socket, '403 Forbidden');
    }
    const token = embedTokenOf(req);
    if (token !== undefined) {
      const found = findActiveToken(db, embedOrigins, token);
      if (!found) return refuse(socket, '401 Unauthorized');
      // A session of its own kind: the hub's rules (epoch, lock, 2FA) apply as to a cookie.
      const data = {
        userId: found.user.id,
        sessionEpoch: found.sessionEpoch,
        embedTokenId: found.tokenId,
        embedOrigin: found.origin,
      };
      return wss.handleUpgrade(req, socket, head, (ws) => {
        hub.add(ws, `embed:${found.tokenId}`, data);
        serve(ws, { hub, db });
      });
    }
    // The normal session middleware tells who is connecting; the hub judges their rights.
    sessionParser(req, {}, () => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        hub.add(ws, req.sessionID, req.session);
        serve(ws, { hub, db });
      });
    });
  });

  return wss;
}
