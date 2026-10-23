// ============================================================
// File:        MentionSuggestions.jsx
// Path:        client/src/chat/MentionSuggestions.jsx
// Project:     Seasonal Entertainment
// Description: @mention suggestions in a room's composer (members only): typing "@" and at least
//              2 more characters right before the cursor lists members who may read the room
//              (useMemberSearch with the room filter). Arrow keys move, Enter or Tab inserts
//              "@username ", Escape closes the list (not a drawer around it). The message
//              field keeps the focus; the list is its listbox (aria-activedescendant).
// ============================================================

import { useId, useState } from 'react';
import { QUERY_MIN, useMemberSearch } from './useMemberSearch.js';

// The "@name" being typed right before the cursor: { query, start } or null.
function mentionAt(text, caret) {
  const match = /(?:^|[^A-Za-z0-9_.@-])@([A-Za-z0-9_.-]{0,24})$/.exec(text.slice(0, caret));
  return match ? { query: match[1], start: caret - match[1].length - 1 } : null;
}

// field: the textarea's ref; draft / setDraft: its text; room: the slug (null: no mentions).
export function useMentionSuggestions({ field, draft, setDraft, room }) {
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [closedAt, setClosedAt] = useState(null); // the "@" position Escape closed
  const listId = useId();
  const token = room ? mentionAt(draft, caret) : null;
  const { members } = useMemberSearch(token ? token.query : '', room);
  const open =
    Boolean(token) &&
    token.query.length >= QUERY_MIN &&
    members.length > 0 &&
    closedAt !== token.start;
  const at = Math.min(active, members.length - 1);

  function pick(member) {
    const end = token.start + token.query.length + 1;
    const inserted = `@${member.username} `;
    setDraft(draft.slice(0, token.start) + inserted + draft.slice(end));
    const next = token.start + inserted.length;
    setCaret(next);
    setActive(0);
    // A frame later the composer may be gone (the panel closed): then there is nothing to do.
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next, next);
    });
  }

  // The field's key handler first asks this; true when the key was used here.
  function onKeyDown(event) {
    if (!open) return false;
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) setActive((at + step + members.length) % members.length);
    else if (event.key === 'Enter' || event.key === 'Tab') pick(members[at]);
    else if (event.key === 'Escape') {
      event.stopPropagation();
      setClosedAt(token.start);
    } else return false;
    event.preventDefault();
    return true;
  }

  const optionId = (m) => `${listId}-${m.id}`;
  return {
    // Spread onto the message field.
    fieldProps: {
      'aria-autocomplete': room ? 'list' : undefined,
      'aria-controls': open ? listId : undefined,
      'aria-activedescendant': open ? optionId(members[at]) : undefined,
      onSelect: (event) => setCaret(event.target.selectionStart),
    },
    trackCaret: (event) => {
      setCaret(event.target.selectionStart);
      setActive(0);
    },
    onKeyDown,
    list: open ? (
      <ul id={listId} role="listbox" aria-label="Mention a member" className="chat-mentions">
        {members.map((m, i) => (
          <li
            key={m.id}
            id={optionId(m)}
            role="option"
            aria-selected={i === at}
            className={`chat-mentions__option${i === at ? ' chat-mentions__option--active' : ''}`}
            // Keeps the focus in the field while the mouse picks.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(m)}
          >
            @{m.username}
          </li>
        ))}
      </ul>
    ) : null,
  };
}
