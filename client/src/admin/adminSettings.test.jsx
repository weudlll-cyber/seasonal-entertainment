// ============================================================
// File:        adminSettings.test.jsx
// Path:        client/src/admin/adminSettings.test.jsx
// Project:     Seasonal Entertainment
// Description: Admin → Settings: every setting with its range and current value; saving one
//              sends the number and shows the stored values.
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const SETTING = (key, label, value) => ({ key, label, value, default: 10, min: 1, max: 25 });

it('shows the settings and saves one', async () => {
  const calls = mockApi({
    ...signedIn({ username: 'ada', role: 'admin' }),
    'GET /admin/settings': {
      body: { ok: true, settings: [SETTING('calls.maxSpeakers', 'Speakers at most', 10)] },
    },
    'PUT /admin/settings/calls.maxSpeakers': {
      body: { ok: true, settings: [SETTING('calls.maxSpeakers', 'Speakers at most', 6)] },
    },
  });
  await renderApp('/admin/settings');
  const form = await screen.findByRole('form', { name: 'Speakers at most' });
  const field = within(form).getByLabelText('Speakers at most');
  expect(field).toHaveValue(10);
  expect(within(form).getByText('1–25; default 10')).toBeInTheDocument();
  fireEvent.change(field, { target: { value: '6' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Saved.')).toBeInTheDocument();
  expect(calls.find((c) => c.key === 'PUT /admin/settings/calls.maxSpeakers').body).toEqual({
    value: 6,
  });
  expect(
    within(screen.getByRole('form', { name: 'Speakers at most' })).getByLabelText(
      'Speakers at most'
    )
  ).toHaveValue(6);
});
