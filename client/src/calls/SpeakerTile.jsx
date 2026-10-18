// ============================================================
// File:        SpeakerTile.jsx
// Path:        client/src/calls/SpeakerTile.jsx
// Project:     Seasonal Entertainment
// Description: One speaker on the stage: their shared screen if they share one (never
//              cropped), else their camera picture (or the name's first letter). Shown large
//              (alone on the stage) the camera is never cropped either; in the grid of several
//              the picture takes the camera's own aspect ratio, so filling it crops at most a
//              thin edge (docs/DESIGN.md, "Call page"). Name, role (Host or Speaker),
//              microphone state, and a ring while they talk. Organisers get a "…" menu on other
//              speakers' tiles (Spotlight, Mute, Remove from the stage) — the chat module's
//              MenuButton.
// ============================================================

import { Track } from 'livekit-client';
import Icon from '../app/icons.jsx';
import { MenuButton } from '../chat/index.js';
import { TrackVideo, aspectOf, hasMicrophoneOn, trackOf } from './TrackMedia.jsx';
import './speakerTile.css';

// person: stageModel.personOf(); menu: the "…" menu's items, or null; large: the only tile
// on the stage (it fills the stage).
export default function SpeakerTile({ person, room, talking, menu, large = false }) {
  const screen = trackOf(room, person.identity, Track.Source.ScreenShare);
  const camera = trackOf(room, person.identity, Track.Source.Camera);
  const micOn = hasMicrophoneOn(room, person.identity);
  const name = person.isLocal ? `${person.name} (you)` : person.name;
  return (
    <li
      className={`speaker-tile${talking ? ' speaker-tile--talking' : ''}${large ? ' speaker-tile--large' : ''}`}
      aria-label={`${name}, ${person.kind === 'host' ? 'host' : 'speaker'}${talking ? ', talking' : ''}`}
    >
      {/* In the grid the picture keeps the camera's shape; large, it fills the stage. */}
      <div
        className="speaker-tile__picture"
        style={
          large ? undefined : { aspectRatio: aspectOf(room, person.identity, Track.Source.Camera) }
        }
      >
        {screen || camera ? (
          <TrackVideo
            track={screen ?? camera}
            label={`${person.name}'s ${screen ? 'screen' : 'camera'}`}
            fit={screen || large ? 'contain' : 'cover'}
          />
        ) : (
          <span className="speaker-tile__initial" aria-hidden="true">
            {person.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="speaker-tile__line">
        <span className="speaker-tile__name">{name}</span>
        <span className="speaker-tile__role">{person.kind === 'host' ? 'Host' : 'Speaker'}</span>
        <span
          className={`speaker-tile__mic${micOn ? '' : ' speaker-tile__mic--off'}`}
          role="img"
          aria-label={micOn ? 'Microphone on' : 'Microphone off'}
        >
          <Icon name={micOn ? 'mic' : 'micOff'} size={16} />
        </span>
        {menu && (
          <MenuButton
            items={menu}
            label={person.name}
            buttonLabel={`Actions for ${person.name}`}
            className="speaker-tile__more"
          >
            <span aria-hidden="true">…</span>
          </MenuButton>
        )}
      </div>
    </li>
  );
}
