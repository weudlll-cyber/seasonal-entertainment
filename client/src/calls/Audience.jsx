// ============================================================
// File:        Audience.jsx
// Path:        client/src/calls/Audience.jsx
// Project:     Seasonal Entertainment
// Description: The listeners: how many, "Find a listener", and the list — raised hands first
//              and marked, then names (guests tagged), hidden listeners ("A listener") last.
//              Organisers invite members to the stage from here (guests can only listen).
// ============================================================

import { useState } from 'react';
import Icon from '../app/icons.jsx';
import { audienceOrder, findListeners } from './stageModel.js';
import './audience.css';

// onInvite(identity): organisers only, else null.
export default function Audience({ listeners, onInvite }) {
  const [query, setQuery] = useState('');
  const shown = findListeners(audienceOrder(listeners), query);
  return (
    <section className="audience" aria-label="Listeners">
      <h2 className="audience__title">
        Listeners <span className="audience__count">{listeners.length}</span>
      </h2>
      <input
        type="search"
        className="audience__search"
        aria-label="Find a listener"
        placeholder="Find a listener"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="audience__list">
        {shown.map((person) => (
          <li
            key={person.identity}
            className={`audience__item${person.hand ? ' audience__item--hand' : ''}`}
          >
            {person.hand && (
              <span className="audience__hand" role="img" aria-label="Hand raised">
                <Icon name="hand" size={18} />
              </span>
            )}
            <span className="audience__name">
              {person.name}
              {person.isLocal && ' (you)'}
            </span>
            {person.kind === 'guest' && <span className="audience__tag">Guest</span>}
            {onInvite && person.kind !== 'guest' && !person.isLocal && (
              <button
                type="button"
                className="link-button"
                aria-label={`Invite ${person.name} to the stage`}
                onClick={() => onInvite(person.identity)}
              >
                Invite
              </button>
            )}
          </li>
        ))}
      </ul>
      {query && shown.length === 0 && <p className="audience__none">No listener of that name.</p>}
    </section>
  );
}
