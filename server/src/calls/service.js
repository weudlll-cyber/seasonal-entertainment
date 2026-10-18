// ============================================================
// File:        service.js
// Path:        server/src/calls/service.js
// Project:     Seasonal Entertainment
// Description: The site's one door to the call service (LiveKit's RoomService API, server SDK
//              livekit-server-sdk): open and close a call's room, list who is in it, change a
//              participant's permissions, name and attributes, mute a track, set the room's
//              metadata (the spotlight), and sign join tokens (grants.js). Built from
//              config.calls; the routes take it as a parameter, so tests hand in a stand-in with
//              the same methods and never need a running call server.
// ============================================================

import { RoomServiceClient } from 'livekit-server-sdk';
import { joinToken } from './grants.js';

// LiveKit closes a room nobody joined after this; a live call is ended by the site itself.
const EMPTY_TIMEOUT_S = 10 * 60;

// calls: config.calls ({ url, httpOrigin, apiKey, apiSecret }) or null (feature off).
export function createCallService(calls) {
  if (!calls) return null;
  const rooms = new RoomServiceClient(calls.httpOrigin, calls.apiKey, calls.apiSecret);
  return {
    url: calls.url,
    openRoom: (name, maxParticipants) =>
      rooms.createRoom({ name, maxParticipants, emptyTimeout: EMPTY_TIMEOUT_S }),
    // Disconnects everyone. A room that is already gone (empty timeout) is fine.
    async closeRoom(name) {
      try {
        await rooms.deleteRoom(name);
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    },
    listParticipants: (name) => rooms.listParticipants(name),
    // options: { permission, name, attributes } (only what changes).
    updateParticipant: (name, identity, options) =>
      rooms.updateParticipant(name, identity, options),
    muteTrack: (name, identity, trackSid) =>
      rooms.mutePublishedTrack(name, identity, trackSid, true),
    setRoomMetadata: (name, metadata) => rooms.updateRoomMetadata(name, metadata),
    token: (claims) => joinToken(calls, claims),
  };
}
