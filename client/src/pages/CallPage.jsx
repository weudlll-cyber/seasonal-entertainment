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
//              click before they play sound). Not live: what is the case, and the chat.
// ============================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api/http.js';
import CallChat, { useChatCollapsed } from '../calls/CallChat.jsx';
import CallStage from '../calls/CallStage.jsx';
import LiveBadge from '../calls/LiveBadge.jsx';
import { useCallRoom } from '../calls/useCallRoom.js';
import { callsChanged } from '../calls/useCallsSummary.js';
import { formatWhen } from '../app/dates.js';
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
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useChatCollapsed();
  const live = useCallRoom(id);

  useEffect(() => {
    api(`/calls/${id}`)
      .then((data) => setInfo(data.call))
      .catch((err) => setError(err.message));
  }, [id, live.status]);
  // An ended call changes the list and the sidebar's LIVE badge.
  useEffect(() => {
    if (live.status === 'ended') callsChanged();
  }, [live.status]);

  if (!info) return <FormMessage error={error} />;
  const joined = live.status === 'joined';
  const speakers = live.people.filter((p) => p.speaker).length;
  return (
    <section
      className={`call-page${chatOpen ? ' call-page--chat-open' : ''}${chatCollapsed ? ' call-page--chat-collapsed' : ''}`}
    >
      <header className="call-page__header">
        <h1>
          {info.title} {info.status === 'live' && <LiveBadge />}
        </h1>
        <p className="call-page__facts">
          {info.status === 'live' && `Started ${formatWhen(info.startedAt)}`}
          {info.status === 'scheduled' && 'This call has not started yet.'}
          {info.status === 'ended' && 'This call has ended.'}
          {joined && ` · ${speakers} speaking · ${live.people.length - speakers} listening`}
        </p>
        <button
          type="button"
          className="button button--secondary call-page__chat-button"
          aria-expanded={chatOpen}
          aria-controls="call-chat"
          onClick={() => setChatOpen(!chatOpen)}
        >
          {chatOpen ? 'Hide chat' : 'Show chat'}
        </button>
      </header>
      <div className="call-page__main">
        {joined ? (
          <CallStage call={live} />
        ) : (
          <div className="call-page__join">
            {info.status === 'live' && live.status !== 'ended' && (
              <button type="button" className="button" onClick={live.controls.join}>
                Join call
              </button>
            )}
            <p role="status">{STATUS_TEXT[live.status]}</p>
            <FormMessage error={live.error} />
          </div>
        )}
      </div>
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
