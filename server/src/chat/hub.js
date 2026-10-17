// ============================================================
// File:        hub.js
// Path:        server/src/chat/hub.js
// Project:     Seasonal Entertainment
// Description: The live chat hub: which open sockets (socket.js) are subscribed to which
//              room, and pushing new and hidden messages to them.
// ============================================================

import { WebSocket } from 'ws';

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
