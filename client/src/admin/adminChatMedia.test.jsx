// ============================================================
// File:        adminChatMedia.test.jsx
// Path:        client/src/admin/adminChatMedia.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the admin "Chat media" page: packs in order with their items, uploading
//              a file to the right pack (raw body, text fields in the query), editing an item
//              and moving a pack.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import App from '../app/App.jsx';
import { mockApi, signedIn } from '../test/mockApi.js';

const PACKS = [
  {
    id: 1,
    name: 'Seasons',
    kind: 'sticker',
    active: true,
    items: [
      {
        id: 11,
        name: 'Spring badge',
        alt: 'Spring season badge',
        credit: null,
        active: true,
        url: '/media/a.webp',
      },
    ],
  },
  { id: 2, name: 'Spins', kind: 'gif', active: true, items: [] },
];

function adminPage() {
  const calls = mockApi({
    ...signedIn({ id: 1, username: 'ada', role: 'admin', twoFactorEnabled: true }),
    'GET /admin/chat/media': { body: { ok: true, packs: PACKS } },
    'POST /admin/chat/media/packs/2/items?name=Wave&alt=A+waving+hand': {
      status: 201,
      body: { ok: true },
    },
    'PUT /admin/chat/media/items/11': { body: { ok: true } },
    'POST /admin/chat/media/packs/reorder': { body: { ok: true } },
  });
  render(
    <MemoryRouter initialEntries={['/admin/chat-media']}>
      <App />
    </MemoryRouter>
  );
  return calls;
}

describe('admin chat media page', () => {
  it('lists packs with items, uploads a file, edits an item and moves a pack', async () => {
    const calls = adminPage();
    const spins = await screen.findByRole('region', { name: 'GIFs: Spins' });
    expect(screen.getByRole('img', { name: 'Spring season badge' })).toBeInTheDocument();

    const file = new File(['GIF89a'], 'wave.gif', { type: 'image/gif' });
    fireEvent.change(within(spins).getByLabelText('File for Spins'), { target: { files: [file] } });
    fireEvent.change(within(spins).getByLabelText('New item name in Spins'), {
      target: { value: 'Wave' },
    });
    fireEvent.change(within(spins).getByLabelText('New item alt text in Spins'), {
      target: { value: 'A waving hand' },
    });
    // Submitted directly: jsdom cannot really fill a file input, so its required check would block a click.
    fireEvent.submit(within(spins).getByRole('button', { name: 'Upload' }).closest('form'));
    await vi.waitFor(() =>
      expect(
        calls.find((c) => c.key.startsWith('POST /admin/chat/media/packs/2/items'))?.body
      ).toBe(file)
    );

    fireEvent.change(screen.getByLabelText('Credit of Spring badge'), {
      target: { value: 'Foxeane' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'PUT /admin/chat/media/items/11')?.body).toEqual({
        name: 'Spring badge',
        alt: 'Spring season badge',
        credit: 'Foxeane',
        active: true,
      })
    );

    fireEvent.click(within(spins).getByRole('button', { name: 'Move up' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /admin/chat/media/packs/reorder')?.body).toEqual({
        ids: [2, 1],
      })
    );
  });
});
