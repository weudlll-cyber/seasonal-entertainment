// ============================================================
// File:        LandingPage.test.jsx
// Path:        client/src/pages/LandingPage.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the home page: the greeting (with the username when signed in), the
//              featured game from the games data (a "Coming soon" badge only when the data says
//              so), the event bot's next two occurrences that still take place (or "not
//              connected"), merged in time order with the site's live and planned calls (the
//              Calls page's answer, never an ended call; each linking to its page, a live one
//              "Live now"), the Next call box only with a live or planned call, the four season
//              tiles in calendar order with their marks, and the Community box leading to the
//              chat. Prices themselves: prices.test.jsx.
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
  calls = { configured: false },
} = {}) {
  const sent = mockApi({
    ...session,
    'GET /games': { body: { ok: true, games } },
    [UP_NEXT]: { body: { ok: true, ...bot } },
    'GET /calls': { body: { ok: true, reminders: [], ...calls } },
  });
  render(
    <MemoryRouter>
      <SessionProvider>
        <LandingPage timeZone="UTC" />
      </SessionProvider>
    </MemoryRouter>
  );
  return sent;
}
// A GET /api/calls answer with calls set up; call(): one call of its lists.
const configured = (lists) => ({
  configured: true,
  calls: { live: [], upcoming: [], recent: [], ...lists },
});
const call = (id, title, status, times = {}) => ({
  id,
  title,
  status,
  scheduledFor: null,
  ...times,
});
const upNextItems = async () =>
  (await within(screen.getByRole('region', { name: 'Up next' })).findAllByRole('listitem')).map(
    (i) => i.textContent.replace(/\s/g, ' ')
  );

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

describe('home: site calls', () => {
  it("Up next merges the site's planned call with the bot's events in time order", async () => {
    const planned = call(7, 'Town hall', 'scheduled', { scheduledFor: '2026-10-22T18:30:00Z' });
    home({
      bot: {
        connected: true,
        occurrences: [occurrence(3, '2026-10-22T09:00:00Z'), occurrence(4, '2026-10-23T09:00:00Z')],
      },
      calls: configured({ upcoming: [planned] }),
    });
    expect(await upNextItems()).toEqual([
      'Event 3Thursday 22 October, 09:00 UTC',
      'Town hallThursday 22 October, 18:30 UTC',
    ]);
    const card = screen.getByRole('region', { name: 'Up next' });
    const link = within(card).getByRole('link', { name: 'Town hall' });
    expect(link).toHaveAttribute('href', '/calls/7');
    expect(link).toHaveAttribute('title', 'Town hall'); // the whole title, however it is cut
    // The calls quarter is the call's picture.
    const picture = within(card).getAllByRole('listitem')[1].querySelector('img');
    expect(picture).toHaveAttribute('src', '/brand/quarter-calls.webp');
  });

  it("a guest sees just the live and planned calls of the Calls page's answer", async () => {
    const sent = home({
      bot: { connected: true, occurrences: [occurrence(3, '2026-10-24T09:00:00Z')] },
      calls: configured({
        live: [call(1, 'On air', 'live', { startedAt: '2026-10-21T12:00:00Z' })],
        upcoming: [call(2, 'No time yet', 'scheduled')],
        recent: [call(3, 'Ended call', 'ended', { endedAt: '2026-10-21T11:00:00Z' })],
      }),
    });
    expect(await upNextItems()).toEqual([
      'On airLive now',
      'Event 3Saturday 24 October, 09:00 UTC',
    ]);
    // From the Calls page's own request, as a guest: no second way to the calls.
    expect(sent.map((c) => c.key).filter((k) => k.includes('calls'))).toEqual(['GET /calls']);
    expect(screen.queryByText('Ended call')).toBeNull();
  });

  it("calls not set up: Up next shows the bot's events only, and no Next call box", async () => {
    home({ bot: { connected: true, occurrences: [occurrence(3, '2026-10-22T09:00:00Z')] } });
    expect(await upNextItems()).toEqual(['Event 3Thursday 22 October, 09:00 UTC']);
    expect(screen.queryByRole('region', { name: 'Next call' })).toBeNull();
  });

  it('the Next call box only with a live or planned call', async () => {
    home({ calls: configured({ recent: [call(3, 'Ended call', 'ended')] }) });
    await screen.findByText('No events in the next seven days.');
    expect(screen.queryByRole('region', { name: 'Next call' })).toBeNull();
    home({ calls: configured({ upcoming: [call(2, 'Q&A', 'scheduled')] }) });
    expect(await screen.findByRole('region', { name: 'Next call' })).toHaveTextContent('Q&A');
  });
});

describe('home: calls linked to bot events', () => {
  const linked = (id, status, occurrenceStart, times) =>
    call(id, 'Town hall', status, {
      botOccurrenceId: 3,
      botOccurrenceStart: Date.parse(occurrenceStart),
      ...times,
    });

  it('the linked event offers "Listen on this site"; the call is not listed twice', async () => {
    home({
      bot: { connected: true, occurrences: [occurrence(3, '2026-10-22T09:00:00Z')] },
      calls: configured({
        upcoming: [
          linked(7, 'scheduled', '2026-10-22T09:00:00Z', { scheduledFor: '2026-10-22T09:00:00Z' }),
        ],
      }),
    });
    expect(await upNextItems()).toEqual([
      'Event 3Thursday 22 October, 09:00 UTC · Listen on this site',
    ]);
    expect(screen.getByRole('link', { name: 'Listen on this site' })).toHaveAttribute(
      'href',
      '/calls/7'
    );
  });

  it('while the linked call is live, the event says "Live now"', async () => {
    home({
      bot: { connected: true, occurrences: [occurrence(3, '2026-10-22T09:00:00Z')] },
      calls: configured({
        live: [linked(7, 'live', '2026-10-22T09:00:00Z', { startedAt: '2026-10-21T12:30:00Z' })],
      }),
    });
    expect(await upNextItems()).toEqual(['Event 3Live now · Listen on this site']);
  });

  it('an event that moved loses its call: the call is listed as itself', async () => {
    home({
      bot: { connected: true, occurrences: [occurrence(3, '2026-10-22T11:00:00Z')] },
      calls: configured({
        upcoming: [
          linked(7, 'scheduled', '2026-10-22T09:00:00Z', { scheduledFor: '2026-10-22T09:00:00Z' }),
        ],
      }),
    });
    expect(await upNextItems()).toEqual([
      'Town hallThursday 22 October, 09:00 UTC',
      'Event 3Thursday 22 October, 11:00 UTC',
    ]);
    expect(screen.queryByRole('link', { name: 'Listen on this site' })).toBeNull();
  });

  it('a guest sees "Listen on this site" only for calls the Calls page shows them', async () => {
    // An ended call is in the guest's answer only under "recent", never as live or planned.
    home({
      bot: { connected: true, occurrences: [occurrence(3, '2026-10-22T09:00:00Z')] },
      calls: configured({ recent: [linked(7, 'ended', '2026-10-22T09:00:00Z')] }),
    });
    expect(await upNextItems()).toEqual(['Event 3Thursday 22 October, 09:00 UTC']);
  });
});
