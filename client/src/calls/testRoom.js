// ============================================================
// File:        testRoom.js
// Path:        client/src/calls/testRoom.js
// Project:     Seasonal Entertainment
// Description: Test helpers for the call page's parts: a person as stageModel.personOf makes
//              it, a stand-in track (attach/detach recorded) and a LiveKit-like room whose
//              participants have tracks by source ('camera', 'screen_share', ...).
// ============================================================

import { vi } from 'vitest';

export const person = (name, extra = {}) => ({
  identity: `p-${name}`,
  name,
  kind: 'member',
  hand: false,
  handAt: '',
  speaker: false,
  isLocal: false,
  ...extra,
});

export const fakeTrack = () => ({ attach: vi.fn(), detach: vi.fn() });

export function fakeRoom(tracksByIdentity) {
  const participant = (identity) => ({
    identity,
    getTrackPublication: (source) => {
      const track = tracksByIdentity[identity]?.[source];
      return track ? { track, isMuted: false } : undefined;
    },
  });
  const ids = Object.keys(tracksByIdentity);
  return {
    localParticipant: participant('p-me'),
    remoteParticipants: new Map(ids.map((id) => [id, participant(id)])),
  };
}
