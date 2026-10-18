// ============================================================
// File:        SpeakerTile.jsx
// Path:        client/src/calls/SpeakerTile.jsx
// Project:     Seasonal Entertainment
// Description: One speaker on the stage: camera picture (or the name's first letter), name,
//              role (Host or Speaker), microphone state, and a ring while they talk. Organisers
//              get Spotlight, Mute and Remove for others; a speaker may put themselves in the
//              spotlight.
// ============================================================

import { Track } from 'livekit-client';
import Icon from '../app/icons.jsx';
import { TrackVideo, hasMicrophoneOn, trackOf } from './TrackMedia.jsx';

// person: stageModel.personOf(); actions: { spotlight, mute, remove, highlightSelf } or null.
export default function SpeakerTile({ person, room, talking, highlighted, actions }) {
  const camera = trackOf(room, person.identity, Track.Source.Camera);
  const micOn = hasMicrophoneOn(room, person.identity);
  const name = person.isLocal ? `${person.name} (you)` : person.name;
  return (
    <li
      className={`speaker-tile${talking ? ' speaker-tile--talking' : ''}`}
      aria-label={`${name}, ${person.kind === 'host' ? 'host' : 'speaker'}${talking ? ', talking' : ''}`}
    >
      <div className="speaker-tile__picture">
        {camera ? (
          <TrackVideo track={camera} label={`${person.name}'s camera`} />
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
          <Icon name={micOn ? 'mic' : 'micOff'} size={18} />
        </span>
      </div>
      {actions && (
        <div className="speaker-tile__actions">
          {person.isLocal ? (
            <button
              type="button"
              className="link-button"
              onClick={() => actions.highlightSelf(!highlighted)}
            >
              {highlighted ? 'Leave the spotlight' : 'Put me in the spotlight'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="link-button"
                aria-label={`Spotlight ${person.name}`}
                onClick={() => actions.spotlight(person.identity)}
              >
                Spotlight
              </button>
              <button
                type="button"
                className="link-button"
                aria-label={`Mute ${person.name}`}
                onClick={() => actions.mute(person.identity)}
              >
                Mute
              </button>
              <button
                type="button"
                className="link-button"
                aria-label={`Remove ${person.name} from the stage`}
                onClick={() => actions.remove(person.identity)}
              >
                Remove
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
