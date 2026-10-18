// ============================================================
// File:        RoomPicker.jsx
// Path:        client/src/app/RoomPicker.jsx
// Project:     Seasonal Entertainment
// Description: The chat drawer's room picker: a button with the room's colour mark, "# name"
//              and a chevron, opening a listbox of the rooms the reader may read. Keyboard:
//              arrows (and Home/End) move, Enter or Space picks, Escape or Tab closes the list
//              (Escape does not reach the drawer); focus goes back to the button. A member's
//              favourite rooms come first, in their own "Favourites" group. Each option is one
//              row of fixed columns — mark, name (one line, ellipsis), favourite star (the
//              filled stroke star of icons.jsx), unread count — like the full chat's room list.
// ============================================================

import { useRef, useState } from 'react';
import { UnreadCount } from '../chat/index.js';
import Icon from './icons.jsx';
import './RoomPicker.css';

// Rooms carry no colour of their own: each gets a season colour by its place in the list.
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const seasonOf = (index) => SEASONS[index % SEASONS.length];

// The listbox's groups: favourites (when there are any) and the rest. offset: the first
// room's place in `rooms`, which the keyboard moves through as one list.
function groupsOf(rooms, favouriteCount) {
  if (favouriteCount === 0) return [{ title: 'Rooms', offset: 0, list: rooms }];
  return [
    { title: 'Favourites', offset: 0, list: rooms.slice(0, favouriteCount) },
    { title: 'Rooms', offset: favouriteCount, list: rooms.slice(favouriteCount) },
  ];
}

// rooms: [{ slug, name, season }], favourites first; favouriteCount: how many of them are
// favourites; value: the current slug; onChange(slug); unreadOf(slug): its unread count;
// mutedOf(slug): whether it is muted (its count dimmed); mentionOf(slug): its unread mentions.
export default function RoomPicker({
  rooms,
  favouriteCount = 0,
  value,
  onChange,
  unreadOf,
  mutedOf,
  mentionOf,
}) {
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
        <span className={`room-mark room-mark--${current.season}`} aria-hidden="true" />
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
          {groupsOf(rooms, favouriteCount).map(({ title, offset, list: members }) => (
            <li key={title} role="group" aria-label={title} className="room-picker__group">
              {favouriteCount > 0 && (
                <span className="room-picker__group-title" aria-hidden="true">
                  {title}
                </span>
              )}
              <ul role="presentation" className="room-picker__options">
                {members.map((room, j) => (
                  <li
                    key={room.slug}
                    id={`room-option-${room.slug}`}
                    role="option"
                    aria-selected={room.slug === value}
                    className={`room-picker__option${offset + j === active ? ' room-picker__option--active' : ''}`}
                    onClick={() => pick(room.slug)}
                  >
                    <span className={`room-mark room-mark--${room.season}`} aria-hidden="true" />
                    <span className="room-picker__option-name"># {room.name}</span>
                    {/* The group's name already says so to screen readers (Icon is hidden). */}
                    {offset + j < favouriteCount && (
                      <span className="room-picker__option-star">
                        <Icon name="star" size={16} filled />
                      </span>
                    )}
                    <UnreadCount
                      count={unreadOf(room.slug)}
                      kind="room"
                      label={`${unreadOf(room.slug)} unread`}
                      dim={mutedOf(room.slug)}
                      mention={mentionOf(room.slug) > 0}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
