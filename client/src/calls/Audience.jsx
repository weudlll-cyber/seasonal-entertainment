// ============================================================
// File:        Audience.jsx
// Path:        client/src/calls/Audience.jsx
// Project:     Seasonal Entertainment
// Description: The listeners (design "Community Call – Bühne"). Collapsed (the default): one row of
//              chips — every raised hand first, then a few more — with "+N" and a button to show
//              all; expanded: "Find a listener" and the whole list, scrolling inside its capped
//              height. One chip per listener — an initial circle and the name; raised hands first,
//              marked in autumn orange with the hand symbol; guests tagged; hidden listeners ("A
//              listener") last, with a neutral circle. Organisers invite members from a compact
//              button inside the chip (guests can only listen); hidden listeners are numbered in
//              their Invite button's name ("Invite listener 2 to the stage"), so each button has
//              its own name and organisers tell them apart by position.
// ============================================================

import { useState } from 'react';
import Icon from '../app/icons.jsx';
import {
  audienceOrder,
  collapsedListeners,
  findListeners,
  isHidden,
  listenerNames,
} from './stageModel.js';
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
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const ordered = audienceOrder(listeners);
  const row = collapsedListeners(ordered);
  const shown = expanded ? findListeners(ordered, query) : row.shown;
  const names = listenerNames(ordered);
  // Whom an Invite button names (none for guests and oneself).
  const inviteName = (person) =>
    onInvite && person.kind !== 'guest' && !person.isLocal ? names.get(person.identity) : null;
  return (
    <section className={`audience${expanded ? ' audience--expanded' : ''}`} aria-label="Listeners">
      <div className="audience__head">
        <h2 className="audience__title">
          Listeners <span className="audience__count">{listeners.length}</span>
        </h2>
        {!expanded && row.more > 0 && (
          <span className="audience__more" aria-label={`${row.more} more listeners`}>
            +{row.more}
          </span>
        )}
        {(expanded || row.more > 0) && (
          <button
            type="button"
            className="audience__toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show fewer' : 'Show all listeners'}
          </button>
        )}
      </div>
      {expanded && (
        <input
          type="search"
          className="search-input audience__search"
          aria-label="Find a listener"
          placeholder="Find a listener"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
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
      {expanded && query && shown.length === 0 && (
        <p className="audience__none">No listener of that name.</p>
      )}
    </section>
  );
}
