// ============================================================
// File:        gamesPages.test.jsx
// Path:        client/src/pages/gamesPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the games screens: cards show their status and only available games
//              get a Play link; the admin form sends the chosen fields.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

const card = (name) => screen.getByRole('heading', { name }).closest('li');

describe('games page', () => {
  it('links only available games; others show their status', async () => {
    mockApi({
      ...GUEST,
      'GET /games': {
        body: {
          ok: true,
          games: [
            {
              id: 1,
              name: 'Seasonal Race',
              description: 'Race',
              image: 'seasonal-tokens',
              status: 'coming_soon',
              path: '/games/race',
              visibility: 'everyone',
            },
            {
              id: 2,
              name: 'Quiz',
              description: 'Quiz',
              image: 'spring',
              status: 'available',
              path: '/games/quiz',
              visibility: 'everyone',
            },
            {
              id: 3,
              name: 'Duel',
              description: 'Duel',
              image: 'winter',
              status: 'maintenance',
              path: '/games/duel',
              visibility: 'everyone',
            },
          ],
        },
      },
    });
    renderAt('/games');
    await screen.findByRole('heading', { name: 'Seasonal Race' });
    expect(within(card('Seasonal Race')).getByText('Coming soon')).toBeInTheDocument();
    expect(within(card('Seasonal Race')).queryByRole('link')).toBeNull();
    expect(within(card('Quiz')).getByRole('link', { name: 'Play Quiz' })).toHaveAttribute(
      'href',
      '/games/quiz'
    );
    expect(within(card('Duel')).getByText('Maintenance')).toBeInTheDocument();
    expect(within(card('Duel')).queryByRole('link')).toBeNull();
  });
});

describe('admin games', () => {
  it('adds a game with the chosen fields', async () => {
    const calls = mockApi({
      ...signedIn({ id: 1, username: 'ada', role: 'admin' }),
      'GET /admin/games': { body: { ok: true, games: [] } },
      'POST /admin/games': { status: 201, body: { ok: true, game: { id: 5 } } },
    });
    renderAt('/admin/games');
    fireEvent.click(await screen.findByRole('button', { name: 'Add game' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Quiz' } });
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: '/games/quiz' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'available' } });
    fireEvent.change(screen.getByLabelText('Who sees it'), { target: { value: 'members' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
    await screen.findByRole('button', { name: 'Add game' });
    expect(calls.find((c) => c.key === 'POST /admin/games').body).toEqual({
      name: 'Quiz',
      description: '',
      image: 'seasonal-tokens',
      status: 'available',
      path: '/games/quiz',
      visibility: 'members',
    });
  });
});
