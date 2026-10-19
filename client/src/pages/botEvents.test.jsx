// ============================================================
// File:        botEvents.test.jsx
// Path:        client/src/pages/botEvents.test.jsx
// Project:     Seasonal Entertainment
// Description: The event bot's occurrences on /events (docs/BOTS.md): asked for exactly the
//              visible week, shown beside the site's own events at local times; an event in
//              both (same name, any case, same minute) once, the bot's version; a canceled one
//              struck through and saying so; bot text as text, a link only where the server
//              passed one on; without the bot a plain "not connected" note.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { mockApi } from '../test/mockApi.js';
import EventsPage from './EventsPage.jsx';

const SITE = [
  {
    id: 1,
    title: 'Friday Battles',
    rule: 'weekly',
    weekday: 5,
    timeUtc: '20:00',
    channel: 'Site channel',
    description: '',
    link: '',
  },
  {
    id: 2,
    title: 'Monday Quiz',
    rule: 'weekly',
    weekday: 1,
    timeUtc: '18:00',
    channel: '',
    description: '',
    link: '',
  },
];
// Monday 19 October 00:00 in Berlin (CEST) to Monday 26 October 00:00 (CET, an hour longer).
const FROM = Date.parse('2026-10-18T22:00:00Z');
const TO = Date.parse('2026-10-25T23:00:00Z');
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
  ...extra,
});
const BOT = [
  // The site's Friday event as the bot has it: shown once, this version.
  occurrence(10, '  friday BATTLES ', '2026-10-23T20:00:00Z', { locationLabel: 'Bot channel' }),
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

function showWeek(bot) {
  const calls = mockApi({
    'GET /events': { body: { ok: true, events: SITE } },
    [`GET /bot-events?from=${FROM}&to=${TO}`]: { body: { ok: true, ...bot } },
  });
  render(<EventsPage timeZone="Europe/Berlin" now={Date.parse('2026-10-21T12:00:00Z')} />);
  return calls;
}

it('shows the bot week beside the site events; the same event once, the bot version', async () => {
  showWeek({ connected: true, occurrences: BOT });
  const friday = await screen.findByRole('region', { name: 'Friday 23 October' });
  expect(within(friday).getAllByRole('listitem')).toHaveLength(1);
  expect(friday).toHaveTextContent('friday BATTLES');
  expect(friday).toHaveTextContent('discord: Bot channel');
  expect(friday).not.toHaveTextContent('Site channel');
  const thursday = screen.getByRole('region', { name: 'Thursday 22 October' });
  expect(thursday).toHaveTextContent('20:30 CEST'); // 18:30 UTC, local time first
  expect(thursday).toHaveTextContent('(18:30 UTC)');
  // The site's own events stay.
  expect(screen.getByRole('region', { name: 'Monday 19 October' })).toHaveTextContent(
    'Monday Quiz'
  );
});

it('a canceled occurrence is struck through and says so', async () => {
  showWeek({ connected: true, occurrences: BOT });
  const saturday = await screen.findByRole('region', { name: 'Saturday 24 October' });
  expect(within(saturday).getByText('Weekend Stream').tagName).toBe('DEL');
  expect(saturday).toHaveTextContent('canceled');
  expect(within(saturday).queryByRole('link')).toBeNull(); // no web link was passed on
});

it('bot text stays text; only a passed-on web link becomes a link, opened safely', async () => {
  showWeek({ connected: true, occurrences: BOT });
  const thursday = await screen.findByRole('region', { name: 'Thursday 22 October' });
  expect(within(thursday).getByText('Community <b>Call</b>')).toBeInTheDocument();
  expect(within(thursday).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(thursday.querySelector('img, b')).toBeNull();
  const link = within(thursday).getByRole('link', { name: 'Open Voice' });
  expect(link).toHaveAttribute('href', 'https://example.org/call');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('asks the bot for the week shown, also after changing weeks', async () => {
  const calls = showWeek({ connected: true, occurrences: [] });
  await screen.findByRole('region', { name: 'Monday 19 October' });
  expect(calls.map((c) => c.key)).toContain(`GET /bot-events?from=${FROM}&to=${TO}`);
  fireEvent.click(screen.getByRole('button', { name: 'Next week →' }));
  await screen.findByRole('region', { name: 'Monday 26 October' });
  // The next week in Berlin: CET throughout, exactly seven days.
  const next = Date.parse('2026-11-01T23:00:00Z');
  expect(calls.map((c) => c.key)).toContain(`GET /bot-events?from=${TO}&to=${next}`);
});

it('without the bot, says plainly that its calendar is not connected', async () => {
  showWeek({ connected: false, occurrences: [] });
  expect(
    await screen.findByText(
      "The event bot's calendar is not connected; only the site's own events are shown."
    )
  ).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Friday 23 October' })).toHaveTextContent(
    'Friday Battles'
  );
});
