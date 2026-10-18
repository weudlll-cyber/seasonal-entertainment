// ============================================================
// File:        CallControls.jsx
// Path:        client/src/calls/CallControls.jsx
// Project:     Seasonal Entertainment
// Description: The call's control bar (design "Community Call – Bühne"): one row of round icon
//              buttons at the bottom, each with a visible tooltip and its accessible name.
//              Speakers: microphone, camera, share screen (first a short "use headphones"
//              hint, since the share carries sound where the browser allows), then leave the
//              stage. Member listeners: raise or lower the hand (guests have none). Organisers:
//              end the call for everyone (red, asks first). Everyone: leave the call. A toggle's
//              name and tooltip say what a click will do ("Mute microphone", "Stop sharing");
//              its icon and colour show the current state (slashed and red: microphone or
//              camera off; slashed and highlighted: sharing); aria-pressed is the state.
// ============================================================

import { useState } from 'react';
import Icon from '../app/icons.jsx';
import { HEADPHONES_HINT } from './stageModel.js';
import './callControls.css';

// tone: 'off' red (a muted microphone, a camera that is off), 'on' accent (sharing), 'hand'
// autumn (a raised hand), 'danger' (end the call).
function ControlButton({ icon, label, pressed, onClick, tone = '', ...rest }) {
  return (
    <button
      type="button"
      className={`call-control${tone ? ` call-control--${tone}` : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={label}
      onClick={onClick}
      {...rest}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

// A question over the bar with its action and Cancel (share with sound, end the call).
function Ask({ label, text, action, onAction, onCancel, danger = false }) {
  return (
    <div className="call-controls__ask" role="group" aria-label={label}>
      <p>{text}</p>
      <button
        type="button"
        className={`button${danger ? ' call-controls__danger' : ''}`}
        onClick={onAction}
      >
        {action}
      </button>
      <button type="button" className="button button--secondary" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// me: stageModel person of oneself (kind from the server); local: LiveKit's local
// participant; host: may end the call; controls: useCallRoom().controls.
export default function CallControls({ me, local, host, controls }) {
  const [asking, setAsking] = useState(null); // 'share' | 'end' | null
  const sharing = local.isScreenShareEnabled;
  const micOn = local.isMicrophoneEnabled;
  const cameraOn = local.isCameraEnabled;
  const ask = (what) => setAsking(asking === what ? null : what);

  async function share() {
    setAsking(null);
    await controls.toggleShare();
  }

  return (
    <div className="call-controls" role="toolbar" aria-label="Call controls">
      {me.speaker && (
        <>
          <ControlButton
            icon={micOn ? 'mic' : 'micOff'}
            label={micOn ? 'Mute microphone' : 'Unmute microphone'}
            pressed={micOn}
            tone={micOn ? '' : 'off'}
            onClick={controls.toggleMicrophone}
          />
          <ControlButton
            icon={cameraOn ? 'camera' : 'cameraOff'}
            label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            pressed={cameraOn}
            tone={cameraOn ? '' : 'off'}
            onClick={controls.toggleCamera}
          />
          <ControlButton
            icon={sharing ? 'screenOff' : 'screen'}
            label={sharing ? 'Stop sharing' : 'Share screen'}
            pressed={sharing}
            tone={sharing ? 'on' : ''}
            aria-expanded={sharing ? undefined : asking === 'share'}
            onClick={() => (sharing ? controls.toggleShare() : ask('share'))}
          />
          <span className="call-controls__gap" aria-hidden="true" />
          <ControlButton icon="leave" label="Leave the stage" onClick={controls.leaveStage} />
        </>
      )}
      {!me.speaker && me.kind !== 'guest' && (
        <ControlButton
          icon="hand"
          label={me.hand ? 'Lower hand' : 'Raise hand'}
          pressed={me.hand}
          tone={me.hand ? 'hand' : ''}
          onClick={() => controls.raiseHand(!me.hand)}
        />
      )}
      <span className="call-controls__gap" aria-hidden="true" />
      {host && (
        <ControlButton
          icon="phoneOff"
          label="End call for everyone"
          tone="danger"
          aria-expanded={asking === 'end'}
          onClick={() => ask('end')}
        />
      )}
      <ControlButton icon="close" label="Leave call" onClick={controls.leave} />
      {asking === 'share' && (
        <Ask
          label="Share your screen"
          text={HEADPHONES_HINT}
          action="Share now"
          onAction={share}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking === 'end' && (
        <Ask
          label="End the call for everyone"
          text="End the call for everyone? Everybody is disconnected and the chat becomes read-only."
          action="End call"
          danger
          onAction={() => {
            setAsking(null);
            controls.endCall();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
}
