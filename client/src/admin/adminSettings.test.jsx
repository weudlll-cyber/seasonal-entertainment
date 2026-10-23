// ============================================================
// File:        adminSettings.test.jsx
// Path:        client/src/admin/adminSettings.test.jsx
// Project:     Seasonal Entertainment
// Description: Admin → Settings: the settings in their groups, each drawn by its kind (on/off,
//              whole number with unit and bounds, short text, choice) with its explanation and
//              default; saving one sends the value as its kind and shows the stored values.
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

// "Home" has no setting here: its section is left out.
const GROUPS = ['Chat', 'Calls', 'Home', 'Site banner'];
const SPEAKERS = {
  key: 'calls.maxSpeakers',
  group: 'Calls',
  type: 'integer',
  label: 'Speakers at most',
  help: 'How many can speak at once.',
  unit: 'speakers',
  default: 10,
  min: 1,
  max: 25,
};
const UPLOADS = {
  key: 'chat.uploads',
  group: 'Chat',
  type: 'boolean',
  label: 'Uploads',
  help: 'Members attach files.',
  default: true,
};
const TEXT = {
  key: 'banner.text',
  group: 'Site banner',
  type: 'text',
  label: 'Banner text',
  help: 'Plain text.',
  maxLength: 200,
  default: '',
};
const STYLE = {
  key: 'banner.style',
  group: 'Site banner',
  type: 'choice',
  label: 'Banner style',
  help: 'Its colour.',
  choices: [
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
  ],
  default: 'info',
};
const answer = (values) => ({
  body: {
    ok: true,
    groups: GROUPS,
    settings: [UPLOADS, SPEAKERS, TEXT, STYLE].map((s) => ({ ...s, value: values[s.key] })),
  },
});
const START = {
  'chat.uploads': true,
  'calls.maxSpeakers': 10,
  'banner.text': '',
  'banner.style': 'info',
};

async function page(put = {}) {
  const calls = mockApi({
    ...signedIn({ username: 'ada', role: 'admin' }),
    'GET /admin/settings': answer(START),
    ...put,
  });
  await renderApp('/admin/settings');
  await screen.findByRole('form', { name: 'Speakers at most' });
  return calls;
}
const formOf = (label) => screen.getByRole('form', { name: label });

it('shows the settings in their groups with explanation, bounds and default', async () => {
  await page();
  const sections = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
  expect(sections).toEqual(['Chat', 'Calls', 'Site banner']);
  const calls = within(screen.getByRole('region', { name: 'Calls' }));
  // Within its form: the form itself is named after the setting as well.
  expect(within(formOf('Speakers at most')).getByLabelText('Speakers at most')).toHaveValue(10);
  expect(
    calls.getByText('How many can speak at once. 1–25 speakers; default 10 speakers.')
  ).toBeInTheDocument();
  expect(within(formOf('Uploads')).getByLabelText('Uploads')).toBeChecked();
  expect(screen.getByText('Members attach files. default on.')).toBeInTheDocument();
  expect(
    screen.getByText('Plain text. At most 200 characters; default empty.')
  ).toBeInTheDocument();
  expect(within(formOf('Banner style')).getByLabelText('Banner style')).toHaveValue('info');
});

it('saves each kind as its value: a number, true or false, text, a choice', async () => {
  const saved = (key, value) => ({
    [`PUT /admin/settings/${key}`]: answer({ ...START, [key]: value }),
  });
  const calls = await page({
    ...saved('calls.maxSpeakers', 6),
    ...saved('chat.uploads', false),
    ...saved('banner.text', 'Maintenance tonight'),
    ...saved('banner.style', 'warning'),
  });
  const save = async (label, change) => {
    const form = formOf(label);
    change(within(form).getByLabelText(label));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
  };
  await save('Speakers at most', (f) => fireEvent.change(f, { target: { value: '6' } }));
  await save('Uploads', (f) => fireEvent.click(f));
  await save('Banner text', (f) =>
    fireEvent.change(f, { target: { value: 'Maintenance tonight' } })
  );
  await save('Banner style', (f) => fireEvent.change(f, { target: { value: 'warning' } }));
  const sent = Object.fromEntries(
    calls.filter((c) => c.key.startsWith('PUT')).map((c) => [c.key.split('/').pop(), c.body.value])
  );
  expect(sent).toEqual({
    'calls.maxSpeakers': 6,
    'chat.uploads': false,
    'banner.text': 'Maintenance tonight',
    'banner.style': 'warning',
  });
  // Each form shows what the server stored after its save.
  expect(within(formOf('Banner style')).getByLabelText('Banner style')).toHaveValue('warning');
});

it('shows the server refusal on the setting', async () => {
  await page({
    'PUT /admin/settings/calls.maxSpeakers': {
      status: 400,
      body: {
        ok: false,
        error: 'invalid_input',
        message: 'Speakers at most must be a whole number from 1 to 25.',
      },
    },
  });
  const form = formOf('Speakers at most');
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
  expect(await within(form).findByRole('alert')).toHaveTextContent('from 1 to 25');
});
