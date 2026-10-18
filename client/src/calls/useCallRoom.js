// ============================================================
// File:        useCallRoom.js
// Path:        client/src/calls/useCallRoom.js
// Project:     Seasonal Entertainment
// Description: One call's live connection (livekit-client): joins only when asked (the "Join
//              call" button — browsers play sound only after a user gesture), keeps the page
//              in step with the call service's events, and offers the participant's own
//              controls. The server decides who may do what (docs/CALLS.md); this hook only
//              asks it (hands, stage, spotlight, end) and uses what the token allows.
//              Listeners never publish; adaptive stream, dynacast and simulcast let each
//              listener receive the video layer that fits.
// ============================================================

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';
import { api } from '../api/http.js';
import { isChromium, personOf, shareAudioNotice, spotlightOf } from './stageModel.js';

// Every event that changes what the page shows.
const REDRAW = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.RoomMetadataChanged,
  RoomEvent.ParticipantAttributesChanged,
  RoomEvent.ParticipantPermissionsChanged,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.AudioPlaybackStatusChanged,
];

// Screen sharing with the shared tab's or system's sound where the browser allows it; the
// presenter does not hear their own shared sound twice.
const SHARE_OPTIONS = {
  audio: true,
  systemAudio: 'include',
  suppressLocalAudioPlayback: true,
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
};

// status: 'idle' | 'joining' | 'joined' | 'left' | 'ended' | 'error'.
export function useCallRoom(callId) {
  const room = useRef(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [kind, setKind] = useState(null);
  const [, redraw] = useReducer((n) => n + 1, 0);
  const post = useCallback(
    (path, body) => api(`/calls/${callId}/${path}`, { method: 'POST', body }),
    [callId]
  );

  useEffect(() => () => room.current?.disconnect(), []);

  async function join() {
    setStatus('joining');
    setError(null);
    try {
      const joined = await post('join');
      const next = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: { simulcast: true },
      });
      REDRAW.forEach((event) => next.on(event, redraw));
      next.on(RoomEvent.Disconnected, (reason) =>
        setStatus(reason === DisconnectReason.ROOM_DELETED ? 'ended' : 'left')
      );
      // The server keeps the spotlight; this client reports its own screen share.
      next.on(RoomEvent.LocalTrackPublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) {
          post('spotlight/share', { sharing: true }).catch(() => {});
        }
      });
      next.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) {
          setNotice(null);
          post('spotlight/share', { sharing: false }).catch(() => {});
        }
      });
      await next.connect(joined.url, joined.token);
      await next.startAudio();
      room.current = next;
      setKind(joined.kind);
      setStatus('joined');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  // Runs an action; its failure shows as the page's error line.
  const act =
    (work) =>
    async (...args) => {
      setError(null);
      try {
        await work(...args);
      } catch (err) {
        setError(err.message);
      }
    };
  const local = () => room.current.localParticipant;

  // Starts a screen share; then says whether it carries sound (stageModel.shareAudioNotice).
  async function startShare() {
    await local().setScreenShareEnabled(true, SHARE_OPTIONS);
    const hasAudio = Boolean(local().getTrackPublication(Track.Source.ScreenShareAudio));
    setNotice(shareAudioNotice(hasAudio, isChromium(navigator)));
  }

  const controls = {
    join,
    leave: act(async () => {
      await room.current?.disconnect();
      setStatus('left');
    }),
    toggleMicrophone: act(() => local().setMicrophoneEnabled(!local().isMicrophoneEnabled)),
    toggleCamera: act(() => local().setCameraEnabled(!local().isCameraEnabled)),
    toggleShare: act(async () => {
      if (local().isScreenShareEnabled) return local().setScreenShareEnabled(false);
      await startShare();
    }),
    // "Share again with sound": the browser asks once more, so the presenter can pick the
    // whole screen with system audio, or a tab with its audio.
    reshare: act(async () => {
      await local().setScreenShareEnabled(false);
      await startShare();
    }),
    leaveStage: act(() => post('leave-stage')),
    raiseHand: act((raised) => post('hand', { raised })),
    highlightSelf: act((on) => post('spotlight/self', { on })),
    // Organisers.
    invite: act((identity) => post(`stage/${identity}`)),
    remove: act((identity) => api(`/calls/${callId}/stage/${identity}`, { method: 'DELETE' })),
    mute: act((identity) => post(`mute/${identity}`)),
    spotlight: act((identity) =>
      api(`/calls/${callId}/spotlight`, { method: 'PUT', body: { identity } })
    ),
    endCall: act(() => post('end')),
  };

  const current = room.current;
  const people = current
    ? [
        personOf(current.localParticipant, true),
        ...[...current.remoteParticipants.values()].map((p) => personOf(p)),
      ]
    : [];
  return {
    status,
    error,
    notice,
    kind,
    room: current,
    people,
    spotlight: spotlightOf(current?.metadata),
    activeSpeakers: new Set((current?.activeSpeakers ?? []).map((p) => p.identity)),
    controls,
  };
}
