// ============================================================
// File:        eventsPage.test.jsx
// Path:        client/src/pages/eventsPage.test.jsx
// Project:     Seasonal Entertainment
// Description: /events shows the event bot's occurrences (docs/BOTS.md) and the site's live and
//              planned calls of the week (as the Calls page answers; a call linking to its page,
//              with the calls quarter), in time order. The bot's occurrences: asked for
//              exactly the visible week, also across the daylight-saving change; each at the
//              local time with its zone and the UTC time beside it; a canceled one struck
//              through and saying so; bot text as text, a link only where the server passed
//              one on; the event's image from this site with its name as alt text, none when the
//              server has none; without the bot a plain "not connected" note.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { SessionProvider } from '../session/SessionContext.jsx';
import { GUEST, mockApi } from '../test/mockApi.js';
import EventsPage from './EventsPage.jsx';

// Monday 19 October 00:00 in Berlin (CEST) to Monday 26 October 00:00 (CET, an hour longer).
const FROM = Date.parse('2026-10-18T22:00:00Z');
const TO = Date.parse('2026-10-25T23:00:00Z');
const NEXT = Date.parse('2026-11-01T23:00:00Z');
const occurrence = (id, name, start, extra = {}) => ({
  id,
  name,
  description: '',
  category: '',
  start: Date.parse(start),
  platform: 'discord',
  locationLabel: '',
  locationUrl: null,
  status: 'scheduled',
  image: null,
  ...extra,
});
const WEEK = [
  occurrence(10, 'Monday Quiz', '2026-10-19T18:00:00Z', {
    locationLabel: 'Quiz channel',
    image: '/media/bot-images/0123456789abcdef0123456789abcdef.webp?v=1',
  }),
  occurrence(11, 'Community <b>Call</b>', '2026-10-22T18:30:00Z', {
    locationLabel: 'Voice',
    locationUrl: 'https://example.org/call',
    description: '<img src=x onerror=alert(1)>',
  }),
  occurrence(12, 'Weekend Stream', '2026-10-24T15:00:00Z', {
    status: 'canceled',
    locationLabel: 'Not a web link',
  }),
];

// answers.calls: the GET /api/calls answer (calls not set up unless given).
function showWeek(answers) {
  const calls = mockApi({
    ...GUEST,
    [`GET /bot-events?from=${FROM}&to=${TO}`]: { body: { ok: true, ...answers.thisWeek } },
    [`GET /bot-events?from=${TO}&to=${NEXT}`]: {
      body: { ok: true, connected: true, ...answers.nextWeek },
    },
    'GET /calls': { body: { ok: true, configured: false, ...answers.calls } },
  });
  render(
    <MemoryRouter>
      <SessionProvider>
        <EventsPage timeZone="Europe/Berlin" now={Date.parse('2026-10-21T12:00:00Z')} />
      </SessionProvider>
    </MemoryRouter>
  );
  return calls;
}

it("shows the site's planned call among the bot's events, in time order", async () => {
  const planned = (id, title, scheduledFor) => ({ id, title, status: 'scheduled', scheduledFor });
  showWeek({
    thisWeek: { connected: true, occurrences: WEEK },
    calls: {
      configured: true,
      calls: {
        live: [],
        // Thursday 20:00 CEST, before the bot's 20:30; the other one is next week.
        upcoming: [
          planned(7, 'Town hall', '2026-10-22T18:00:00Z'),
          planned(8, 'Later', '2026-10-27T18:00:00Z'),
        ],
        recent: [],
      },
    },
  });
  const thursday = await screen.findByRole('region', { name: 'Thursday 22 October' });
  const [call, bot] = within(thursday).getAllByRole('listitem');
  expect(within(call).getByRole('link', { name: 'Town hall' })).toHaveAttribute('href', '/calls/7');
  expect(call.textContent.replace(/\s/g, ' ')).toContain(
    'Community call on this site, Thursday 22 October, 20:00 CEST'
  );
  expect(call.querySelector('img')).toHaveAttribute('src', '/brand/quarter-calls.webp');
  expect(bot).toHaveTextContent('Community <b>Call</b>');
  expect(screen.queryByText('Later')).toBeNull();
});

it('the week at local times with the zone and UTC beside them, across the DST change', async () => {
  showWeek({
    thisWeek: { connected: true, occurrences: WEEK },
    nextWeek: { occurrences: [occurrence(20, 'Monday Quiz', '2026-10-26T18:00:00Z')] },
  });
  const monday = await screen.findByRole('region', { name: 'Monday 19 October' });
  expect(monday).toHaveTextContent('20:00 CEST');
  expect(monday).toHaveTextContent('(18:00 UTC)');
  expect(monday).toHaveTextContent('discord: Quiz channel');
  fireEvent.click(screen.getByRole('button', { name: 'Next week →' }));
  const after = await screen.findByRole('region', { name: 'Monday 26 October' });
  expect(after).toHaveTextContent('19:00 CET');
});

it('a canceled occurrence is struck through and says so', async () => {
  showWeek({ thisWeek: { connected: true, occurrences: WEEK } });
  const saturday = await screen.findByRole('region', { name: 'Saturday 24 October' });
  expect(within(saturday).getByText('Weekend Stream').tagName).toBe('DEL');
  expect(saturday).toHaveTextContent('canceled');
  expect(within(saturday).queryByRole('link')).toBeNull(); // no web link was passed on
});

it('bot text stays text; only a passed-on web link becomes a link, opened safely', async () => {
  showWeek({ thisWeek: { connected: true, occurrences: WEEK } });
  const thursday = await screen.findByRole('region', { name: 'Thursday 22 October' });
  expect(within(thursday).getByText('Community <b>Call</b>')).toBeInTheDocument();
  expect(within(thursday).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(thursday.querySelector('img, b')).toBeNull();
  const link = within(thursday).getByRole('link', { name: 'Open Voice' });
  expect(link).toHaveAttribute('href', 'https://example.org/call');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it("shows the event's image from this site, with the event's name as alt text", async () => {
  showWeek({ thisWeek: { connected: true, occurrences: WEEK } });
  const monday = await screen.findByRole('region', { name: 'Monday 19 October' });
  expect(within(monday).getByRole('img', { name: 'Monday Quiz' })).toHaveAttribute(
    'src',
    '/media/bot-images/0123456789abcdef0123456789abcdef.webp?v=1'
  );
  // An event the server has no image for shows none.
  const thursday = screen.getByRole('region', { name: 'Thursday 22 October' });
  expect(within(thursday).queryByRole('img')).toBeNull();
});

it('asks the bot for the week shown: local Monday to the next local Monday', async () => {
  const calls = showWeek({ thisWeek: { connected: true, occurrences: [] } });
  expect(await screen.findByText('No events this week.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next week →' }));
  await screen.findByText('Week of Monday 26 October');
  // The DST week is 169 hours long; the next one, CET throughout, exactly seven days.
  expect(calls.map((c) => c.key).filter((key) => key.includes('bot-events'))).toEqual([
    `GET /bot-events?from=${FROM}&to=${TO}`,
    `GET /bot-events?from=${TO}&to=${NEXT}`,
  ]);
});

it('without the event bot, says plainly that the calendar is not connected', async () => {
  showWeek({ thisWeek: { connected: false, occurrences: [] } });
  expect(
    await screen.findByText('The event calendar is not connected, so there are no events to show.')
  ).toBeInTheDocument();
  expect(screen.queryByText('No events this week.')).toBeNull();
});
