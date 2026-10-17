// ============================================================
// File:        RoomPicker.jsx
// Path:        client/src/app/RoomPicker.jsx
// Project:     Seasonal Entertainment
// Description: The chat drawer's room picker: a button with the room's colour mark, "# name"
//              and a chevron, opening a listbox of the rooms the reader may read. Keyboard:
//              arrows (and Home/End) move, Enter or Space picks, Escape or Tab closes the list
//              (Escape does not reach the drawer); focus goes back to the button.
// ============================================================

import { useRef, useState } from 'react';
import Icon from './icons.jsx';

// Rooms carry no colour of their own: each gets a season colour by its place in the list.
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const seasonOf = (index) => SEASONS[index % SEASONS.length];

// rooms: [{ slug, name }]; value: the current slug; onChange(slug).
export default function RoomPicker({ rooms, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef(null);
  const list = useRef(null);
  const index = Math.max(
    0,
    rooms.findIndex((r) => r.slug === value)
  );
  const current = rooms[index];

  function openList() {
    setActive(index);
    setOpen(true);
    requestAnimationFrame(() => list.current?.focus());
  }

  function closeList() {
    setOpen(false);
    button.current?.focus();
  }

  function pick(slug) {
    onChange(slug);
    closeList();
  }

  function onListKey(event) {
    const last = rooms.length - 1;
    const moves = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(rooms[active].slug);
    } else if (event.key === 'Escape') {
      event.stopPropagation(); // closes the list only, not the drawer
      closeList();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  if (!current) return null;
  return (
    <div className="room-picker">
      <button
        ref={button}
        type="button"
        className="room-picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="room-picker-list"
        aria-label={`Room: ${current.name}`}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openList();
          }
        }}
      >
        <span className={`room-mark room-mark--${seasonOf(index)}`} aria-hidden="true" />
        <span className="room-picker__name"># {current.name}</span>
        <Icon name="chevron" size={18} />
      </button>
      {open && (
        <ul
          ref={list}
          id="room-picker-list"
          className="room-picker__list"
          role="listbox"
          aria-label="Rooms"
          tabIndex={-1}
          aria-activedescendant={`room-option-${rooms[active].slug}`}
          onKeyDown={onListKey}
        >
          {rooms.map((room, i) => (
            <li
              key={room.slug}
              id={`room-option-${room.slug}`}
              role="option"
              aria-selected={room.slug === value}
              className={`room-picker__option${i === active ? ' room-picker__option--active' : ''}`}
              onClick={() => pick(room.slug)}
            >
              <span className={`room-mark room-mark--${seasonOf(i)}`} aria-hidden="true" />#{' '}
              {room.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
