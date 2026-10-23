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
//              Connection limits (security check 2026-10-22): at most `maxConnectionsPerMember`
//              open sockets per member account (cookie and embed together), at most
//              `maxGuestConnectionsPerIp` per address for guests; one more is accepted and
//              closed at once with TOO_MANY_CONNECTIONS, which the client shows and does not
//              retry in a loop (client/src/chat/connection.js).
// ============================================================

import { WebSocketServer } from 'ws';
import { findActiveToken } from '../embed/tokens.js';
import { selfOrigin } from '../http/csrf.js';
import { sessionUser } from '../http/session.js';
import { findRoomBySlug } from './store.js';

export const CHAT_SOCKET_PATH = '/ws/chat';
const CHAT_PROTOCOL = 'se-chat';
const EMBED_PROTOCOL_PREFIX = 'se-embed.';
// Close code from the private range: too many open connections (the client knows it).
export const TOO_MANY_CONNECTIONS = 4008;

// The client's address as Express's req.ip sees it with "trust proxy" set to a hop count: the
// last `trustProxy` X-Forwarded-For entries were added by our own proxies.
export function clientIp(req, trustProxy) {
  const forwarded = (req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const chain = [...forwarded, req.socket.remoteAddress];
  return chain[Math.max(0, chain.length - 1 - trustProxy)];
}

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
  // Accepted, then closed with its own code when the limit is reached: a refused upgrade
  // would look like a network error to the browser, which could not tell it apart.
  const accept = (req, socket, head, owner, sessionId, data) =>
    wss.handleUpgrade(req, socket, head, (ws) => {
      const limit =
        owner.userId !== undefined
          ? config.chat.maxConnectionsPerMember
          : config.chat.maxGuestConnectionsPerIp;
      if (hub.countOpen(owner) >= limit) {
        return ws.close(TOO_MANY_CONNECTIONS, 'too many connections');
      }
      hub.add(ws, sessionId, data, owner.ip);
      serve(ws, { hub, db });
    });

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
      return accept(req, socket, head, { userId: found.user.id }, `embed:${found.tokenId}`, data);
    }
    const ip = clientIp(req, config.trustProxy);
    // The normal session middleware tells who is connecting; the hub judges their rights.
    sessionParser(req, {}, () => {
      // A session whose account no longer qualifies counts as a guest's.
      const userId = sessionUser(db, req.session)?.id;
      accept(req, socket, head, { userId, ip }, req.sessionID, req.session);
    });
  });

  return wss;
}
