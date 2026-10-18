// ============================================================
// File:        CallStage.jsx
// Path:        client/src/calls/CallStage.jsx
// Project:     Seasonal Entertainment
// Description: A joined call, stage first: the stage takes all the height left, then the
//              control bar (one row), notices (no sound in the screen share, with "Share again
//              with sound" where the browser could send it; errors) and the listener panel
//              (collapsed to one row). Wired to the live connection (useCallRoom). Organisers
//              get a "…" menu on other speakers (Spotlight, Mute, Remove from the stage) and
//              "Show all speakers"; a speaker the spotlight for themselves.
// ============================================================

import Audience from './Audience.jsx';
import CallControls from './CallControls.jsx';
import Stage from './Stage.jsx';
import { FormMessage } from '../components/FormField.jsx';
import { RoomAudio } from './TrackMedia.jsx';

// call: useCallRoom()'s result after joining.
export default function CallStage({ call }) {
  const { room, people, spotlight, activeSpeakers, controls, kind, notice, error } = call;
  const host = kind === 'host';
  // One's own kind as the server answered the join (host, member or guest).
  const me = { ...people.find((p) => p.isLocal), kind };
  const speakers = people.filter((p) => p.speaker);
  const listeners = people.filter((p) => !p.speaker);
  const tileMenu = (person) =>
    host && !person.isLocal
      ? [
          { label: 'Spotlight', run: () => controls.spotlight(person.identity) },
          { label: 'Mute', run: () => controls.mute(person.identity) },
          {
            label: 'Remove from the stage',
            run: () => controls.remove(person.identity),
            confirm: { question: `Take ${person.name} off the stage?`, action: 'Remove' },
          },
        ]
      : null;
  return (
    <>
      <Stage
        speakers={speakers}
        room={room}
        spotlight={spotlight}
        talking={activeSpeakers}
        me={me}
        tileMenu={tileMenu}
        onAllSpeakers={host ? () => controls.spotlight(null) : null}
        onHighlightSelf={me.speaker ? controls.highlightSelf : null}
      />
      <RoomAudio room={room} />
      <CallControls me={me} local={room.localParticipant} host={host} controls={controls} />
      {notice && (
        <div className="form-message form-message--notice call-notice" role="status">
          <p>{notice.text}</p>
          {notice.reshare && (
            <button type="button" className="button" onClick={controls.reshare}>
              Share again with sound
            </button>
          )}
        </div>
      )}
      <FormMessage error={error} />
      <Audience listeners={listeners} onInvite={host ? controls.invite : null} />
    </>
  );
}
