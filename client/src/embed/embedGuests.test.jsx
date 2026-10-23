// ============================================================
// File:        embedGuests.test.jsx
// Path:        client/src/embed/embedGuests.test.jsx
// Project:     Seasonal Entertainment
// Description: Guests in the chat embedded on an approved other site, by the site's rules
//              (/api/embed/check): writing off offers "Log in to write" instead of the composer;
//              writing on gives the guest composer, whose requests name the site and keep the
//              guest token the server hands back for the next ones; reading off shows "Log in to
//              read" instead of the room.
// ============================================================

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  SITE,
  answers,
  setUpForeignHost,
  showEmbed,
  tearDownForeignHost,
} from '../test/foreignEmbed.jsx';
import { mockApi } from '../test/mockApi.js';

beforeEach(() => {
  setUpForeignHost();
  localStorage.clear();
});
afterEach(tearDownForeignHost);

const CHECK = `GET /embed/check?origin=${encodeURIComponent(SITE)}`;
const rules = (guestsRead, guestsWrite) => ({
  [CHECK]: { body: { ok: true, allowed: true, guestsRead, guestsWrite } },
});
const MESSAGE = {
  id: 5,
  room: 'general',
  author: 'Guest-ab12cd',
  isGuest: true,
  kind: 'text',
  body: 'hello',
  media: null,
  file: null,
  preview: null,
  createdAt: '2026-10-23T18:00:00.000Z',
  hiddenAt: null,
};

it('writing off: "Log in to write" instead of the composer', async () => {
  mockApi(answers(true, rules(true, false)));
  await showEmbed();
  expect(await screen.findByRole('button', { name: 'Log in to write' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Message')).toBeNull();
});

it('writing on: the guest writes, naming the site, and keeps the token for the next one', async () => {
  let sent = 0;
  const calls = mockApi(
    answers(true, {
      ...rules(true, true),
      'POST /chat/rooms/general/messages': () => {
        sent += 1;
        return {
          status: 201,
          body: { ok: true, message: { ...MESSAGE, id: 5 + sent } },
          headers: sent === 1 ? { 'X-Embed-Guest': 'the-guest-token' } : {},
        };
      },
    })
  );
  await showEmbed();
  const field = await screen.findByLabelText('Message');
  for (const text of ['hello', 'again']) {
    fireEvent.change(field, { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toBeGreaterThanOrEqual(text === 'hello' ? 1 : 2));
  }
  const posts = calls.filter((c) => c.key === 'POST /chat/rooms/general/messages');
  expect(posts.map((c) => c.headers['X-Embed-Origin'])).toEqual([SITE, SITE]);
  expect(posts.map((c) => c.headers['X-Embed-Guest'])).toEqual([undefined, 'the-guest-token']);
});

it('reading off: "Log in to read" instead of the room', async () => {
  mockApi(answers(true, rules(false, false)));
  await showEmbed();
  expect(await screen.findByText(/Guests cannot read the chat on this site/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Log in to read' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /^Chat:/ })).toBeNull();
});
