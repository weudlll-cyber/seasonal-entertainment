// ============================================================
// File:        service.js
// Path:        server/src/calls/service.js
// Project:     Seasonal Entertainment
// Description: The site's one door to the call service (LiveKit's RoomService API, server SDK
//              livekit-server-sdk): open and close a call's room, list who is in it, change a
//              participant's permissions, name and attributes, mute a track, which of some rooms
//              still exist (the stale-call job, staleCalls.js), set the room's
//              metadata (the spotlight, a running recording), and sign join tokens (grants.js);
//              with recording configured, start and stop a room's recording (LiveKit Egress,
//              room composite to an MP4 file). Built from config.calls; the routes take it as a
//              parameter, so tests hand in a stand-in with the same methods and never need a
//              running call server.
// ============================================================

import {
  AudioCodec,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptions,
  RoomServiceClient,
  VideoCodec,
} from 'livekit-server-sdk';
import { joinToken } from './grants.js';

// LiveKit closes a room nobody joined after this; a live call is ended by the site itself.
const EMPTY_TIMEOUT_S = 10 * 60;

// A recording (decided 2026-10-22): 1280 x 720 at 15 frames a second, H.264 at about 1 Mbit/s
// and AAC at 64 kbit/s; a call without video is a mostly still picture and stays small.
export const RECORDING_ENCODING = {
  width: 1280,
  height: 720,
  framerate: 15,
  videoCodec: VideoCodec.H264_MAIN,
  videoBitrate: 1000,
  audioCodec: AudioCodec.AAC,
  audioBitrate: 64,
  audioFrequency: 48000,
  keyFrameInterval: 4,
};
// LiveKit's speaker layout: a shared screen or a camera large when there is one, the
// speakers' tiles otherwise.
const RECORDING_LAYOUT = 'speaker';

// calls: config.calls ({ url, httpOrigin, apiKey, apiSecret, recording }) or null (feature off).
export function createCallService(calls) {
  if (!calls) return null;
  const rooms = new RoomServiceClient(calls.httpOrigin, calls.apiKey, calls.apiSecret);
  const egress = new EgressClient(calls.httpOrigin, calls.apiKey, calls.apiSecret);
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
    // Of these room names, the ones the call service still has. Throws when it cannot be
    // reached, so an outage never looks like rooms that are gone.
    existingRooms: async (names) => (await rooms.listRooms(names)).map((room) => room.name),
    // options: { permission, name, attributes } (only what changes).
    updateParticipant: (name, identity, options) =>
      rooms.updateParticipant(name, identity, options),
    muteTrack: (name, identity, trackSid) =>
      rooms.mutePublishedTrack(name, identity, trackSid, true),
    setRoomMetadata: (name, metadata) => rooms.updateRoomMetadata(name, metadata),
    // file: the recording's name; it lands in config.calls.recording.dir. Resolves its id.
    async startRecording(name, file) {
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: `${calls.recording.egressDir}/${file}`,
      });
      const info = await egress.startRoomCompositeEgress(name, output, {
        layout: RECORDING_LAYOUT,
        encodingOptions: new EncodingOptions(RECORDING_ENCODING),
      });
      return info.egressId;
    },
    // A recording that already stopped (the room closed) is fine.
    async stopRecording(egressId) {
      try {
        await egress.stopEgress(egressId);
      } catch (error) {
        if (error?.status !== 404 && error?.status !== 412) throw error;
      }
    },
    token: (claims) => joinToken(calls, claims),
  };
}
