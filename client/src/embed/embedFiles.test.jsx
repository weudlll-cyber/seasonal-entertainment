// ============================================================
// File:        embedFiles.test.jsx
// Path:        client/src/embed/embedFiles.test.jsx
// Project:     Seasonal Entertainment
// Description: Files in the chat embedded on another site, by the site's "uploads" rule
//              (/api/embed/check): off, a member there has no "Attach file" and asks for no
//              links; on, "Attach file" is there and an uploaded image in a message shows
//              through its short-lived link (POST /api/chat/files/:id/links), not its plain
//              address.
// ============================================================

import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  SITE,
  answers,
  logIn,
  setUpForeignHost,
  showEmbed,
  tearDownForeignHost,
} from '../test/foreignEmbed.jsx';
import { mockApi } from '../test/mockApi.js';

beforeEach(setUpForeignHost);
afterEach(tearDownForeignHost);

const CHECK = `GET /embed/check?origin=${encodeURIComponent(SITE)}`;
const uploadsRule = (uploads) => ({
  [CHECK]: { body: { ok: true, allowed: true, guestsRead: true, guestsWrite: false, uploads } },
});
const LINK = '/api/chat/files/7/thumb?link=3.999.sig';
const WITH_IMAGE = {
  'GET /chat/rooms/general/messages': {
    body: {
      ok: true,
      messages: [
        {
          id: 1,
          room: 'general',
          author: 'zoe',
          isGuest: false,
          kind: 'text',
          body: 'look',
          media: null,
          file: {
            id: 7,
            kind: 'image',
            name: 'pic.png',
            bytes: 100,
            thumbUrl: '/api/chat/files/7/thumb',
            url: '/api/chat/files/7/full',
          },
          preview: null,
          createdAt: '2026-10-23T18:00:00.000Z',
          hiddenAt: null,
        },
      ],
    },
  },
  'POST /chat/files/7/links': {
    body: { ok: true, links: { thumbUrl: LINK, url: '/api/chat/files/7/full?link=3.999.sig2' } },
  },
};

it('uploads off: no "Attach file", and no links are asked for', async () => {
  const calls = mockApi(answers(true, { ...uploadsRule(false), ...WITH_IMAGE }));
  await showEmbed();
  await logIn();
  expect(await screen.findByLabelText('Message')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Attach file' })).toBeNull();
  expect(calls.some((c) => c.key === 'POST /chat/files/7/links')).toBe(false);
});

it('uploads on: "Attach file", and an image shows through its short-lived link', async () => {
  const calls = mockApi(answers(true, { ...uploadsRule(true), ...WITH_IMAGE }));
  await showEmbed();
  await logIn();
  expect(await screen.findByRole('button', { name: 'Attach file' })).toBeInTheDocument();
  const image = await screen.findByRole('img', { name: 'Picture: pic.png' });
  await waitFor(() => expect(image).toHaveAttribute('src', LINK));
  expect(
    calls.find((c) => c.key === 'POST /chat/files/7/links').headers['X-Embed-Token']
  ).toBeTruthy();
});
