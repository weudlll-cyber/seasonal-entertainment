// ============================================================
// File:        EmbedCallView.jsx
// Path:        client/src/embed/EmbedCallView.jsx
// Project:     Seasonal Entertainment
// Description: What the call view inside a game shows (EmbedCallPage.jsx holds its state;
//              docs/GAME-INTEGRATION.md section 9). Three forms by the frame's size
//              (callView.js formOf): the 16:9 picture (the call page's Stage, letterboxed, with
//              the controls over it: the Recording mark top left, Open the call page and Collapse
//              top right, Listen in the middle, Mute and Leave bottom right, all 44 px); the
//              48 px column (LIVE and recording marks, Listen or Mute with a ring while someone
//              on the stage talks, Expand); the phone's 48 px strip (the same, with the name of
//              who speaks). The call's sound plays in every form while listening, out of sight
//              too; the picture is left out while the game says the view is out of sight, so
//              no video is received. "Open the call page" opens a new tab: the game stays.
// ============================================================

import Icon from '../app/icons.jsx';
import LiveBadge from '../calls/LiveBadge.jsx';
import RecordingConsent from '../calls/RecordingConsent.jsx';
import Stage from '../calls/Stage.jsx';
import { RoomAudio } from '../calls/TrackMedia.jsx';
import { recordingLabel } from '../calls/recordingLabel.js';
import { spotlightSpeaker } from '../calls/stageModel.js';
import { FormMessage } from '../components/FormField.jsx';
import { formOf } from './callView.js';
import '../calls/callPage.css';
import './EmbedCall.css';

const NO_MENU = () => null;

function ViewButton({ icon, label, onClick, pressed, talking = false }) {
  return (
    <button
      type="button"
      className={`embed-call__button${talking ? ' embed-call__button--talking' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

function OpenCallPage({ id }) {
  return (
    <a
      className="embed-call__button"
      href={`/calls/${id}`}
      target="_blank"
      rel="noopener"
      aria-label="Open the call page"
      title="Open the call page"
    >
      <Icon name="external" size={22} />
    </a>
  );
}

// What the view says instead of the call: not started, over, joining, left.
function stateText(status, gone, liveStatus) {
  if (gone) return 'This call no longer exists.';
  if (status === 'ended') return 'The call has ended.';
  if (status === 'scheduled') return 'Not started yet';
  if (liveStatus === 'joining') return 'Joining…';
  if (liveStatus === 'left') return 'You left the call.';
  return null;
}

// Outside a game of this site: only the way to the call page (the calls, for the shared view).
export function RefusedView({ href }) {
  return (
    <main className="embed-call embed-call--refused">
      <p>This call view opens inside the site&apos;s games.</p>
      <a href={href} target="_top">
        Open the call page
      </a>
    </main>
  );
}

export default function EmbedCallView({
  id,
  allowed,
  call,
  status,
  gone,
  live,
  size,
  collapsed,
  visible,
  muted,
  onListen,
  onDecline,
  onMute,
  onCollapse,
}) {
  if (!allowed) return <RefusedView href={`/calls/${id}`} />;
  const joined = live.status === 'joined';
  const recording = joined ? live.recording : Boolean(call?.recording);
  const recordingState = joined ? live.recordingState : call?.recordingState;
  const speakers = live.people.filter((p) => p.speaker);
  const talking = speakers.filter((p) => live.activeSpeakers.has(p.identity));
  const canListen = status === 'live' && !joined && live.status !== 'joining';
  const form = formOf({ ...size, collapsed });
  const listenOrMute = joined ? (
    <ViewButton
      icon={muted ? 'volumeOff' : 'volume'}
      label={muted ? 'Unmute the call' : 'Mute the call'}
      pressed={muted}
      talking={talking.length > 0}
      onClick={onMute}
    />
  ) : canListen ? (
    <ViewButton icon="volume" label="Listen" onClick={onListen} />
  ) : null;
  const marks = (
    <>
      {status === 'live' && <LiveBadge />}
      {recording && (
        <span className="embed-call__dot" role="img" aria-label="Being recorded">
          <Icon name="record" size={16} />
        </span>
      )}
    </>
  );
  const text = stateText(status, gone, live.status);
  // Who speaks now, else the spotlight, else the first speaker: the strip's name.
  const speaking = talking[0] ?? spotlightSpeaker(live.spotlight, speakers) ?? speakers[0];

  let content;
  if (form === 'picture') {
    content = (
      <div className="embed-call__picture">
        {joined && visible && (
          <Stage
            speakers={speakers}
            room={live.room}
            spotlight={live.spotlight}
            talking={live.activeSpeakers}
            me={live.people.find((p) => p.isLocal)}
            tileMenu={NO_MENU}
          />
        )}
        <div className="embed-call__top">
          {recording && (
            <span className="call-recording-mark" role="status">
              <Icon name="record" size={16} />
              {recordingLabel(recordingState, 'Recording')}
            </span>
          )}
          <span className="embed-call__gap" />
          <OpenCallPage id={id} />
          <ViewButton icon="shrink" label="Collapse" onClick={() => onCollapse(true)} />
        </div>
        <div className="embed-call__middle">
          {canListen && (
            <button type="button" className="button embed-call__listen" onClick={onListen}>
              <Icon name="volume" size={20} /> Listen
            </button>
          )}
          {text && <p role="status">{text}</p>}
          <FormMessage error={live.error} />
        </div>
        {joined && (
          <div className="embed-call__bottom">
            {listenOrMute}
            <ViewButton icon="leave" label="Leave" onClick={live.controls.leave} />
          </div>
        )}
      </div>
    );
  } else {
    content = (
      <div className={`embed-call__bar embed-call__bar--${form}`}>
        <span className="embed-call__marks">{marks}</span>
        {form === 'strip' && (
          <span className="embed-call__name">{joined ? speaking?.name : text}</span>
        )}
        {form === 'column' && text && <span className="embed-call__hidden">{text}</span>}
        {listenOrMute}
        <ViewButton icon="expand" label="Expand" onClick={() => onCollapse(false)} />
      </div>
    );
  }
  return (
    <main className={`embed-call embed-call--${form}`}>
      {content}
      {joined && <RoomAudio room={live.room} muted={muted} />}
      {live.consent && (
        <RecordingConsent onConfirm={live.controls.confirmRecording} onDecline={onDecline} />
      )}
    </main>
  );
}
