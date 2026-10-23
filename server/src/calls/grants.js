// ============================================================
// File:        grants.js
// Path:        server/src/calls/grants.js
// Project:     Seasonal Entertainment
// Description: What a participant may do in a call's room, and the short-lived join token
//              that carries it (signed with the call service's key pair; livekit-server-sdk).
//              Listeners: receive only — no publishing, no data messages. Speakers: microphone,
//              camera and screen share (with its audio). Nobody may change their own name,
//              metadata or attributes: hands, roles and the spotlight are set by the server.
// ============================================================

import { AccessToken, TrackSource } from 'livekit-server-sdk';

// A token is used to connect only; LiveKit refreshes it for a running connection.
const TOKEN_TTL = '10m';

const SPEAKER_SOURCES = [
  TrackSource.MICROPHONE,
  TrackSource.CAMERA,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
];

// The permission part of a grant, also sent to LiveKit when someone joins or leaves the stage.
export const stagePermission = (onStage) => ({
  canSubscribe: true,
  canPublish: onStage,
  canPublishData: false,
  canPublishSources: onStage ? SPEAKER_SOURCES : [],
});

// keys: { apiKey, apiSecret }; claims: { roomName, identity, name, onStage, attributes }.
export function joinToken(keys, { roomName, identity, name, onStage, attributes }) {
  const token = new AccessToken(keys.apiKey, keys.apiSecret, {
    identity,
    name,
    ttl: TOKEN_TTL,
    attributes,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canUpdateOwnMetadata: false,
    ...stagePermission(onStage),
  });
  return token.toJwt();
}
