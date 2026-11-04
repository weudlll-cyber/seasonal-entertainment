// ============================================================
// File:        gamesPages.test.jsx
// Path:        client/src/pages/gamesPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the games screens: cards show their status and only available games
//              get a Play link, each card gets its band colour; a card with an open sign-up shows
//              it (the soonest start, Join), others nothing; in development the fake game's Join
//              and Play lead to the local placeholder page; the admin form sends the chosen
//              fields, the sign-up status URL among them.
// ============================================================

import { DEV_TEST_GAME } from '@seasonal-entertainment/shared/gameRules.js';
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
    // Band colours (gameBand.test.js has every position): the logo on neutral, the spring
    // image moved off its own spring position, winter keeps the summer turn.
    const band = (name) => card(name).querySelector('.game-card__band').className;
    expect(band('Seasonal Race')).toContain('game-card__band--neutral');
    expect(band('Quiz')).toContain('game-card__band--summer');
    expect(band('Duel')).toContain('game-card__band--summer');
  });
});

describe('open sign-ups on the games page', () => {
  it('a card with open rounds: "Sign-up open", the soonest start and Join; others nothing', async () => {
    const round = (id, title, startsAt) => ({
      id,
      title,
      kind: 'Seasonal Bingo Royale',
      startsAt,
      signupClosesAt: null,
      players: 4,
      maxPlayers: 50,
      joinUrl: `https://bingo.example/rounds/${id}`,
    });
    const game = (id, name, openRounds) => ({
      id,
      name,
      description: name,
      image: 'spring',
      status: 'available',
      path: `/games/${name.toLowerCase()}`,
      visibility: 'everyone',
      openRounds,
    });
    mockApi({
      ...GUEST,
      'GET /games': {
        body: {
          ok: true,
          games: [
            game(1, 'Bingo', [
              round('r1', 'Friday Royale', '2026-11-06T19:00:00Z'),
              round('r2', 'Later', '2026-11-07T19:00:00Z'),
            ]),
            game(2, 'Quiz', []),
          ],
        },
      },
    });
    renderAt('/games');
    await screen.findByRole('heading', { name: 'Bingo' });
    const bingo = within(card('Bingo'));
    expect(bingo.getByText('Sign-up open')).toBeInTheDocument();
    expect(bingo.getByText(/\+1 more$/)).toBeInTheDocument();
    expect(bingo.getByText(/^Starts /)).toHaveTextContent(/6 November/);
    expect(bingo.getByRole('link', { name: 'Join Friday Royale' })).toHaveAttribute(
      'href',
      'https://bingo.example/rounds/r1'
    );
    expect(within(card('Quiz')).queryByText('Sign-up open')).toBeNull();
  });
});

describe('the fake game in development (npm run dev:game-status)', () => {
  it('its Join and its Play lead to the local placeholder page, which the dev build routes', async () => {
    mockApi({
      ...GUEST,
      'GET /games': {
        body: {
          ok: true,
          games: [
            {
              id: 9,
              name: 'Open rounds test',
              description: 'Test',
              image: 'summer',
              status: 'available',
              path: DEV_TEST_GAME.path,
              visibility: 'everyone',
              openRounds: [
                {
                  id: 'friday',
                  title: 'Friday Royale',
                  kind: 'Seasonal Bingo Royale',
                  startsAt: '2026-11-06T19:00:00Z',
                  signupClosesAt: null,
                  players: 4,
                  maxPlayers: 50,
                  joinUrl: `https://${DEV_TEST_GAME.statusHost}/rounds/friday`,
                },
              ],
            },
          ],
        },
      },
    });
    renderAt('/games');
    await screen.findByRole('heading', { name: 'Open rounds test' });
    const test = within(card('Open rounds test'));
    expect(test.getByRole('link', { name: 'Join Friday Royale' })).toHaveAttribute(
      'href',
      DEV_TEST_GAME.path
    );
    fireEvent.click(test.getByRole('link', { name: 'Play Open rounds test' }));
    expect(await screen.findByText('Test game — the sign-up would open here.')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Sign-up status URL (optional)'), {
      target: { value: 'https://quiz.example/open-rounds' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }));
    await screen.findByRole('button', { name: 'Add game' });
    expect(calls.find((c) => c.key === 'POST /admin/games').body).toEqual({
      name: 'Quiz',
      description: '',
      image: 'seasonal-tokens',
      status: 'available',
      path: '/games/quiz',
      visibility: 'members',
      statusUrl: 'https://quiz.example/open-rounds',
    });
  });
});
