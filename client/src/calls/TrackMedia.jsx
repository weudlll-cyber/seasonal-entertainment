// ============================================================
// File:        TrackMedia.jsx
// Path:        client/src/calls/TrackMedia.jsx
// Project:     Seasonal Entertainment
// Description: Showing a call's media: a video element for one camera or screen track, and
//              the call's sound — every remote microphone and shared-screen sound, each in its
//              own audio element (one's own is never played back). Plus finding a person's
//              LiveKit participant, their tracks by source and a camera's aspect ratio.
// ============================================================

import { useEffect, useRef } from 'react';
import { Track } from 'livekit-client';

export const participantOf = (room, identity) =>
  room.localParticipant.identity === identity
    ? room.localParticipant
    : room.remoteParticipants.get(identity);

// The live track of a source ('camera', 'screen_share', ...), or null when there is none or
// it is muted.
export function trackOf(room, identity, source) {
  const publication = participantOf(room, identity)?.getTrackPublication(source);
  return publication?.track && !publication.isMuted ? publication.track : null;
}

// A source's width / height as the call service reports it; 16:9 until it is known.
export function aspectOf(room, identity, source) {
  const size = participantOf(room, identity)?.getTrackPublication(source)?.dimensions;
  return size?.width && size?.height ? size.width / size.height : 16 / 9;
}

export const hasMicrophoneOn = (room, identity) =>
  Boolean(trackOf(room, identity, Track.Source.Microphone));

// label: what the video shows, e.g. "mia's camera" (the element has no other text); fit:
// 'contain' for screens (never cropped, letterboxed), 'cover' for cameras (fill the tile).
export function TrackVideo({ track, label, className = '', fit = 'cover' }) {
  const element = useRef(null);
  useEffect(() => {
    const node = element.current;
    track.attach(node);
    return () => track.detach(node);
  }, [track]);
  return (
    <video
      ref={element}
      className={`track-video track-video--${fit} ${className}`}
      autoPlay
      playsInline
      muted
      aria-label={label}
    />
  );
}

function AudioTrack({ track }) {
  const element = useRef(null);
  useEffect(() => {
    const node = element.current;
    track.attach(node);
    return () => track.detach(node);
  }, [track]);
  return <audio ref={element} autoPlay />;
}

export function RoomAudio({ room }) {
  const tracks = [...room.remoteParticipants.values()]
    .flatMap((p) => [...p.audioTrackPublications.values()])
    .filter((publication) => publication.track);
  return (
    <div hidden>
      {tracks.map((publication) => (
        <AudioTrack key={publication.trackSid} track={publication.track} />
      ))}
    </div>
  );
}
