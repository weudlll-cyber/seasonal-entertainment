// ============================================================
// File:        adminChatMedia.test.jsx
// Path:        client/src/admin/adminChatMedia.test.jsx
// Project:     Seasonal Entertainment
// Description: Guards the admin "Chat media" page: packs in order with their items, uploading
//              a file to the right pack (raw body, text fields in the query), several files at
//              once (one request each, named after the file; a refused one listed with its
//              reason, the others still sent), editing an item and moving a pack.
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

function adminPage(more = {}) {
  const calls = mockApi({
    ...more,
    ...signedIn({ id: 1, username: 'ada', role: 'admin', twoFactorEnabled: true }),
    'GET /admin/chat/media': { body: { ok: true, packs: PACKS } },
    'POST /admin/chat/media/packs/2/items?name=wave&alt=A+waving+hand': {
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
    // Named after the file, without the extension; the alt text typed here.

    const file = new File(['GIF89a'], 'wave.gif', { type: 'image/gif' });
    fireEvent.change(within(spins).getByLabelText('Files for Spins'), {
      target: { files: [file] },
    });
    fireEvent.change(within(spins).getByLabelText('Alt text of the new items in Spins'), {
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

  it('uploads several files one after another, each named after its file', async () => {
    const items = 'POST /admin/chat/media/packs/1/items';
    const created = { status: 201, body: { ok: true } };
    // The first answer waits, so the progress can be seen.
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const calls = adminPage({
      [`${items}?name=spring&alt=spring&credit=Foxeane`]: () => held.then(() => created),
      [`${items}?name=summer.v2&alt=summer.v2&credit=Foxeane`]: created,
      [`${items}?name=autumn&alt=autumn&credit=Foxeane`]: created,
    });
    const seasons = await screen.findByRole('region', { name: 'Stickers: Seasons' });
    const files = ['spring.webp', 'summer.v2.png', 'autumn.webp'].map(
      (name) => new File(['RIFF'], name, { type: 'image/webp' })
    );
    fireEvent.change(within(seasons).getByLabelText('Files for Seasons'), { target: { files } });
    fireEvent.change(within(seasons).getByLabelText('Credit of the new items in Seasons'), {
      target: { value: 'Foxeane' },
    });
    fireEvent.submit(within(seasons).getByRole('button', { name: 'Upload' }).closest('form'));
    // The progress while they go.
    expect(await screen.findByRole('status')).toHaveTextContent('Uploading 1 of 3');
    release();
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key.startsWith(items)).map((c) => c.body)).toEqual(files)
    );
    await vi.waitFor(() => expect(screen.queryByText(/Uploading/)).toBeNull());
    expect(screen.queryByText('Not uploaded:')).toBeNull();
  });

  it('a refused file does not stop the others, and is listed with the reason', async () => {
    const items = 'POST /admin/chat/media/packs/1/items';
    const calls = adminPage({
      [`${items}?name=spring&alt=A+badge`]: { status: 201, body: { ok: true } },
      [`${items}?name=huge&alt=A+badge`]: {
        status: 400,
        body: { ok: false, error: 'invalid_file', message: 'The file is larger than 512 KB.' },
      },
      [`${items}?name=autumn&alt=A+badge`]: { status: 201, body: { ok: true } },
    });
    const seasons = await screen.findByRole('region', { name: 'Stickers: Seasons' });
    const files = ['spring.webp', 'huge.png', 'autumn.webp'].map(
      (name) => new File(['RIFF'], name, { type: 'image/webp' })
    );
    fireEvent.change(within(seasons).getByLabelText('Files for Seasons'), { target: { files } });
    fireEvent.change(within(seasons).getByLabelText('Alt text of the new items in Seasons'), {
      target: { value: 'A badge' },
    });
    fireEvent.submit(within(seasons).getByRole('button', { name: 'Upload' }).closest('form'));
    const refused = await screen.findByRole('alert');
    expect(refused).toHaveTextContent('Not uploaded:');
    expect(refused).toHaveTextContent('huge.png: The file is larger than 512 KB.');
    expect(refused).not.toHaveTextContent('spring');
    expect(calls.filter((c) => c.key.startsWith(items)).map((c) => c.body)).toEqual(files);
  });
});
