// ============================================================
// File:        loginNext.test.jsx
// Path:        client/src/pages/loginNext.test.jsx
// Project:     Seasonal Entertainment
// Description: The way back to an embedded game after logging in (docs/AUTH.md, "Embedded
//              games"): Seasonal Bingo Royale and Seasonal Mini Games send a guest who wants to
//              play to /login?next=<its sign-in route, URL-encoded, itself carrying a next>;
//              after the login, the registration and the Discord sign-up the browser loads
//              exactly there with a full page load (session/nextPage.js goToNext: the app has no
//              route for a game's pages), and "Register" and "Log in with Discord" carry the same
//              next along. A path of the app's own, such as /chat, stays inside the app.
// ============================================================

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, PRELOGIN, mockApi, withFeatures } from '../test/mockApi.js';

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

const type = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

// The browser's full page loads (window.location.assign), recorded instead of made.
let assign;
beforeEach(() => {
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

async function logIn(next) {
  mockApi({ ...GUEST, ...PRELOGIN, 'POST /auth/login': { body: { ok: true, user: anna } } });
  renderAt(`/login?next=${encodeURIComponent(next)}`);
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'anna' } });
  type('Password', 'correct-horse-1');
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

it("the brief's address decodes to the game's sign-in route", () => {
  const next = '/games/bingo/auth/website?next=%2Fgames%2Fbingo%2F';
  expect(`/login?next=${encodeURIComponent(next)}`).toBe(
    '/login?next=%2Fgames%2Fbingo%2Fauth%2Fwebsite%3Fnext%3D%252Fgames%252Fbingo%252F'
  );
});

it('after the login a path of the app stays inside the app', async () => {
  await logIn('/chat');
  await screen.findByText('/chat', {}, { timeout: 20_000 });
  expect(assign).not.toHaveBeenCalled();
});

describe.each(['bingo', 'mini-games'])('the way back to /games/%s', (slug) => {
  const NEXT = `/games/${slug}/auth/website?next=%2Fgames%2F${slug}%2F`;
  const loaded = () => expect.poll(() => assign.mock.calls, { timeout: 20_000 });

  it("after the login the browser loads the game's sign-in route", async () => {
    await logIn(NEXT);
    await loaded().toEqual([[NEXT]]);
  });

  it('after the registration too', async () => {
    mockApi({ ...GUEST, 'POST /auth/register': { status: 201, body: { ok: true, user: anna } } });
    renderAt(`/register?next=${encodeURIComponent(NEXT)}`);
    type('Username', 'anna');
    type('Email', 'anna@example.org');
    type('Password', 'correct-horse-1');
    type('Repeat password', 'correct-horse-1');
    fireEvent.click(screen.getByLabelText(/at least 14 years old/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await loaded().toEqual([[NEXT]]);
  });

  it('after the Discord sign-up too', async () => {
    mockApi({
      ...withFeatures(GUEST, { discord: true }),
      'GET /auth/discord/signup': { body: { ok: true, discordName: 'anna', suggested: 'anna' } },
      'POST /auth/discord/register': { status: 201, body: { ok: true, userId: 1 } },
    });
    renderAt(`/register/discord?next=${encodeURIComponent(NEXT)}`);
    await screen.findByLabelText('Username');
    fireEvent.click(screen.getByLabelText(/at least 14 years old/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await loaded().toEqual([[NEXT]]);
  });

  it('"Register" and "Log in with Discord" carry the same next along', async () => {
    mockApi(withFeatures(GUEST, { discord: true }));
    renderAt(`/login?next=${encodeURIComponent(NEXT)}`);
    const register = await screen.findByRole('link', { name: 'Register' });
    expect(register).toHaveAttribute('href', `/register?next=${encodeURIComponent(NEXT)}`);
    const discord = screen.getByRole('link', { name: /Discord/ });
    const start = new URL(discord.getAttribute('href'), 'http://site.test');
    expect(start.pathname).toBe('/api/auth/discord/start');
    expect(start.searchParams.get('next')).toBe(NEXT);
  });
});
