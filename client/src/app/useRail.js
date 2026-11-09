// ============================================================
// File:        useRail.js
// Path:        client/src/app/useRail.js
// Project:     Seasonal Entertainment
// Description: The sidebar as an icon rail (on a call page, docs/DESIGN.md "Call page"): the
//              menu button expands it until pressed again; with a mouse, pointing at the rail
//              slides the full menu over the page until the pointer leaves; keyboard focus
//              inside opens it too. Touch screens use the button only (no hover there).
//              Leaving the call page (rail false) restores the normal sidebar, and every call
//              page starts collapsed again (fixed 2026-11-09).
// ============================================================

import { useState } from 'react';

const hasMouse = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Returns { expanded, pinned, toggle, events } — events go on the sidebar element.
export function useRail(rail) {
  const [pinned, setPinned] = useState(false); // opened by the menu button
  const [peek, setPeek] = useState(false); // pointed at or focused
  // The sidebar stays mounted between pages (Layout.jsx), and a link clicked in the expanded
  // rail takes the call page away before onMouseLeave or onBlur can fire: so both go back to
  // closed whenever the rail turns on or off, while rendering (no frame shows it open).
  const [railWas, setRailWas] = useState(rail);
  if (railWas !== rail) {
    setRailWas(rail);
    setPinned(false);
    setPeek(false);
  }
  if (!rail) return { expanded: false, pinned: false, toggle: () => {}, events: {} };
  return {
    expanded: pinned || peek,
    pinned,
    toggle: () => setPinned((open) => !open),
    events: {
      onMouseEnter: () => hasMouse() && setPeek(true),
      onMouseLeave: () => setPeek(false),
      onFocus: () => setPeek(true),
      // Only when focus leaves the rail altogether.
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPeek(false);
      },
    },
  };
}
