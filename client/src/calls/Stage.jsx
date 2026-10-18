// ============================================================
// File:        Stage.jsx
// Path:        client/src/calls/Stage.jsx
// Project:     Seasonal Entertainment
// Description: The stage (design "Community Call – Bühne"): all speakers in an adaptive grid,
//              or — when the server's spotlight names a speaker — that speaker large: their
//              shared screen with their camera inset and the label "<name> is sharing the
//              screen" (plus a sound icon when the share carries audio), or their camera; the
//              other speakers in a strip below. Organisers can return to all speakers.
// ============================================================

import { Track } from 'livekit-client';
import Icon from '../app/icons.jsx';
import SpeakerTile from './SpeakerTile.jsx';
import { spotlightSpeaker } from './stageModel.js';
import { TrackVideo, participantOf, trackOf } from './TrackMedia.jsx';

function Highlighted({ person, room }) {
  const screen = trackOf(room, person.identity, Track.Source.ScreenShare);
  const camera = trackOf(room, person.identity, Track.Source.Camera);
  const withSound = Boolean(
    participantOf(room, person.identity)?.getTrackPublication(Track.Source.ScreenShareAudio)
  );
  return (
    <figure className="stage-spotlight__main">
      {screen ? (
        <TrackVideo track={screen} label={`${person.name}'s screen`} />
      ) : camera ? (
        <TrackVideo track={camera} label={`${person.name}'s camera`} />
      ) : (
        <span className="speaker-tile__initial" aria-hidden="true">
          {person.name.charAt(0).toUpperCase()}
        </span>
      )}
      {screen && camera && (
        <TrackVideo
          track={camera}
          label={`${person.name}'s camera`}
          className="stage-spotlight__inset"
        />
      )}
      <figcaption className="stage-spotlight__label">
        {screen ? `${person.name} is sharing the screen` : `${person.name} is in the spotlight`}
        {screen && withSound && (
          <span role="img" aria-label="with sound">
            <Icon name="volume" size={18} />
          </span>
        )}
      </figcaption>
    </figure>
  );
}

// tileActions(person): the actions for one tile, or null; onAllSpeakers: organisers only.
export default function Stage({ speakers, room, spotlight, talking, tileActions, onAllSpeakers }) {
  const highlighted = spotlightSpeaker(spotlight, speakers);
  const tile = (person) => (
    <SpeakerTile
      key={person.identity}
      person={person}
      room={room}
      talking={talking.has(person.identity)}
      highlighted={highlighted?.identity === person.identity}
      actions={tileActions(person)}
    />
  );
  if (speakers.length === 0) {
    return (
      <section className="stage" aria-label="Stage">
        <p className="stage__empty">Nobody is on the stage yet.</p>
      </section>
    );
  }
  if (!highlighted) {
    return (
      <section className="stage" aria-label="Stage">
        <ul className="stage-grid">{speakers.map(tile)}</ul>
      </section>
    );
  }
  return (
    <section className="stage stage--spotlight" aria-label="Stage">
      <Highlighted person={highlighted} room={room} />
      <ul className="stage-strip" aria-label="Other speakers">
        {speakers.filter((s) => s !== highlighted).map(tile)}
      </ul>
      {onAllSpeakers && (
        <button type="button" className="button button--secondary" onClick={onAllSpeakers}>
          Show all speakers
        </button>
      )}
    </section>
  );
}
