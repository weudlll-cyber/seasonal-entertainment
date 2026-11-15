// ============================================================
// File:        gameResults.test.jsx
// Path:        client/src/profiles/gameResults.test.jsx
// Project:     Seasonal Entertainment
// Description: A member's game results on their profile (GameResults, MemberProfilePage,
//              ProfileSettings; docs/GAME-INTEGRATION.md, "A member's results on their
//              profile"): a card per game with its values, "Last played" and a link into the
//              game, the game's texts as plain text; no "Games" at all without cards or when
//              the request fails, the profile itself unchanged; the account page's "Show my
//              game results" switch, on by default, saves its new state.
// ============================================================

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { formatDate } from '../app/dates.js';
import { FakeSocket } from '../test/fakeSocket.js';
import { mockApi, signedIn } from '../test/mockApi.js';

const ZOE = {
  id: 8,
  username: 'zoe',
  role: 'member',
  memberSince: '2026-03-04T23:30:00.000Z',
  about: '',
  picture: null,
  steps: [],
  canReceive: false,
  own: false,
};
const BINGO = {
  slug: 'bingo',
  name: 'Seasonal Bingo Royale',
  path: '/games/bingo',
  values: [
    { label: 'Played', value: '12' },
    { label: 'Wins', value: '3' },
    { label: '<b>Best</b> place', value: '2' },
  ],
  lastPlayedAt: '2026-11-13T19:00:00.000Z',
};

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

const zoeWith = (gamesAnswer) =>
  mockApi({
    ...signedIn({ id: 1, username: 'mia', role: 'member' }),
    'GET /members/zoe': { body: { ok: true, profile: ZOE } },
    'GET /members/zoe/games': gamesAnswer,
  });

describe('the cards', () => {
  it('one per game: its values, "Last played" and a link into the game', async () => {
    zoeWith({ body: { ok: true, games: [BINGO] } });
    renderAt('/members/zoe');
    const section = await screen.findByRole('region', { name: 'Games' });
    const card = within(section).getByRole('listitem');
    expect(within(card).getByRole('heading', { name: 'Seasonal Bingo Royale' })).toBeVisible();
    expect(within(card).getByText('Played').nextSibling).toHaveTextContent('12');
    expect(within(card).getByText('Wins').nextSibling).toHaveTextContent('3');
    // A game's text is text: no markup is made of it.
    expect(within(card).getByText('<b>Best</b> place')).toBeInTheDocument();
    expect(card.querySelector('b')).toBeNull();
    expect(
      within(card).getByText(`Last played ${formatDate(BINGO.lastPlayedAt)}`)
    ).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open Seasonal Bingo Royale' })).toHaveAttribute(
      'href',
      '/games/bingo'
    );
  });

  it.each([
    ['no game answered', { body: { ok: true, games: [] } }],
    ['the request failed', { status: 500, body: { ok: false, message: 'Server error.' } }],
  ])('%s: no "Games", the profile as always', async (_name, answer) => {
    const calls = zoeWith(answer);
    renderAt('/members/zoe');
    await screen.findByRole('heading', { name: 'zoe', level: 1 });
    await waitFor(() => expect(calls.some((c) => c.key === 'GET /members/zoe/games')).toBe(true));
    expect(screen.queryByRole('region', { name: 'Games' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('"Show my game results"', () => {
  it('is on by default; switching it off saves that', async () => {
    const calls = mockApi({
      ...signedIn({ id: 1, username: 'mia', role: 'member' }),
      'PUT /profile/game-results': { body: { ok: true } },
    });
    renderAt('/account#profile');
    const toggle = await screen.findByRole('switch', { name: 'Show my game results' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(calls.find((c) => c.key === 'PUT /profile/game-results').body).toEqual({ show: false });
  });

  it('shows the saved state: off', async () => {
    mockApi({
      ...signedIn({ id: 1, username: 'mia', role: 'member' }),
      'GET /members/mia': {
        body: {
          ok: true,
          profile: { ...ZOE, id: 1, username: 'mia', own: true, showGameResults: false },
        },
      },
    });
    renderAt('/account#profile');
    const toggle = await screen.findByRole('switch', { name: 'Show my game results' });
    // On until the saved state has arrived.
    await waitFor(() => expect(toggle).not.toBeChecked());
  });
});
