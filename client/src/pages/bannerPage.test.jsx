// ============================================================
// File:        bannerPage.test.jsx
// Path:        client/src/pages/bannerPage.test.jsx
// Project:     Seasonal Entertainment
// Description: The organisers' Site banner page (/banner, BannerPage.jsx): reached from the
//              sidebar, it shows whether the banner is on now, its on/off and text as fields
//              with their explanations, its link and style read-only, a preview that follows
//              the edits, and one Save that sends only the changed values; a refusal shows on
//              the page. Members see "Not allowed".
// ============================================================

import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { mockApi, signedIn } from '../test/mockApi.js';
import { renderApp } from '../test/renderApp.jsx';

const DEFINITIONS = [
  { key: 'banner.enabled', type: 'boolean', label: 'Show the banner', help: 'For everyone.' },
  { key: 'banner.text', type: 'text', label: 'Banner text', help: 'Plain text.', maxLength: 200 },
  { key: 'banner.link', type: 'text', label: 'Banner link', help: 'A path.', maxLength: 200 },
  {
    key: 'banner.style',
    type: 'choice',
    label: 'Banner style',
    help: 'Its colour.',
    choices: [
      { value: 'info', label: 'Info' },
      { value: 'warning', label: 'Warning' },
    ],
  },
];
const DEFAULTS = {
  'banner.enabled': false,
  'banner.text': '',
  'banner.link': '',
  'banner.style': 'info',
};
const answer = (values) => ({
  body: {
    ok: true,
    settings: DEFINITIONS.map((d) => ({
      ...d,
      group: 'Site banner',
      default: DEFAULTS[d.key],
      value: values[d.key],
    })),
    editable: ['banner.enabled', 'banner.text'],
  },
});
const OLGA = signedIn({ username: 'olga', role: 'organiser' });

beforeEach(() => localStorage.clear());

async function open(stored = DEFAULTS, put) {
  const calls = mockApi({ ...OLGA, 'GET /banner': answer(stored), ...put });
  await renderApp('/banner');
  await screen.findByRole('form', { name: 'Site banner' });
  return calls;
}
const field = (label) =>
  within(screen.getByRole('form', { name: 'Site banner' })).getByLabelText(label);
const preview = () => screen.getByRole('region', { name: 'Preview' });

it('an organiser finds it in the sidebar', async () => {
  mockApi({ ...OLGA, 'GET /games': { body: { ok: true, games: [] } } });
  await renderApp('/games');
  const link = await screen.findByRole('link', { name: 'Site banner' });
  expect(link).toHaveAttribute('href', '/banner');
  expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
});

it('shows the banner now on the site, its settings and a preview of the edits', async () => {
  await open({
    ...DEFAULTS,
    'banner.enabled': true,
    'banner.text': 'Call at 8',
    'banner.link': '/calls',
    'banner.style': 'warning',
  });
  expect(screen.getByText(/shown to everyone \("Call at 8"\)/)).toBeInTheDocument();
  expect(field('Show the banner')).toBeChecked();
  expect(screen.getByText('Plain text. At most 200 characters. Default: empty.')).toBeVisible();
  expect(within(preview()).getByText('Call at 8')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); // nothing changed yet

  // Link and style are read-only here: an admin changes them in Admin → Settings.
  const form = within(screen.getByRole('form', { name: 'Site banner' }));
  expect(form.queryByLabelText('Banner link')).toBeNull();
  expect(form.queryByLabelText('Banner style')).toBeNull();
  expect(
    form.getByText(/Banner link: "\/calls" · Banner style: Warning\. Link and style: an admin/)
  ).toBeInTheDocument();

  fireEvent.change(field('Banner text'), { target: { value: 'Call at 9' } });
  // The preview shows the edited text with the stored link and style.
  const line = within(preview()).getByText('Call at 9').closest('p');
  expect(line).toHaveClass('site-banner--warning');
  expect(line).not.toHaveAttribute('role'); // a preview is not read out on every keystroke
  expect(within(preview()).getByRole('link', { name: 'Read more' })).toHaveAttribute(
    'href',
    '/calls'
  );
  // Still the stored banner on the site until Save.
  expect(screen.getByText(/shown to everyone \("Call at 8"\)/)).toBeInTheDocument();

  fireEvent.click(field('Show the banner'));
  expect(within(preview()).getByText(/Nobody sees a banner/)).toBeInTheDocument();
});

it('saves only the changed values, at once, and shows what the server stored', async () => {
  const stored = { ...DEFAULTS, 'banner.enabled': true, 'banner.text': 'Hello' };
  const calls = await open(DEFAULTS, { 'PUT /banner': answer(stored) });
  expect(screen.getByText(/Now on the site:/).parentElement).toHaveTextContent('off');
  fireEvent.click(field('Show the banner'));
  fireEvent.change(field('Banner text'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(/^Saved\./)).toBeInTheDocument();
  expect(calls.find((c) => c.key === 'PUT /banner').body).toEqual({
    values: { 'banner.enabled': true, 'banner.text': 'Hello' },
  });
  expect(screen.getByText(/shown to everyone \("Hello"\)/)).toBeInTheDocument();
  // The session is asked again, so this browser's own banner follows at once.
  expect(calls.filter((c) => c.key === 'GET /auth/session')).toHaveLength(2);
});

it('shows the server refusal', async () => {
  await open(DEFAULTS, {
    'PUT /banner': {
      status: 400,
      body: { ok: false, error: 'invalid_input', message: 'Banner text is one line.' },
    },
  });
  fireEvent.change(field('Banner text'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Banner text is one line.');
});

it('a member sees "Not allowed" and no Site banner link', async () => {
  mockApi(signedIn({ username: 'mia', role: 'member' }));
  await renderApp('/banner');
  expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Site banner' })).toBeNull();
});
