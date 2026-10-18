// ============================================================
// File:        CallStage.jsx
// Path:        client/src/calls/CallStage.jsx
// Project:     Seasonal Entertainment
// Description: A joined call: the stage, the call's sound, the controls and the listeners,
//              wired to the live connection (useCallRoom). Organisers get the stage actions;
//              a speaker the spotlight for themselves; notices (no sound in the screen share,
//              errors) show under the controls.
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
  const tileActions = (person) => {
    if (person.isLocal) return me.speaker ? { highlightSelf: controls.highlightSelf } : null;
    return host ? controls : null;
  };
  return (
    <>
      <Stage
        speakers={speakers}
        room={room}
        spotlight={spotlight}
        talking={activeSpeakers}
        tileActions={tileActions}
        onAllSpeakers={host ? () => controls.spotlight(null) : null}
      />
      <RoomAudio room={room} />
      <CallControls me={me} local={room.localParticipant} host={host} controls={controls} />
      {notice && (
        <p className="form-message form-message--notice" role="status">
          {notice}
        </p>
      )}
      <FormMessage error={error} />
      <Audience listeners={listeners} onInvite={host ? controls.invite : null} />
    </>
  );
}
