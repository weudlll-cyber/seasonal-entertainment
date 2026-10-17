// ============================================================
// File:        eventsPages.test.jsx
// Path:        client/src/pages/eventsPages.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the events screens: local times with zone labels across the October
//              daylight-saving change, the first-Thursday event only in its week, and the
//              admin editor (add, deactivate, delete only after confirming).
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { mockApi, signedIn } from '../test/mockApi.js';
import EventsPage from './EventsPage.jsx';

const EVENTS = [
  {
    id: 1,
    title: 'Seasonal Mind Games',
    rule: 'weekly',
    weekday: 1,
    timeUtc: '18:00',
    channel: 'Telegram',
    description: '',
    link: '',
  },
  {
    id: 2,
    title: 'Guess the Number',
    rule: 'monthly_first',
    weekday: 4,
    timeUtc: '19:00',
    channel: 'Discord',
    description: '',
    link: '',
  },
];

const showEvents = (now) => {
  mockApi({ 'GET /events': { body: { ok: true, events: EVENTS } } });
  render(<EventsPage timeZone="Europe/Berlin" now={Date.parse(now)} />);
};

describe('events page', () => {
  it('shows local times with the zone, and the hour moves with daylight saving', async () => {
    showEvents('2026-10-21T12:00:00Z');
    const monday = await screen.findByRole('region', { name: 'Monday 19 October' });
    expect(monday).toHaveTextContent('20:00 CEST');
    expect(monday).toHaveTextContent('(18:00 UTC)');
    fireEvent.click(screen.getByRole('button', { name: 'Next week →' }));
    const after = await screen.findByRole('region', { name: 'Monday 26 October' });
    expect(after).toHaveTextContent('19:00 CET');
  });

  it('lists the first-Thursday event only in the week of the first Thursday', async () => {
    showEvents('2026-10-01T12:00:00Z');
    const thursday = await screen.findByRole('region', { name: 'Thursday 1 October' });
    expect(within(thursday).getByText('Guess the Number')).toBeInTheDocument();
    expect(thursday).toHaveTextContent('first Thursday of each month');
    fireEvent.click(screen.getByRole('button', { name: 'Next week →' }));
    await screen.findByRole('region', { name: 'Monday 5 October' });
    expect(screen.queryByText('Guess the Number')).toBeNull();
  });
});

describe('admin events', () => {
  const admin = signedIn({ id: 1, username: 'ada', role: 'admin' });
  const renderAdmin = () =>
    render(
      <MemoryRouter initialEntries={['/admin/events']}>
        <App />
      </MemoryRouter>
    );

  it('adds an event with the entered fields', async () => {
    const calls = mockApi({
      ...admin,
      'GET /admin/events': { body: { ok: true, events: [] } },
      'POST /admin/events': { status: 201, body: { ok: true, event: { id: 9 } } },
    });
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Quiz night' } });
    fireEvent.change(screen.getByLabelText('Weekday'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Time (UTC)'), { target: { value: '20:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
    await screen.findByRole('button', { name: 'Add event' });
    expect(calls.find((c) => c.key === 'POST /admin/events').body).toMatchObject({
      title: 'Quiz night',
      weekday: 5,
      timeUtc: '20:30',
      rule: 'weekly',
      active: true,
    });
  });

  it('deactivates, and deletes only after confirming', async () => {
    const calls = mockApi({
      ...admin,
      'GET /admin/events': {
        body: { ok: true, events: [{ ...EVENTS[0], active: true, durationMinutes: null }] },
      },
      'PUT /admin/events/1': { body: { ok: true } },
      'DELETE /admin/events/1': { body: { ok: true } },
    });
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await screen.findByRole('button', { name: 'Delete' });
    expect(calls.find((c) => c.key === 'PUT /admin/events/1').body.active).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(calls.some((c) => c.key === 'DELETE /admin/events/1')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Really delete/ }));
    await screen.findByRole('button', { name: 'Delete' });
    expect(calls.some((c) => c.key === 'DELETE /admin/events/1')).toBe(true);
  });
});
