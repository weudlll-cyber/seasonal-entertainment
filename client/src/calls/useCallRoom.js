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
//              banner once (recordingNotice). How far it is (recordingState: starting until the
//              egress records, then active) and when its last start failed (recordingFailedAt)
//              come from the room's metadata too. listenOnly (the call view inside a game,
//              embed/EmbedCallPage.jsx): the server gives a listener's token, organisers too;
//              shared (the view of the call shared with the games) is refused while the member
//              is in the call elsewhere, or dropped when they join there: status 'elsewhere',
//              kept while it asks again. Sound the
//              browser holds back does not fail a join (controls.startAudio asks again on a
//              click). Leaving the call page is announced to this browser's other pages
//              (leftCall.js). errorCode: the server's code of a failed join (call_full, ...).
// ============================================================

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';
import { ApiError, api } from '../api/http.js';
import { announceLeft } from './leftCall.js';
import {
  isChromium,
  personOf,
  recordingOf,
  recordingStateOf,
  shareAudioNotice,
  spotlightOf,
} from './stageModel.js';

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

// A failure that says nothing about the call: no answer, too many requests, the server's own.
const passing = (err) =>
  err instanceof ApiError && (err.status === 0 || err.status === 429 || err.status >= 500);

// What the view shows once its connection is gone. The call service keeps one connection per
// person: the call page joining drops the shared view's, which then waits as for any member
// who is in the call elsewhere.
function afterDisconnect(reason, shared) {
  if (reason === DisconnectReason.ROOM_DELETED) return 'ended';
  if (shared && reason === DisconnectReason.DUPLICATE_IDENTITY) return 'elsewhere';
  return 'left';
}

// status: 'idle' | 'joining' | 'joined' | 'elsewhere' | 'left' | 'ended' | 'error'.
export function useCallRoom(callId, { listenOnly = false, shared = false } = {}) {
  const room = useRef(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
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

  // Disconnects; the call page (never a view, which only listens) then says that its member
  // left, once the call server has been told.
  const disconnect = useCallback(async () => {
    if (!room.current) return;
    await room.current.disconnect();
    if (!listenOnly) announceLeft(callId);
  }, [callId, listenOnly]);

  useEffect(
    () => () => {
      disconnect();
    },
    [disconnect]
  );

  // agreed: true only when the member confirmed the recording (the server asks for it while
  // one runs); anything else, a click event included, is no.
  async function join(agreed = false) {
    const confirmed = agreed === true;
    // Asking again while elsewhere keeps the note on the screen.
    setStatus((was) => (was === 'elsewhere' ? was : 'joining'));
    setError(null);
    setErrorCode(null);
    const body = {
      ...(confirmed && { recordingConsent: true }),
      ...(listenOnly && { listenOnly: true }),
      ...(shared && { shared: true }),
    };
    try {
      const joined = await post('join', Object.keys(body).length ? body : undefined);
      if (confirmed) consented.current = true;
      const next = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: { simulcast: true },
      });
      REDRAW.forEach((event) => next.on(event, redraw));
      next.on(RoomEvent.Disconnected, (reason) => setStatus(afterDisconnect(reason, shared)));
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
      // A browser may hold sound back until a click: the room then says so, and the view
      // offers one.
      await next.startAudio().catch(() => {});
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
      if (err instanceof ApiError && err.code === 'in_call_elsewhere') {
        setStatus('elsewhere');
        return;
      }
      // Asking again while elsewhere: no answer, a busy or failing server changes nothing.
      if (status === 'elsewhere' && passing(err)) return;
      setError(err.message);
      setErrorCode(err instanceof ApiError ? err.code : null);
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
    startAudio: act(async () => {
      await room.current?.startAudio();
      redraw();
    }),
    leave: act(async () => {
      await disconnect();
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
  const { state: recordingState, failedAt: recordingFailedAt } = recordingStateOf(
    current?.metadata
  );
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
    errorCode,
    notice,
    kind,
    room: current,
    people,
    spotlight: spotlightOf(current?.metadata),
    recording,
    recordingState,
    recordingFailedAt,
    recordingNotice,
    consent: Boolean(consent),
    activeSpeakers: new Set((current?.activeSpeakers ?? []).map((p) => p.identity)),
    controls,
  };
}
