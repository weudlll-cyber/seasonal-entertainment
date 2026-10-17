// ============================================================
// File:        NameMenu.jsx
// Path:        client/src/chat/NameMenu.jsx
// Project:     Seasonal Entertainment
// Description: A message author's name. For a signed-in member looking at another member's
//              message it is a button opening a small menu: "Add to favourites" or "Remove
//              from favourites". Keyboard: Enter, Space or ArrowDown open it with the first
//              item focused; arrows move, Escape closes and returns to the name, Tab closes.
//              Guests' names, one's own name and everything a guest sees stay plain text.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useSession } from '../session/SessionContext.jsx';
import { useFavourites } from './favourites.js';

export default function NameMenu({ name, authorId }) {
  const { user } = useSession();
  const favourites = useFavourites();
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const menu = useRef(null);

  useEffect(() => {
    if (open) menu.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);

  if (!favourites.member || !authorId || authorId === user?.id) return <strong>{name}</strong>;
  const favourite = favourites.isFavouriteUser(authorId);
  const items = [
    {
      label: favourite ? 'Remove from favourites' : 'Add to favourites',
      run: () => favourites.setUser(authorId, !favourite),
    },
  ];

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function onMenuKey(event) {
    const entries = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const at = entries.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      entries[(at + step + entries.length) % entries.length].focus();
    } else if (event.key === 'Escape') {
      event.stopPropagation(); // closes the menu only, not a drawer around it
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <span className="chat-name-menu">
      <button
        ref={button}
        type="button"
        className="chat-name"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {name}
      </button>
      {open && (
        <ul
          ref={menu}
          className="chat-name-menu__list"
          role="menu"
          aria-label={name}
          onKeyDown={onMenuKey}
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close();
                  item.run().catch(() => {});
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
