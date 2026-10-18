// ============================================================
// File:        LandingPage.test.jsx
// Path:        client/src/pages/LandingPage.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the home page: the greeting (with the username when signed in), the
//              featured game from the games data (a "Coming soon" badge only when the data says
//              so), the next two events from the events data, and the Seasonal Tokens card with
//              the four season marks linking to the info section.
// ============================================================

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
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
const weekly = (id, weekday, timeUtc) => ({
  id,
  title: `Event ${id}`,
  weekday,
  timeUtc,
  rule: 'weekly',
});

function home({ session = GUEST, games = [game()], events = [] } = {}) {
  mockApi({
    ...session,
    'GET /games': { body: { ok: true, games } },
    'GET /events': { body: { ok: true, events } },
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

  it('shows the next two events, soonest first', async () => {
    // One event on every day of the week: the next two are always on consecutive days.
    const events = [1, 2, 3, 4, 5, 6, 7].map((day) => weekly(day, day, '00:00'));
    home({ events });
    const card = screen.getByRole('region', { name: 'Up next' });
    const items = await within(card).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    const day = ((new Date().getUTCDay() + 6) % 7) + 1; // today, Monday = 1
    expect(items[0]).toHaveTextContent(`Event ${(day % 7) + 1}`);
    expect(within(card).getByRole('link', { name: 'All events' })).toHaveAttribute(
      'href',
      '/events'
    );
  });

  it('says so when nothing is planned', async () => {
    home();
    expect(await screen.findByText('No events planned.')).toBeInTheDocument();
  });

  it('shows the four season marks in calendar order, linking to the info section', () => {
    home();
    const card = screen.getByRole('region', { name: 'Seasonal Tokens' });
    const marks = within(within(card).getByRole('list', { name: 'The four seasons' })).getAllByRole(
      'img'
    );
    expect(marks.map((img) => img.getAttribute('alt'))).toEqual([
      'Spring season mark',
      'Summer season mark',
      'Autumn season mark',
      'Winter season mark',
    ]);
    expect(within(card).getByRole('link', { name: 'About Seasonal Tokens' })).toHaveAttribute(
      'href',
      '/info'
    );
  });
});
