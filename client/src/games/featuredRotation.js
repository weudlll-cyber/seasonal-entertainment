// ============================================================
// File:        featuredRotation.js
// Path:        client/src/games/featuredRotation.js
// Project:     Seasonal Entertainment
// Description: The home page's Featured game box in rotation (docs/DESIGN.md, "Home"; decided
//              2026-11-04): featuredOrder() puts the games with an open sign-up first, ordered by
//              their soonest round, then the rest in the games page's order; useRotation() moves
//              on every ROTATE_MS while there is more than one game, also when no game has an open
//              sign-up. It holds while the mouse is over the box, while it holds keyboard focus (not
//              the focus a click or tap leaves on a control), after a tap inside it until the next
//              tap outside, while the viewer paused it, and always when the browser asks for
//              reduced motion (then only the previous/next buttons move it).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export const ROTATE_MS = 8000;

const soonest = (game) => {
  const start = game.openRounds?.[0]?.startsAt;
  return start ? Date.parse(start) : Infinity;
};

// games: GET /api/games's list, in the games page's order.
export function featuredOrder(games) {
  const open = games.filter((g) => g.openRounds?.length);
  const rest = games.filter((g) => !g.openRounds?.length);
  // A stable sort: games whose soonest round starts at the same time keep the page's order.
  return [...open.sort((a, b) => soonest(a) - soonest(b)), ...rest];
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// count: how many games rotate. Returns the shown index, prev/next/go, the viewer's pause, and
// the props for the box (hover, keyboard focus and tap hold it).
export function useRotation(count) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [paused, setPaused] = useState(false);
  const [still] = useState(reducedMotion);
  const box = useRef(null);
  const go = useCallback((to) => setIndex(((to % count) + count) % count), [count]);
  const holding = hovered || focused || tapped || paused || still;

  // A new list (fewer games) never points past its end.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || holding) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [count, holding, index]);

  // After a tap inside, the next tap outside lets it move again.
  useEffect(() => {
    if (!tapped) return undefined;
    const outside = (e) => {
      if (!box.current?.contains(e.target)) setTapped(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [tapped]);

  // Only keyboard focus holds it: a click leaves the focus on the clicked button, and that focus
  // held the box for good once the pointer had left (the box stopped after any click on next).
  const pressed = useRef(false);
  const boxProps = {
    ref: box,
    onPointerEnter: (e) => e.pointerType === 'mouse' && setHovered(true),
    onPointerLeave: (e) => e.pointerType === 'mouse' && setHovered(false),
    onPointerDown: (e) => {
      pressed.current = true;
      setFocused(false);
      if (e.pointerType !== 'mouse') setTapped(true);
    },
    // A key inside (Tab to the next control, Enter on one) is keyboard use again.
    onKeyDown: () => {
      pressed.current = false;
      setFocused(true);
    },
    onFocus: () => !pressed.current && setFocused(true),
    onBlur: (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      pressed.current = false;
      setFocused(false);
    },
  };
  return {
    index: Math.min(index, Math.max(count - 1, 0)),
    go,
    paused,
    togglePause: () => setPaused((p) => !p),
    reducedMotion: still,
    boxProps,
  };
}
