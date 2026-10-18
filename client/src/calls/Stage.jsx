// ============================================================
// File:        Stage.jsx
// Path:        client/src/calls/Stage.jsx
// Project:     Seasonal Entertainment
// Description: The stage (design "Community Call – Bühne"), taking all the height the call
//              page has left: all speakers in an adaptive grid, or one speaker large — the one
//              the server's spotlight names, or without one whoever shares a screen
//              (stageModel.shownLarge: a published share always shows) — with their shared
//              screen (never cropped: letterboxed), their camera inset, and the other speakers
//              in a strip below. Over its top left a row of chips: "<name> is sharing the
//              screen" (a sound icon when the share carries audio), "Show all speakers" for
//              organisers, and a speaker's own spotlight switch; top right the full-screen
//              button.
// ============================================================

import { useRef } from 'react';
import { Track } from 'livekit-client';
import Icon from '../app/icons.jsx';
import FullscreenButton from './FullscreenButton.jsx';
import SpeakerTile from './SpeakerTile.jsx';
import { shownLarge } from './stageModel.js';
import { TrackVideo, participantOf, trackOf } from './TrackMedia.jsx';
import './stage.css';

function Highlighted({ person, room }) {
  const screen = trackOf(room, person.identity, Track.Source.ScreenShare);
  const camera = trackOf(room, person.identity, Track.Source.Camera);
  return (
    <figure className="stage-spotlight__main">
      {screen ? (
        <TrackVideo track={screen} label={`${person.name}'s screen`} fit="contain" />
      ) : camera ? (
        <TrackVideo track={camera} label={`${person.name}'s camera`} fit="contain" />
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
    </figure>
  );
}

// The chips over the stage's top left.
function StageChips({ highlighted, room, me, onAllSpeakers, onHighlightSelf }) {
  const sharing =
    highlighted && trackOf(room, highlighted.identity, Track.Source.ScreenShare) !== null;
  const withSound =
    sharing &&
    Boolean(
      participantOf(room, highlighted.identity)?.getTrackPublication(Track.Source.ScreenShareAudio)
    );
  const mine = highlighted?.identity === me?.identity;
  return (
    <div className="stage__chips">
      {highlighted && (
        <span className="stage-chip stage-chip--label">
          {sharing
            ? `${highlighted.name} is sharing the screen`
            : `${highlighted.name} is in the spotlight`}
          {withSound && (
            <span role="img" aria-label="with sound">
              <Icon name="volume" size={16} />
            </span>
          )}
        </span>
      )}
      {highlighted && onAllSpeakers && (
        <button type="button" className="stage-chip" onClick={onAllSpeakers}>
          Show all speakers
        </button>
      )}
      {onHighlightSelf && (
        <button type="button" className="stage-chip" onClick={() => onHighlightSelf(!mine)}>
          {mine ? 'Leave the spotlight' : 'Put me in the spotlight'}
        </button>
      )}
    </div>
  );
}

// me: oneself (stageModel person); tileMenu(person): a speaker tile's menu items or null;
// onAllSpeakers: organisers only; onHighlightSelf(on): speakers only.
export default function Stage({
  speakers,
  room,
  spotlight,
  talking,
  me,
  tileMenu,
  onAllSpeakers,
  onHighlightSelf,
}) {
  const element = useRef(null);
  const sharers = speakers
    .filter((s) => trackOf(room, s.identity, Track.Source.ScreenShare))
    .map((s) => s.identity);
  const highlighted = shownLarge(spotlight, speakers, sharers);
  const tile = (person) => (
    <SpeakerTile
      key={person.identity}
      person={person}
      room={room}
      talking={talking.has(person.identity)}
      menu={tileMenu(person)}
    />
  );
  let content;
  if (speakers.length === 0) {
    content = <p className="stage__empty">Nobody is on the stage yet.</p>;
  } else if (!highlighted) {
    content = <ul className="stage-grid">{speakers.map(tile)}</ul>;
  } else {
    const others = speakers.filter((s) => s !== highlighted);
    content = (
      <>
        <Highlighted person={highlighted} room={room} />
        {others.length > 0 && (
          <ul className="stage-strip" aria-label="Other speakers">
            {others.map(tile)}
          </ul>
        )}
      </>
    );
  }
  return (
    <section
      ref={element}
      className={`stage${highlighted ? ' stage--spotlight' : ''}`}
      aria-label="Stage"
    >
      <StageChips
        highlighted={highlighted}
        room={room}
        me={me}
        onAllSpeakers={onAllSpeakers}
        onHighlightSelf={onHighlightSelf}
      />
      <FullscreenButton target={element} />
      {content}
    </section>
  );
}
