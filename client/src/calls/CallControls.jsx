// ============================================================
// File:        CallControls.jsx
// Path:        client/src/calls/CallControls.jsx
// Project:     Seasonal Entertainment
// Description: The control bar under the stage. Speakers: microphone, camera, share screen
//              (first a short "use headphones" hint, since the share carries sound where the
//              browser allows), leave the stage. Member listeners: raise or lower the hand
//              (guests have none). Organisers: end the call for everyone. Everyone: leave.
//              Icon buttons with visible labels; on/off state in aria-pressed.
// ============================================================

import { useState } from 'react';
import Icon from '../app/icons.jsx';
import { HEADPHONES_HINT } from './stageModel.js';
import './callControls.css';

function ControlButton({ icon, label, pressed, onClick, danger = false, ...rest }) {
  return (
    <button
      type="button"
      className={`call-control${danger ? ' call-control--danger' : ''}`}
      aria-pressed={pressed}
      onClick={onClick}
      {...rest}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

// me: stageModel person of oneself; local: LiveKit's local participant; host: may end the
// call; controls: useCallRoom().controls.
export default function CallControls({ me, local, host, controls }) {
  const [asking, setAsking] = useState(false);
  const sharing = local.isScreenShareEnabled;

  async function share() {
    setAsking(false);
    await controls.toggleShare();
  }

  return (
    <div className="call-controls" role="toolbar" aria-label="Call controls">
      {me.speaker && (
        <>
          <ControlButton
            icon={local.isMicrophoneEnabled ? 'mic' : 'micOff'}
            label="Microphone"
            pressed={local.isMicrophoneEnabled}
            onClick={controls.toggleMicrophone}
          />
          <ControlButton
            icon={local.isCameraEnabled ? 'camera' : 'cameraOff'}
            label="Camera"
            pressed={local.isCameraEnabled}
            onClick={controls.toggleCamera}
          />
          <ControlButton
            icon="screen"
            label="Share screen"
            pressed={sharing}
            aria-expanded={sharing ? undefined : asking}
            onClick={() => (sharing ? controls.toggleShare() : setAsking(!asking))}
          />
          <ControlButton icon="leave" label="Leave the stage" onClick={controls.leaveStage} />
        </>
      )}
      {!me.speaker && me.kind !== 'guest' && (
        <ControlButton
          icon="hand"
          label={me.hand ? 'Lower hand' : 'Raise hand'}
          pressed={me.hand}
          onClick={() => controls.raiseHand(!me.hand)}
        />
      )}
      {host && (
        <ControlButton
          icon="close"
          label="End call for everyone"
          danger
          onClick={controls.endCall}
        />
      )}
      <ControlButton icon="leave" label="Leave call" onClick={controls.leave} />
      {asking && (
        <div className="call-controls__ask" role="group" aria-label="Share your screen">
          <p>{HEADPHONES_HINT}</p>
          <button type="button" className="button" onClick={share}>
            Share now
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setAsking(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
