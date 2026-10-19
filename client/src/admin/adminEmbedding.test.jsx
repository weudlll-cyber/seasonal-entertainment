// ============================================================
// File:        adminEmbedding.test.jsx
// Path:        client/src/admin/adminEmbedding.test.jsx
// Project:     Seasonal Entertainment
// Description: Admin "Embedding" (/admin/embedding): reachable from the admin menu; lists the
//              approved sites, adds one (what the server normalised is shown), shows the
//              server's refusal, and removes one.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import App from '../app/App.jsx';
import { mockApi, signedIn } from '../test/mockApi.js';

const ADA = { id: 1, username: 'ada', role: 'admin', twoFactorEnabled: true };

it('lists, adds, refuses and removes sites', async () => {
  let list = ['https://game.example'];
  const calls = mockApi({
    ...signedIn(ADA),
    'GET /admin/embed-origins': () => ({ body: { ok: true, origins: list } }),
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
      return { status: 201, body: { ok: true, origins: list } };
    },
    'DELETE /admin/embed-origins': (body) => {
      list = list.filter((o) => o !== body.origin);
      return { body: { ok: true, origins: list } };
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
