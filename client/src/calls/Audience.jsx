// ============================================================
// File:        Audience.jsx
// Path:        client/src/calls/Audience.jsx
// Project:     Seasonal Entertainment
// Description: The listeners (design "Community Call – Bühne"): how many, "Find a listener",
//              and one chip per listener — an initial circle and the name; raised hands first,
//              marked in autumn orange with the hand symbol; guests tagged; hidden listeners
//              ("A listener") last, with a neutral circle. Organisers invite members from a
//              compact button inside the chip (guests can only listen); hidden listeners are
//              numbered in their Invite button's name ("Invite listener 2 to the stage"), so
//              each button has its own name and organisers tell them apart by position.
// ============================================================

import { useState } from 'react';
import Icon from '../app/icons.jsx';
import { audienceOrder, findListeners, isHidden, listenerNames } from './stageModel.js';
import './audience.css';

function Chip({ person, inviteName, onInvite }) {
  const hidden = isHidden(person);
  return (
    <li className={`audience-chip${person.hand ? ' audience-chip--hand' : ''}`}>
      <span
        className={`audience-chip__initial${hidden ? ' audience-chip__initial--neutral' : ''}`}
        aria-hidden="true"
      >
        {hidden ? <Icon name="person" size={16} /> : person.name.charAt(0).toUpperCase()}
      </span>
      <span className="audience-chip__name">
        {person.name}
        {person.isLocal && ' (you)'}
      </span>
      {person.hand && (
        <span className="audience-chip__hand" role="img" aria-label="Hand raised">
          <Icon name="hand" size={16} />
        </span>
      )}
      {person.kind === 'guest' && <span className="audience-chip__tag">Guest</span>}
      {inviteName && (
        <button
          type="button"
          className="audience-chip__invite"
          aria-label={`Invite ${inviteName} to the stage`}
          onClick={() => onInvite(person.identity)}
        >
          Invite
        </button>
      )}
    </li>
  );
}

// onInvite(identity): organisers only, else null.
export default function Audience({ listeners, onInvite }) {
  const [query, setQuery] = useState('');
  const shown = findListeners(audienceOrder(listeners), query);
  const names = listenerNames(shown);
  // Whom an Invite button names (none for guests and oneself).
  const inviteName = (person) =>
    onInvite && person.kind !== 'guest' && !person.isLocal ? names.get(person.identity) : null;
  return (
    <section className="audience" aria-label="Listeners">
      <h2 className="audience__title">
        Listeners <span className="audience__count">{listeners.length}</span>
      </h2>
      <input
        type="search"
        className="search-input audience__search"
        aria-label="Find a listener"
        placeholder="Find a listener"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="audience__list">
        {shown.map((person) => (
          <Chip
            key={person.identity}
            person={person}
            inviteName={inviteName(person)}
            onInvite={onInvite}
          />
        ))}
      </ul>
      {query && shown.length === 0 && <p className="audience__none">No listener of that name.</p>}
    </section>
  );
}
