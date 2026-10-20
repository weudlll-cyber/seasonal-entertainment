// ============================================================
// File:        callsPage.test.jsx
// Path:        client/src/calls/callsPage.test.jsx
// Project:     Seasonal Entertainment
// Description: /calls and the sidebar's Calls item (docs/CALLS.md): live, upcoming and recent
//              calls; organisers create, start and end calls there (members see no controls);
//              without a call service admins see "not configured" and everyone else no Calls
//              item; the item shows the LIVE badge while a call is live; with nothing live, the
//              page says so on a card ("No call is live right now"); the Calls header and the
//              item's Winter dot.
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GUEST, mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const CALL = (id, title, status, extra = {}) => ({
  id,
  title,
  status,
  description: '',
  createdBy: 'olga',
  chatRoom: `call-${id}`,
  scheduledFor: null,
  startedAt: status === 'live' ? '2026-10-19T18:00:00Z' : null,
  endedAt: status === 'ended' ? '2026-10-18T19:00:00Z' : null,
  ...extra,
});
const LISTS = {
  live: [CALL(1, 'Town hall', 'live')],
  upcoming: [CALL(2, 'Race night', 'scheduled')],
  recent: [CALL(3, 'Launch', 'ended')],
};
const configured = (live, canManage) => ({
  'GET /calls/summary': { body: { ok: true, configured: true, live } },
  'GET /calls': { body: { ok: true, configured: true, canManage, calls: LISTS } },
});

const section = (name) => screen.findByRole('region', { name });
const callsLink = () => screen.findByRole('link', { name: /^Calls/ });

it('with nothing live: the "No call is live right now" card; the Calls header and dot', async () => {
  mockApi({
    ...GUEST,
    'GET /calls/summary': { body: { ok: true, configured: true, live: false } },
    'GET /calls': {
      body: { ok: true, configured: true, canManage: false, calls: { ...LISTS, live: [] } },
    },
  });
  await renderApp('/calls');
  const live = await section('Live now');
  expect(await within(live).findByText('No call is live right now')).toBeInTheDocument();
  expect(within(await section('Upcoming')).queryByText('No call is live right now')).toBeNull();
  // The header shows the play-button quarter beside the title.
  const title = screen.getByRole('heading', { level: 1, name: 'Calls' });
  const mark = title.closest('.page-header').querySelector('.page-header__mark');
  expect(mark).toHaveAttribute('src', '/brand/quarter-calls.webp');
  expect((await callsLink()).querySelector('.nav-item__dot--winter')).not.toBeNull();
});

it('lists live, upcoming and recent calls; members get no controls', async () => {
  mockApi({ ...signedIn({ username: 'mia', role: 'member' }), ...configured(true, false) });
  await renderApp('/calls');
  expect(await within(await section('Live now')).findByText('Town hall')).toBeInTheDocument();
  expect(within(await section('Upcoming')).getByText('Race night')).toBeInTheDocument();
  expect(within(await section('Recent')).getByText('Launch')).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'New call' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^(Start|End|Cancel) / })).toBeNull();
  // The sidebar's item says a call is live (the red badge is its picture).
  expect(await screen.findByRole('link', { name: 'Calls: a call is live' })).toBeInTheDocument();
});

it('organisers create, start and end calls', async () => {
  const calls = mockApi({
    ...signedIn({ username: 'olga', role: 'organiser' }),
    ...configured(false, true),
    'POST /calls': { status: 201, body: { ok: true } },
    'POST /calls/2/start': { body: { ok: true } },
    'POST /calls/1/end': { body: { ok: true } },
  });
  await renderApp('/calls');
  const form = await screen.findByRole('form', { name: 'New call' });
  fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Q&A' } });
  fireEvent.change(within(form).getByLabelText('Planned start (optional)'), {
    target: { value: '2026-10-20T19:30' },
  });
  fireEvent.click(within(form).getByRole('button', { name: 'Create call' }));
  await screen.findByRole('button', { name: 'Start Race night' });
  const created = calls.find((c) => c.key === 'POST /calls');
  expect(created.body).toEqual({
    title: 'Q&A',
    description: '',
    scheduledFor: new Date('2026-10-20T19:30').toISOString(),
  });

  fireEvent.click(screen.getByRole('button', { name: 'Start Race night' }));
  fireEvent.click(screen.getByRole('button', { name: 'End Town hall for everyone' }));
  await screen.findByRole('button', { name: 'Start Race night' });
  const keys = calls.map((c) => c.key);
  expect(keys).toContain('POST /calls/2/start');
  expect(keys).toContain('POST /calls/1/end');
  // Each change reloads the list and the sidebar's summary.
  expect(keys.filter((k) => k === 'GET /calls').length).toBeGreaterThanOrEqual(2);
  expect(keys.filter((k) => k === 'GET /calls/summary').length).toBeGreaterThanOrEqual(2);
});

it('without a call service: "not configured" for admins, no Calls item for others', async () => {
  const off = {
    'GET /calls/summary': { body: { ok: true, configured: false, live: false } },
    'GET /calls': { body: { ok: true, configured: false, canManage: false, calls: {} } },
  };
  mockApi({ ...signedIn({ username: 'ada', role: 'admin' }), ...off });
  const admin = await renderApp('/calls');
  expect(await screen.findByText(/Calls are not configured/)).toBeInTheDocument();
  expect(await callsLink()).toHaveAccessibleName('Calls');
  admin.unmount();

  mockApi({ ...GUEST, ...off });
  await renderApp('/');
  await screen.findByRole('link', { name: /^Chat/ });
  // The summary has answered (configured: false), and still no item.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByRole('link', { name: /^Calls/ })).toBeNull();
});
