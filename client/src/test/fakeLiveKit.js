// ============================================================
// File:        fakeLiveKit.js
// Path:        client/src/test/fakeLiveKit.js
// Project:     Seasonal Entertainment
// Description: Test helper: a stand-in for livekit-client, installed with
//              vi.mock('livekit-client', () => import('../test/fakeLiveKit.js')). Each Room records
//              what the page asks (connect, startAudio, disconnect, the local participant's
//              microphone, camera and screen share) and lets a test send events (emit) and set
//              the room's metadata. Every room made is in `rooms` (empty it before each test).
// ============================================================

import { vi } from 'vitest';

export const rooms = [];

export class Room {
  constructor(options) {
    this.options = options;
    this.handlers = {};
    this.metadata = '';
    this.activeSpeakers = [];
    this.remoteParticipants = new Map();
    this.connect = vi.fn(async () => {});
    this.startAudio = vi.fn(async () => {});
    this.disconnect = vi.fn(async () => {});
    const room = this;
    this.localParticipant = {
      identity: 'p-me',
      name: 'me',
      attributes: { kind: 'member', hand: '0', handAt: '' },
      permissions: { canPublish: false },
      isMicrophoneEnabled: false,
      isCameraEnabled: false,
      isScreenShareEnabled: false,
      getTrackPublication: () => undefined, // no sound with the share
      setMicrophoneEnabled: vi.fn(async function (on) {
        this.isMicrophoneEnabled = on;
      }),
      setCameraEnabled: vi.fn(async function (on) {
        this.isCameraEnabled = on;
      }),
      setScreenShareEnabled: vi.fn(async function (on) {
        this.isScreenShareEnabled = on;
        room.emit('localTrackPublished', { source: 'screen_share' });
      }),
    };
    rooms.push(this);
  }

  on(event, handler) {
    (this.handlers[event] ??= []).push(handler);
  }

  emit(event, ...args) {
    (this.handlers[event] ?? []).forEach((h) => h(...args));
  }
}

// Event names as the page uses them: RoomEvent.TrackMuted -> 'trackMuted'.
export const RoomEvent = new Proxy(
  {},
  { get: (_t, name) => name.charAt(0).toLowerCase() + name.slice(1) }
);
export const DisconnectReason = { ROOM_DELETED: 5 };
export const Track = {
  Source: {
    Camera: 'camera',
    Microphone: 'microphone',
    ScreenShare: 'screen_share',
    ScreenShareAudio: 'screen_share_audio',
  },
};
