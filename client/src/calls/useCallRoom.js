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
//              listener receive the video layer that fits. While a recording runs (docs/CALLS.md,
//              "Recording"), joining — and, for someone who joined before it started, turning
//              on the microphone, camera or a screen share — waits for "I understand this call
//              is being recorded" (consent); a recording that starts during the call shows its
//              banner once (recordingNotice).
// ============================================================

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';
import { ApiError, api } from '../api/http.js';
import { isChromium, personOf, recordingOf, shareAudioNotice, spotlightOf } from './stageModel.js';

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
  // A step waiting for "I understand this call is being recorded": { run } or null.
  const [consent, setConsent] = useState(null);
  const consented = useRef(false); // this member confirmed it in this call already
  const [recordingNotice, setRecordingNotice] = useState(false);
  const [, redraw] = useReducer((n) => n + 1, 0);
  const post = useCallback(
    (path, body) => api(`/calls/${callId}/${path}`, { method: 'POST', body }),
    [callId]
  );

  useEffect(() => () => room.current?.disconnect(), []);

  // agreed: true only when the member confirmed the recording (the server asks for it while
  // one runs); anything else, a click event included, is no.
  async function join(agreed = false) {
    const confirmed = agreed === true;
    setStatus('joining');
    setError(null);
    try {
      const joined = await post('join', confirmed ? { recordingConsent: true } : undefined);
      if (confirmed) consented.current = true;
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
      // Being recorded: ask first; no connection without the member's yes.
      if (err instanceof ApiError && err.code === 'recording_consent') {
        setStatus('idle');
        setConsent({ run: () => join(true) });
        return;
      }
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
  // Turning something on that is sent (microphone, camera, screen) while a recording runs,
  // for someone who has not confirmed it yet: asked first.
  const sending = (turningOn, work) => {
    if (turningOn && recordingOf(room.current?.metadata) && !consented.current) {
      setConsent({
        run: async () => {
          consented.current = true;
          await work();
        },
      });
      return undefined;
    }
    return work();
  };

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
    toggleMicrophone: act(() => {
      const on = !local().isMicrophoneEnabled;
      return sending(on, () => local().setMicrophoneEnabled(on));
    }),
    toggleCamera: act(() => {
      const on = !local().isCameraEnabled;
      return sending(on, () => local().setCameraEnabled(on));
    }),
    toggleShare: act(async () => {
      if (local().isScreenShareEnabled) return local().setScreenShareEnabled(false);
      await sending(true, startShare);
    }),
    // The member's answer to the recording question.
    confirmRecording: act(async () => {
      const pending = consent;
      setConsent(null);
      await pending?.run();
    }),
    declineRecording: () => setConsent(null),
    dismissRecordingNotice: () => setRecordingNotice(false),
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
  const recording = recordingOf(current?.metadata);
  // A recording that starts while this member is in the call: its banner, once per start.
  const wasRecording = useRef(null);
  useEffect(() => {
    if (status !== 'joined') {
      wasRecording.current = null;
      return;
    }
    if (wasRecording.current === false && recording) setRecordingNotice(true);
    if (!recording) setRecordingNotice(false);
    wasRecording.current = recording;
  }, [status, recording]);
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
    recording,
    recordingNotice,
    consent: Boolean(consent),
    activeSpeakers: new Set((current?.activeSpeakers ?? []).map((p) => p.identity)),
    controls,
  };
}
