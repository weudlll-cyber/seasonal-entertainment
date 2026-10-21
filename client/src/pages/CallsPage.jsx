// ============================================================
// File:        CallsPage.jsx
// Path:        client/src/pages/CallsPage.jsx
// Project:     Seasonal Entertainment
// Description: /calls: live calls on top, then upcoming and recent ones (docs/CALLS.md).
//              Organisers and admins create, start and end calls here. Without a call service
//              admins see "not configured"; the sidebar hides Calls from everyone else then.
//              SE style: the Calls header with the play-button quarter; an empty list shows a
//              friendly card instead (never a bare "None."). Planned calls offer "Add to
//              calendar" and, to members, "Remind me on this site" (CallActions.jsx).
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import CallCard from '../calls/CallCard.jsx';
import CallForm from '../calls/CallForm.jsx';
import PageHeader from '../brand/PageHeader.jsx';
import { callsChanged } from '../calls/useCallsSummary.js';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';
import '../calls/calls.css';

const LEAD = 'Community calls with speakers on stage and everyone listening.';
const SECTIONS = [
  ['live', 'Live now'],
  ['upcoming', 'Upcoming'],
  ['recent', 'Recent'],
];
// What an empty section says: [title, line].
const EMPTY = {
  live: [
    'No call is live right now',
    'When an organiser starts a community call, it shows up here.',
  ],
  upcoming: ['No call is planned yet', 'Organisers announce the next community calls here.'],
  recent: ['No calls yet', 'Calls that have ended show up here.'],
};

export default function CallsPage() {
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    api('/calls')
      .then(setData)
      .catch((err) => setError(err.message));
  }, [userId, version]);

  // After a change: this list and the sidebar's LIVE badge reload.
  const changed = () => {
    setVersion((v) => v + 1);
    callsChanged();
  };

  async function act(call, action) {
    setError(null);
    try {
      await api(`/calls/${call.id}/${action}`, { method: 'POST' });
      changed();
    } catch (err) {
      setError(err.message);
    }
  }

  async function create(call) {
    await api('/calls', { method: 'POST', body: call });
    changed();
  }

  if (data && !data.configured) {
    return (
      <section className="page">
        <PageHeader quarter="calls" title="Calls" lead={LEAD} />
        <p>
          {user?.role === 'admin'
            ? 'Calls are not configured: the call service keys are missing (docs/CALLS.md).'
            : 'There are no calls.'}
        </p>
      </section>
    );
  }

  return (
    <section className="page page--wide">
      <PageHeader quarter="calls" title="Calls" lead={LEAD} />
      <FormMessage error={error} />
      {data &&
        SECTIONS.map(([key, title]) => (
          <section key={key} aria-label={title} className="calls-section">
            <h2>{title}</h2>
            {data.calls[key].length === 0 ? (
              <div className="card calls-none">
                <p className="calls-none__title">{EMPTY[key][0]}</p>
                <p className="calls-section__empty">{EMPTY[key][1]}</p>
              </div>
            ) : (
              <ul className="call-list">
                {data.calls[key].map((call) => (
                  <CallCard
                    key={call.id}
                    call={call}
                    reminded={data.reminders?.includes(call.id)}
                    onAction={data.canManage ? act : null}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      {/* After the lists: live calls stay on top (decided 2026-10-18). */}
      {data?.canManage && <CallForm onCreate={create} />}
    </section>
  );
}
