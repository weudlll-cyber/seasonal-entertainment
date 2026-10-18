// ============================================================
// File:        MemberSearch.jsx
// Path:        client/src/chat/MemberSearch.jsx
// Project:     Seasonal Entertainment
// Description: "Find a member" at the top of the Direct tab: a combobox with a listbox of up to
//              10 members (useMemberSearch). Arrow keys move, Enter opens the conversation (or
//              starts it), Escape closes the list (a second Escape clears the field). Members
//              who have not set up private messages are shown greyed and cannot be chosen.
//              Each result has the favourite star (UserStar) beside it, in a column next to
//              the listbox (a star inside an option could not be operated).
// ============================================================

import { useId, useState } from 'react';
import { showDirect } from './directView.js';
import UserStar from './UserStar.jsx';
import { QUERY_MIN, useMemberSearch } from './useMemberSearch.js';

export const NO_KEY_NOTE = 'Has not set up private messages yet';

export default function MemberSearch() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const { members, error } = useMemberSearch(query);
  const listId = useId();
  const open = !closed && members.length > 0;
  const at = Math.min(active, members.length - 1);
  const optionId = (m) => `${listId}-${m.id}`;

  function choose(member) {
    if (!member?.canReceive) return;
    showDirect({ id: member.id, username: member.username });
    setQuery('');
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!members.length) return;
      event.preventDefault();
      setClosed(false);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((at + step + members.length) % members.length);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(members[at]);
    } else if (event.key === 'Escape') {
      event.stopPropagation(); // the list or the field, not a drawer around it
      if (open) setClosed(true);
      else setQuery('');
    }
  }

  return (
    <div className="chat-member-search">
      <label>
        <span className="chat-label">Find a member</span>
        <input
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? optionId(members[at]) : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setClosed(false);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      {query.trim().length > 0 && query.trim().length < QUERY_MIN && (
        <p className="chat-note">Type at least {QUERY_MIN} characters.</p>
      )}
      {error && <p className="chat-note">{error}</p>}
      <div className="chat-member-search__results" hidden={!open}>
        <ul id={listId} role="listbox" aria-label="Members" className="chat-member-search__list">
          {open &&
            members.map((m, i) => (
              <li
                key={m.id}
                id={optionId(m)}
                role="option"
                aria-selected={i === at}
                aria-disabled={!m.canReceive}
                className={`chat-member-search__option${i === at ? ' chat-member-search__option--active' : ''}`}
                onClick={() => choose(m)}
              >
                <span className="chat-direct-list__name">{m.username}</span>
                {m.online && <span className="chat-online">online</span>}
                {!m.canReceive && <span className="chat-note">{NO_KEY_NOTE}</span>}
              </li>
            ))}
        </ul>
        <ul className="chat-member-search__stars" aria-label="Favourite members">
          {open &&
            members.map((m) => (
              <li key={m.id}>
                <UserStar member={m} />
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
