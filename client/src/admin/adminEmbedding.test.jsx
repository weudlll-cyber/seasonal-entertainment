// ============================================================
// File:        adminEmbedding.test.jsx
// Path:        client/src/admin/adminEmbedding.test.jsx
// Project:     Seasonal Entertainment
// Description: Admin "Embedding" (/admin/embedding): reachable from the admin menu; lists the
//              approved sites, adds one (what the server normalised is shown), shows the
//              server's refusal, and removes one; sets a site's own rule for guests (inherit,
//              showing the global value, on or off).
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import App from '../app/App.jsx';
import { mockApi, signedIn } from '../test/mockApi.js';

const ADA = { id: 1, username: 'ada', role: 'admin', twoFactorEnabled: true };
const INHERIT = {
  guestsRead: 'inherit',
  guestsWrite: 'inherit',
  uploads: 'inherit',
  images: 'inherit',
};
const GLOBALS = { guestsRead: true, guestsWrite: false, uploads: false, images: false };
// The route's answer: the sites, each one's own rules, and the global settings.
const listed = (list, rules = {}) => ({
  body: {
    ok: true,
    origins: list,
    rules: Object.fromEntries(list.map((o) => [o, { ...INHERIT, ...rules[o] }])),
    globals: GLOBALS,
  },
});

it('lists, adds, refuses and removes sites', async () => {
  let list = ['https://game.example'];
  const calls = mockApi({
    ...signedIn(ADA),
    'GET /admin/embed-origins': () => listed(list),
    'POST /admin/embed-origins': (body) => {
      if (body.origin.includes('*')) {
        return {
          status: 400,
          body: {
            ok: false,
            error: 'invalid_input',
            message: 'Wildcards are not allowed: name one exact site.',
          },
        };
      }
      list = [...list, 'https://other.example'];
      return { status: 201, ...listed(list) };
    },
    'DELETE /admin/embed-origins': (body) => {
      list = list.filter((o) => o !== body.origin);
      return listed(list);
    },
  });
  render(
    <MemoryRouter initialEntries={['/admin/settings']}>
      <App />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('link', { name: 'Embedding' }));
  const sites = await screen.findByRole('list', { name: 'Sites allowed to embed the chat' });
  expect(within(sites).getByText('https://game.example')).toBeInTheDocument();

  const field = screen.getByLabelText('Site address');
  fireEvent.change(field, { target: { value: 'https://*.example' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Wildcards are not allowed');

  fireEvent.change(field, { target: { value: 'HTTPS://Other.Example/' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
  expect(await within(sites).findByText('https://other.example')).toBeInTheDocument();
  expect(calls.filter((c) => c.key === 'POST /admin/embed-origins').at(-1).body).toEqual({
    origin: 'HTTPS://Other.Example/',
  });

  const game = within(sites).getByText('https://game.example').closest('li');
  fireEvent.click(within(game).getByRole('button', { name: 'Remove' }));
  expect(await screen.findByText('https://game.example removed.')).toBeInTheDocument();
  expect(within(sites).queryByText('https://game.example')).toBeNull();
});

it("sets a site's own rule for guests: inherit (showing the global value), on or off", async () => {
  const calls = mockApi({
    ...signedIn(ADA),
    'GET /admin/embed-origins': listed(['https://game.example']),
    'PUT /admin/embed-origins/rules': listed(['https://game.example'], {
      'https://game.example': { guestsWrite: 'on' },
    }),
  });
  render(
    <MemoryRouter initialEntries={['/admin/embedding']}>
      <App />
    </MemoryRouter>
  );
  const group = await screen.findByRole('group', { name: 'Rules for https://game.example' });
  const write = within(group).getByLabelText('Guests can write');
  expect(write).toHaveValue('inherit');
  expect(within(write).getByRole('option', { name: 'Inherit (off)' })).toBeInTheDocument();
  expect(within(group).getByRole('option', { name: 'Inherit (on)' })).toBeInTheDocument();
  fireEvent.change(write, { target: { value: 'on' } });
  expect(
    await screen.findByText('Guests can write on https://game.example: on.')
  ).toBeInTheDocument();
  expect(calls.find((c) => c.key === 'PUT /admin/embed-origins/rules').body).toEqual({
    origin: 'https://game.example',
    rule: 'guestsWrite',
    value: 'on',
  });
  expect(within(group).getByLabelText('Guests can write')).toHaveValue('on');
});
