// ============================================================
// File:        featuredGames.test.jsx
// Path:        client/src/pages/featuredGames.test.jsx
// Project:     Seasonal Entertainment
// Description: The home page's Featured game box in rotation (homeCards.jsx,
//              games/featuredRotation.js; docs/OPEN-ROUNDS.md, decided 2026-11-04), with fake
//              timers: games with an open sign-up first, by their soonest round, then the rest in
//              the page's order; 8 s each, also without any open sign-up; it holds while hovered,
//              while it has keyboard focus (a mouse click on a control does not hold it once the
//              pointer left), after a tap until a tap outside, and while paused with its button; with reduced motion it never moves by itself (previous/next still do, no
//              pause button); one game: no rotation, no controls. A game's open sign-up shows its
//              soonest round (title, start, players, Join, "+N more"); the slide is not announced.
// ============================================================

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ROTATE_MS } from '../games/featuredRotation.js';
import { FeaturedGameCard } from './homeCards.jsx';

const round = (id, title, startsAt, players = 12) => ({
  id,
  title,
  kind: 'Seasonal Bingo Royale',
  startsAt,
  signupClosesAt: null,
  players,
  maxPlayers: 50,
  joinUrl: `https://bingo.example/rounds/${id}`,
});
const game = (id, name, openRounds = []) => ({
  id,
  name,
  description: `${name} description`,
  image: 'spring',
  status: 'available',
  path: `/games/g${id}`,
  visibility: 'everyone',
  openRounds,
});
// In the games page's order: Race first, but Bingo's round is sooner than Quiz's.
const GAMES = [
  game(1, 'Race'),
  game(2, 'Quiz', [round('q1', 'Quiz night', '2026-11-08T19:00:00Z')]),
  game(3, 'Bingo', [
    round('b1', 'Friday Royale', '2026-11-06T19:00:00Z'),
    round('b2', 'Saturday Royale', '2026-11-07T19:00:00Z'),
  ]),
];

let reduced;
beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const show = (games = GAMES) =>
  render(
    <MemoryRouter>
      <FeaturedGameCard games={games} timeZone="UTC" />
    </MemoryRouter>
  );
const box = () => screen.getByRole('region', { name: 'Featured game' });
const shown = () => within(box()).getByRole('heading', { level: 2 }).textContent;
const wait = (ms) => act(() => vi.advanceTimersByTime(ms));

it('open sign-ups first, by the soonest round, then the rest; 8 s each, round and round', () => {
  show();
  expect(shown()).toBe('Bingo');
  wait(ROTATE_MS - 1);
  expect(shown()).toBe('Bingo');
  wait(1);
  expect(shown()).toBe('Quiz');
  wait(ROTATE_MS);
  expect(shown()).toBe('Race');
  wait(ROTATE_MS);
  expect(shown()).toBe('Bingo');
});

it('rotates also when no game has an open sign-up', () => {
  show([game(1, 'Race'), game(2, 'Quiz')]);
  expect(shown()).toBe('Race');
  wait(ROTATE_MS);
  expect(shown()).toBe('Quiz');
});

it('the soonest round: title, start, players, Join and "+N more"; not announced', () => {
  show();
  const slide = within(box());
  expect(slide.getByText('Sign-up open')).toBeInTheDocument();
  expect(slide.getByText('Friday Royale')).toBeInTheDocument();
  expect(slide.getByText(/^Starts .*6 November.* · 12 \/ 50 players$/)).toBeInTheDocument();
  expect(slide.getByText(/\+1 more$/)).toBeInTheDocument();
  expect(slide.getByRole('link', { name: 'Join Friday Royale' })).toHaveAttribute(
    'href',
    'https://bingo.example/rounds/b1'
  );
  expect(box().querySelector('.home__game-slide')).toHaveAttribute('aria-live', 'off');
});

it('holds while hovered, while keyboard-focused, and after a tap until a tap outside', () => {
  show();
  fireEvent.pointerEnter(box(), { pointerType: 'mouse' });
  wait(3 * ROTATE_MS);
  expect(shown()).toBe('Bingo');
  fireEvent.pointerLeave(box(), { pointerType: 'mouse' });
  wait(ROTATE_MS);
  expect(shown()).toBe('Quiz');

  const next = screen.getByRole('button', { name: 'Next game' });
  act(() => next.focus());
  wait(3 * ROTATE_MS);
  expect(shown()).toBe('Quiz');
  act(() => next.blur());
  wait(ROTATE_MS);
  expect(shown()).toBe('Race');

  fireEvent.pointerDown(box(), { pointerType: 'touch' });
  wait(3 * ROTATE_MS);
  expect(shown()).toBe('Race');
  fireEvent.pointerDown(document.body, { pointerType: 'touch' });
  wait(ROTATE_MS);
  expect(shown()).toBe('Bingo');
});

it('a mouse click on next does not hold it once the pointer left; a key inside holds it again', () => {
  show();
  const next = screen.getByRole('button', { name: 'Next game' });
  // A real click: pointer in, pressed, the focus lands on the button, released, pointer out.
  fireEvent.pointerEnter(box(), { pointerType: 'mouse' });
  fireEvent.pointerDown(next, { pointerType: 'mouse' });
  act(() => next.focus());
  fireEvent.click(next);
  fireEvent.pointerLeave(box(), { pointerType: 'mouse' });
  expect(shown()).toBe('Quiz');
  expect(document.activeElement).toBe(next);
  wait(ROTATE_MS);
  expect(shown()).toBe('Race');

  // Tab on from the clicked button: keyboard focus, which holds.
  fireEvent.keyDown(next, { key: 'Tab' });
  act(() => screen.getByRole('button', { name: 'Pause rotation' }).focus());
  wait(3 * ROTATE_MS);
  expect(shown()).toBe('Race');
});

it('the pause button holds it until pressed again; previous, next and the dots move it', () => {
  show();
  const pause = screen.getByRole('button', { name: 'Pause rotation' });
  fireEvent.click(pause);
  // Clicking moves the focus there; it leaves so only the pause holds it.
  act(() => document.activeElement.blur());
  expect(screen.getByRole('button', { name: 'Resume rotation' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  wait(3 * ROTATE_MS);
  expect(shown()).toBe('Bingo');
  fireEvent.click(screen.getByRole('button', { name: 'Next game' }));
  expect(shown()).toBe('Quiz');
  fireEvent.click(screen.getByRole('button', { name: 'Previous game' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous game' }));
  expect(shown()).toBe('Race');
  fireEvent.click(screen.getByRole('button', { name: 'Show Quiz' }));
  expect(shown()).toBe('Quiz');
  expect(screen.getByRole('button', { name: 'Show Quiz' })).toHaveAttribute('aria-current', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Resume rotation' }));
  act(() => document.activeElement.blur());
  wait(ROTATE_MS);
  expect(shown()).toBe('Race');
});

it('with reduced motion: never by itself, no pause button; previous and next still work', () => {
  reduced = true;
  show();
  wait(5 * ROTATE_MS);
  expect(shown()).toBe('Bingo');
  expect(screen.queryByRole('button', { name: /rotation/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next game' }));
  expect(shown()).toBe('Quiz');
});

it('one game: no rotation and no controls', () => {
  show([game(1, 'Race')]);
  wait(3 * ROTATE_MS);
  expect(shown()).toBe('Race');
  expect(screen.queryByRole('group', { name: 'Featured games' })).toBeNull();
});
