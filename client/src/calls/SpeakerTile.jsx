// ============================================================
// File:        SpeakerTile.jsx
// Path:        client/src/calls/SpeakerTile.jsx
// Project:     Seasonal Entertainment
// Description: One speaker on the stage: their shared screen if they share one (never
//              cropped), else their camera picture (or the name's first letter); name, role
//              (Host or Speaker), microphone state, and a ring while they talk. Organisers get
//              a "…" menu on other speakers' tiles (Spotlight, Mute, Remove from the stage) —
//              the chat module's MenuButton.
// ============================================================

import { Track } from 'livekit-client';
import Icon from '../app/icons.jsx';
import { MenuButton } from '../chat/index.js';
import { TrackVideo, hasMicrophoneOn, trackOf } from './TrackMedia.jsx';

// person: stageModel.personOf(); menu: the "…" menu's items, or null.
export default function SpeakerTile({ person, room, talking, menu }) {
  const screen = trackOf(room, person.identity, Track.Source.ScreenShare);
  const camera = trackOf(room, person.identity, Track.Source.Camera);
  const micOn = hasMicrophoneOn(room, person.identity);
  const name = person.isLocal ? `${person.name} (you)` : person.name;
  return (
    <li
      className={`speaker-tile${talking ? ' speaker-tile--talking' : ''}`}
      aria-label={`${name}, ${person.kind === 'host' ? 'host' : 'speaker'}${talking ? ', talking' : ''}`}
    >
      <div className="speaker-tile__picture">
        {screen || camera ? (
          <TrackVideo
            track={screen ?? camera}
            label={`${person.name}'s ${screen ? 'screen' : 'camera'}`}
            fit={screen ? 'contain' : 'cover'}
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
