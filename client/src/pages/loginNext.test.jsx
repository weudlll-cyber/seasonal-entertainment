// ============================================================
// File:        loginNext.test.jsx
// Path:        client/src/pages/loginNext.test.jsx
// Project:     Seasonal Entertainment
// Description: The way back to a game after logging in (docs/AUTH.md, "Seasonal Bingo Royale"):
//              Seasonal Bingo Royale sends a guest who wants to play to
//              /login?next=<its sign-in route, URL-encoded, itself carrying a next>; after the
//              login the browser lands exactly there, and "Register" and "Log in with Discord"
//              carry the same next along (shared/localPath.js decides what is a path here).
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, PRELOGIN, mockApi, withFeatures } from '../test/mockApi.js';

const NEXT = '/games/bingo/auth/website?next=%2Fgames%2Fbingo%2F';
const LOGIN = `/login?next=${encodeURIComponent(NEXT)}`;
const anna = { id: 1, username: 'anna', email: 'anna@example.org', role: 'member' };

// Where the router is now: path and query, as a browser's address bar would show them.
function Where() {
  const { pathname, search } = useLocation();
  return <output aria-label="Location">{`${pathname}${search}`}</output>;
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>
  );

it("the brief's address decodes to the game's sign-in route", () => {
  expect(LOGIN).toBe(
    '/login?next=%2Fgames%2Fbingo%2Fauth%2Fwebsite%3Fnext%3D%252Fgames%252Fbingo%252F'
  );
});

it("after the login the browser lands on the game's sign-in route", async () => {
  mockApi({ ...GUEST, ...PRELOGIN, 'POST /auth/login': { body: { ok: true, user: anna } } });
  renderAt(LOGIN);
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'anna' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText(NEXT, {}, { timeout: 20_000 });
  expect(screen.getByRole('status', { name: 'Location' })).toHaveTextContent(NEXT);
});

it('"Register" and "Log in with Discord" carry the same next along', async () => {
  mockApi(withFeatures(GUEST, { discord: true }));
  renderAt(LOGIN);
  const register = await screen.findByRole('link', { name: 'Register' });
  expect(register).toHaveAttribute('href', `/register?next=${encodeURIComponent(NEXT)}`);
  const discord = screen.getByRole('link', { name: /Discord/ });
  const start = new URL(discord.getAttribute('href'), 'http://site.test');
  expect(start.pathname).toBe('/api/auth/discord/start');
  expect(start.searchParams.get('next')).toBe(NEXT);
});
