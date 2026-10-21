// ============================================================
// File:        LandingPage.test.jsx
// Path:        client/src/pages/LandingPage.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the home page: the greeting (with the username when signed in), the
//              featured game from the games data (a "Coming soon" badge only when the data says
//              so), the event bot's next two occurrences that still take place (or "not
//              connected"), the four season tiles in calendar order with their marks, and the
//              Community box leading to the chat. Prices themselves: prices.test.jsx.
// ============================================================

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../session/SessionContext.jsx';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import LandingPage from './LandingPage.jsx';

const game = (overrides) => ({
  id: 1,
  name: 'Seasonal Race',
  description: 'Race the seasons.',
  image: 'seasonal-tokens',
  status: 'coming_soon',
  path: '/games/race',
  ...overrides,
});
// Wednesday 21 October 12:34 UTC; the home page asks from the full hour, for seven days.
const NOW = Date.parse('2026-10-21T12:34:00Z');
const FROM = Date.parse('2026-10-21T12:00:00Z');
const UP_NEXT = `GET /bot-events?from=${FROM}&to=${FROM + 7 * 24 * 60 * 60_000}`;
const occurrence = (id, start, status = 'scheduled') => ({
  id,
  name: `Event ${id}`,
  start: Date.parse(start),
  status,
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function home({
  session = GUEST,
  games = [game()],
  bot = { connected: true, occurrences: [] },
} = {}) {
  mockApi({
    ...session,
    'GET /games': { body: { ok: true, games } },
    [UP_NEXT]: { body: { ok: true, ...bot } },
  });
  render(
    <MemoryRouter>
      <SessionProvider>
        <LandingPage timeZone="UTC" />
      </SessionProvider>
    </MemoryRouter>
  );
}

describe('home', () => {
  it('greets guests generally and members by name', async () => {
    home();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Welcome to Seasonal Entertainment'
    );
    home({ session: signedIn({ id: 2, username: 'mia', role: 'member' }) });
    expect(await screen.findByRole('heading', { name: 'Welcome back, mia' })).toBeInTheDocument();
  });

  it('features the first game; the badge only when it is coming soon', async () => {
    home({ games: [game(), game({ id: 2, name: 'Other' })] });
    const card = screen.getByRole('region', { name: 'Featured game' });
    expect(await within(card).findByRole('heading', { name: 'Seasonal Race' })).toBeInTheDocument();
    expect(within(card).getByText('Coming soon')).toBeInTheDocument();
    expect(within(card).queryByText('Other')).toBeNull();
  });

  it('an available game gets a Play link and no badge', async () => {
    home({ games: [game({ status: 'available' })] });
    const card = screen.getByRole('region', { name: 'Featured game' });
    expect(await within(card).findByRole('link', { name: 'Play Seasonal Race' })).toHaveAttribute(
      'href',
      '/games/race'
    );
    expect(within(card).queryByText('Coming soon')).toBeNull();
  });

  it("shows the bot's next two occurrences that still take place, soonest first", async () => {
    const occurrences = [
      occurrence(1, '2026-10-21T12:00:00Z'), // started before now
      occurrence(2, '2026-10-21T18:00:00Z', 'canceled'),
      { ...occurrence(3, '2026-10-22T09:00:00Z'), image: '/media/bot-images/a.webp?v=1' },
      occurrence(4, '2026-10-23T09:00:00Z'),
      occurrence(5, '2026-10-24T09:00:00Z'),
    ];
    home({ bot: { connected: true, occurrences } });
    const card = screen.getByRole('region', { name: 'Up next' });
    const items = await within(card).findAllByRole('listitem');
    expect(items.map((i) => i.textContent.replace(/\s/g, ' '))).toEqual([
      'Event 3Thursday 22 October, 09:00 UTC',
      'Event 4Friday 23 October, 09:00 UTC',
    ]);
    // The event's image, small, with its name as alt text; none where the server has none.
    expect(within(items[0]).getByRole('img', { name: 'Event 3' })).toHaveAttribute(
      'src',
      '/media/bot-images/a.webp?v=1'
    );
    expect(within(items[1]).queryByRole('img')).toBeNull();
    expect(within(card).getByRole('link', { name: 'All events' })).toHaveAttribute(
      'href',
      '/events'
    );
  });

  it('says so when nothing is planned in the next seven days', async () => {
    home();
    expect(await screen.findByText('No events in the next seven days.')).toBeInTheDocument();
  });

  it('without the event bot: says the calendar is not connected', async () => {
    home({ bot: { connected: false, occurrences: [] } });
    expect(await screen.findByText('The event calendar is not connected.')).toBeInTheDocument();
  });

  it('shows the four season tiles in calendar order, each with its mark', () => {
    home();
    const card = screen.getByRole('region', { name: 'Seasonal Tokens' });
    const tiles = within(card).getAllByRole('listitem');
    expect(tiles.map((tile) => tile.className)).toEqual(
      ['spring', 'summer', 'autumn', 'winter'].map((id) => `price-tile price-tile--${id}`)
    );
    expect(tiles.map((tile) => tile.querySelector('.price-tile__mark img').src)).toEqual(
      ['spring', 'summer', 'autumn', 'winter'].map((id) => expect.stringContaining(id))
    );
  });

  it('the Community box leads to the chat', () => {
    home();
    const card = screen.getByRole('region', { name: 'Community' });
    expect(within(card).getByRole('link', { name: 'Open the chat' })).toHaveAttribute(
      'href',
      '/chat'
    );
  });
});
