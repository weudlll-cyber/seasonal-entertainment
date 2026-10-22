// ============================================================
// File:        CallPage.jsx
// Path:        client/src/pages/CallPage.jsx
// Project:     Seasonal Entertainment
// Description: /calls/:id, one call in the app shell (fixed viewport; nothing scrolls but
//              inner lists): header (LIVE, start time, how many speak and listen), then the
//              stage taking all the height left, the control bar and the listeners, and the
//              call's chat on the right (CallChat: collapsible to a slim tab). On narrow
//              screens the chat opens as a drawer over the page. The sidebar is an icon rail
//              here (Layout, Sidebar). Sound starts only after "Join call" (browsers need a
//              click before they play sound). Not live: what is the case, and the chat. A call
//              linked to an event bot occurrence names that event (docs/CALLS.md). Recording
//              (docs/CALLS.md, "Recording"): organisers start and stop it here; while it runs
//              the call shows a red "Recording" (and, to someone not in it, "Being recorded"),
//              a start during the call shows a banner, and joining or sending asks first
//              (RecordingConsent); the recordings are listed with a player (CallRecordings).
// ============================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api/http.js';
import CallChat, { useChatCollapsed } from '../calls/CallChat.jsx';
import CallRecordings from '../calls/CallRecordings.jsx';
import CallStage from '../calls/CallStage.jsx';
import LiveBadge from '../calls/LiveBadge.jsx';
import RecordingConsent from '../calls/RecordingConsent.jsx';
import { useCallRoom } from '../calls/useCallRoom.js';
import { callsChanged } from '../calls/useCallsSummary.js';
import { formatWhen } from '../app/dates.js';
import Icon from '../app/icons.jsx';
import { FormMessage } from '../components/FormField.jsx';
import '../calls/callPage.css';

const STATUS_TEXT = {
  idle: null,
  joining: 'Joining…',
  left: 'You left the call.',
  ended: 'The call has ended.',
};

export default function CallPage() {
  const { id } = useParams();
  // GET /api/calls/:id: { call, canManage, recordingEnabled }.
  const [answer, setAnswer] = useState(null);
  const [version, setVersion] = useState(0); // after a recording starts or stops
  const [error, setError] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useChatCollapsed();
  const live = useCallRoom(id);

  useEffect(() => {
    api(`/calls/${id}`)
      .then(setAnswer)
      .catch((err) => setError(err.message));
  }, [id, live.status, live.recording, version]);
  // An ended call changes the list and the sidebar's LIVE badge.
  useEffect(() => {
    if (live.status === 'ended') callsChanged();
  }, [live.status]);

  if (!answer) return <FormMessage error={error} />;
  const info = answer.call;
  const joined = live.status === 'joined';
  const recording = joined ? live.recording : info.recording;
  const canRecord = answer.canManage && answer.recordingEnabled && info.status === 'live';

  async function toggleRecording() {
    setError(null);
    try {
      await api(`/calls/${id}/recording/${recording ? 'stop' : 'start'}`, { method: 'POST' });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  }
  const speakers = live.people.filter((p) => p.speaker).length;
  return (
    <section
      className={`call-page${chatOpen ? ' call-page--chat-open' : ''}${chatCollapsed ? ' call-page--chat-collapsed' : ''}`}
    >
      <header className="call-page__header">
        <h1>
          {info.title} {info.status === 'live' && <LiveBadge />}
          {joined && recording && (
            <span className="call-recording-mark" role="status">
              <Icon name="record" size={16} />
              Recording
            </span>
          )}
        </h1>
        <p className="call-page__facts">
          {info.status === 'live' && `Started ${formatWhen(info.startedAt)}`}
          {info.status === 'scheduled' && 'This call has not started yet.'}
          {info.status === 'ended' && 'This call has ended.'}
          {info.event && ` · Event: ${info.event.name}`}
          {!joined && recording && ' · Being recorded'}
          {joined && ` · ${speakers} speaking · ${live.people.length - speakers} listening`}
        </p>
        {canRecord && (
          <button type="button" className="button button--secondary" onClick={toggleRecording}>
            {recording ? 'Stop recording' : 'Start recording'}
          </button>
        )}
        <button
          type="button"
          className="button button--secondary call-page__chat-button"
          aria-expanded={chatOpen}
          aria-controls="call-chat"
          onClick={() => setChatOpen(!chatOpen)}
        >
          {chatOpen ? 'Hide chat' : 'Show chat'}
        </button>
        {/* Inside the header: the page is a grid of header, stage and chat. */}
        {live.recordingNotice && (
          <p className="banner call-recording-banner" role="status">
            This call is now being recorded{' '}
            <button
              type="button"
              className="button button--secondary"
              onClick={live.controls.dismissRecordingNotice}
            >
              Dismiss
            </button>
          </p>
        )}
        <FormMessage error={error} />
      </header>
      <div className="call-page__main">
        {joined ? (
          <CallStage call={live} />
        ) : (
          <div className="call-page__join">
            {info.status === 'live' && live.status !== 'ended' && (
              <button type="button" className="button" onClick={() => live.controls.join()}>
                Join call
              </button>
            )}
            <p role="status">{STATUS_TEXT[live.status]}</p>
            <FormMessage error={live.error} />
            <CallRecordings callId={id} canManage={answer.canManage} version={version} />
          </div>
        )}
      </div>
      {live.consent && (
        <RecordingConsent
          onConfirm={live.controls.confirmRecording}
          onDecline={live.controls.declineRecording}
        />
      )}
      {info.chatRoom && (
        <CallChat
          room={info.chatRoom}
          status={info.status}
          collapsed={chatCollapsed}
          onCollapse={setChatCollapsed}
        />
      )}
    </section>
  );
}
