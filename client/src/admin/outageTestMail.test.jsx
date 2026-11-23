// ============================================================
// File:        outageTestMail.test.jsx
// Path:        client/src/admin/outageTestMail.test.jsx
// Project:     Seasonal Entertainment
// Description: Admin → Settings → Alerts (OutageTestMail, AdminSettingsPage; docs/DEPLOYMENT.md,
//              "An e-mail when the site is down"): the "Outage alert address" field in its
//              group; "Send a test e-mail" only with a saved address; asking says the watchdog
//              sends it within two minutes and offers "Check again"; the watchdog's answer,
//              sent or not with its reason, is shown; the panel's first load answering after a
//              quick send does not overwrite the send's answer, nor does "Check again" asked for
//              while a send waits.
// ============================================================

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { formatWhen } from '../app/dates.js';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const ADDRESS = {
  key: 'alerts.outageAddress',
  group: 'Alerts',
  type: 'text',
  label: 'Outage alert address',
  help: 'An e-mail goes here when the site or the call service stops answering.',
  maxLength: 254,
  default: '',
};
const REQUESTED = '2026-11-14T20:00:00.000Z';

async function page(value, test, more = {}) {
  const calls = mockApi({
    ...signedIn({ username: 'ada', role: 'admin' }),
    'GET /admin/settings': {
      body: { ok: true, groups: ['Alerts'], settings: [{ ...ADDRESS, value }] },
    },
    'GET /admin/outage-alert': { body: { ok: true, test } },
    ...more,
  });
  await renderApp('/admin/settings');
  const alerts = await screen.findByRole('region', { name: 'Alerts' });
  // The test e-mail's own panel: the setting's form has messages of its own.
  return {
    calls,
    alerts: within(within(alerts).getByRole('group', { name: 'Test e-mail' })),
    region: within(alerts),
  };
}

it('without a saved address the test e-mail cannot be asked for', async () => {
  const { alerts, region } = await page('', { requestedAt: null, result: null });
  expect(region.getByRole('textbox', { name: 'Outage alert address' })).toHaveValue('');
  expect(alerts.getByRole('button', { name: 'Send a test e-mail' })).toBeDisabled();
  expect(alerts.getByText('Save an address first.')).toBeInTheDocument();
});

it('asking says the watchdog sends it, and "Check again" shows its answer', async () => {
  const pending = { requestedAt: REQUESTED, result: null };
  const { calls, alerts } = await page(
    'ops@example.org',
    { requestedAt: null, result: null },
    {
      'POST /admin/outage-alert/test': {
        body: { ok: true, requestedAt: REQUESTED, test: pending },
      },
    }
  );
  fireEvent.click(alerts.getByRole('button', { name: 'Send a test e-mail' }));
  // Exactly: the date holds a narrow no-break space, which toHaveTextContent would fold.
  expect((await alerts.findByRole('status')).textContent).toBe(
    `Asked at ${formatWhen(REQUESTED)}; the watchdog sends it within two minutes.`
  );
  expect(calls.some((c) => c.key === 'POST /admin/outage-alert/test')).toBe(true);

  calls.length = 0;
  mockApi({
    ...signedIn({ username: 'ada', role: 'admin' }),
    'GET /admin/outage-alert': {
      body: {
        ok: true,
        test: {
          requestedAt: REQUESTED,
          result: { sent: true, at: '2026-11-14T20:01:00Z', reason: null },
        },
      },
    },
  });
  fireEvent.click(alerts.getByRole('button', { name: 'Check again' }));
  await waitFor(() =>
    expect(alerts.getByRole('status').textContent).toBe(
      `The test e-mail went out at ${formatWhen('2026-11-14T20:01:00Z')}.`
    )
  );
});

it("a send right after opening: the panel's first load, answering later, keeps the send's answer", async () => {
  // The first load held back until the send has answered, then given the older state.
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const { alerts } = await page('ops@example.org', null, {
    'GET /admin/outage-alert': () => held,
    'POST /admin/outage-alert/test': {
      body: { ok: true, requestedAt: REQUESTED, test: { requestedAt: REQUESTED, result: null } },
    },
  });
  fireEvent.click(alerts.getByRole('button', { name: 'Send a test e-mail' }));
  const asked = `Asked at ${formatWhen(REQUESTED)}; the watchdog sends it within two minutes.`;
  expect((await alerts.findByRole('status')).textContent).toBe(asked);
  await act(async () => {
    release({ body: { ok: true, test: { requestedAt: null, result: null } } });
    await held;
  });
  expect(alerts.getByRole('status').textContent).toBe(asked);
});

it("a load asked for while a send waits never overwrites the send's answer", async () => {
  // An older request is pending, so "Check again" shows. Send, and "Check again" while the
  // send waits; both held, the load (if one was made) answering last with the older state.
  const older = { requestedAt: '2026-11-14T19:00:00.000Z', result: null };
  const holds = {};
  const held = (name) => new Promise((resolve) => (holds[name] = resolve));
  let loads = 0;
  const { alerts } = await page('ops@example.org', null, {
    'GET /admin/outage-alert': () =>
      (loads += 1) === 1 ? { body: { ok: true, test: older } } : held('load'),
    'POST /admin/outage-alert/test': () => held('send'),
  });
  const again = await alerts.findByRole('button', { name: 'Check again' });
  fireEvent.click(alerts.getByRole('button', { name: 'Send a test e-mail' }));
  fireEvent.click(again);
  const pending = { requestedAt: REQUESTED, result: null };
  await act(async () => holds.send({ body: { ok: true, requestedAt: REQUESTED, test: pending } }));
  await act(async () => holds.load?.({ body: { ok: true, test: older } }));
  expect(alerts.getByRole('status').textContent).toBe(
    `Asked at ${formatWhen(REQUESTED)}; the watchdog sends it within two minutes.`
  );
});

it('a failed test shows the reason', async () => {
  const { alerts } = await page('ops@example.org', {
    requestedAt: REQUESTED,
    result: { sent: false, at: '2026-11-14T20:01:00Z', reason: 'no mail account is set up' },
  });
  expect(await alerts.findByRole('status')).toHaveTextContent(
    'The test e-mail could not be sent: no mail account is set up'
  );
  expect(alerts.queryByRole('button', { name: 'Check again' })).toBeNull();
});
