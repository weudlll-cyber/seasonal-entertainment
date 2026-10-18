// ============================================================
// File:        MenuButton.jsx
// Path:        client/src/chat/MenuButton.jsx
// Project:     Seasonal Entertainment
// Description: A button opening a small keyboard-operable menu: Enter, Space or ArrowDown open
//              it with the first item focused; arrows move, Escape closes and returns to the
//              button, Tab closes. An item may ask first (confirm: destructive actions): the
//              menu then shows the question with the action and Cancel. Used by a member's name
//              (NameMenu), a message's "…" (MessageMenu) and, through index.js, by hosts (the
//              call stage's speaker menu). Taken out of NameMenu (SE-CALLS-3).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import './ChatMenu.css';

// items: [{ label, run, confirm?: { question, action } }]; label: the menu's name;
// buttonLabel: the button's accessible name when its content is only a sign ("…");
// className: the button's class; children: what the button shows.
export default function MenuButton({ items, label, buttonLabel, className, children }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(null); // the item whose confirm question is shown
  const button = useRef(null);
  const menu = useRef(null);

  useEffect(() => {
    if (open) menu.current?.querySelector('[role="menuitem"], button')?.focus();
  }, [open, asking]);

  function close() {
    setOpen(false);
    setAsking(null);
    button.current?.focus();
  }

  function choose(item) {
    if (item.confirm && !asking) return setAsking(item);
    close();
    Promise.resolve(item.run()).catch(() => {});
  }

  function onMenuKey(event) {
    const entries = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const at = entries.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step && entries.length) {
      event.preventDefault();
      entries[(at + step + entries.length) % entries.length].focus();
    } else if (event.key === 'Escape') {
      event.stopPropagation(); // closes the menu only, not a drawer around it
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
      setAsking(null);
    }
  }

  return (
    <span className="chat-menu">
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open && !asking && (
        <ul
          ref={menu}
          className="chat-menu__list"
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose(item)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && asking && (
        <div
          ref={menu}
          className="chat-menu__list chat-menu__confirm"
          role="group"
          aria-label={asking.confirm.question}
          onKeyDown={onMenuKey}
        >
          <p>{asking.confirm.question}</p>
          <button type="button" className="chat-menu__danger" onClick={() => choose(asking)}>
            {asking.confirm.action}
          </button>
          <button type="button" onClick={close}>
            Cancel
          </button>
        </div>
      )}
    </span>
  );
}
