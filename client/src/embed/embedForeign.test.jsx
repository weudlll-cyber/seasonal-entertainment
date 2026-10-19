// ============================================================
// File:        embedForeign.test.jsx
// Path:        client/src/embed/embedForeign.test.jsx
// Project:     Seasonal Entertainment
// Description: The chat embedded on another site's page (docs/EMBED.md): it talks only to an
//              approved parent, to that origin exactly, and ignores other origins and windows;
//              an unapproved parent hears nothing; it takes the login hand-over only from its
//              own popup, and afterwards the token rides on every request and on the socket.
//              A guest there gets "Log in to write" instead of a composer that could not send;
//              a member gets no "Attach file" (uploads are refused with a token).
// ============================================================

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { FakeSocket } from '../test/fakeSocket.js';
import {
  SITE,
  TOKEN,
  answers,
  fromWindow,
  handOver,
  logIn,
  page,
  sentToHost,
  setUpForeignHost,
  showEmbed,
  tearDownForeignHost,
} from '../test/foreignEmbed.jsx';
import { mockApi } from '../test/mockApi.js';

beforeEach(setUpForeignHost);
afterEach(tearDownForeignHost);

it('talks only to the approved parent, at its origin; other origins and windows are ignored', async () => {
  mockApi(answers(true));
  await showEmbed();
  await waitFor(() =>
    expect(sentToHost().map(([m]) => m.type)).toEqual(expect.arrayContaining(['ready']))
  );
  expect(sentToHost().every(([, target]) => target === SITE)).toBe(true);

  const dark = { source: 'seasonal-chat-host', type: 'theme', theme: 'dark' };
  fromWindow(page.host, 'https://evil.example', dark);
  fromWindow(page.popup, SITE, dark); // the right origin, but not the parent window
  expect(document.documentElement.dataset.theme).not.toBe('dark');
  fromWindow(page.host, SITE, dark);
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
});

it('an unapproved parent hears nothing and gets no login', async () => {
  const calls = mockApi(answers(false));
  await showEmbed();
  await waitFor(() =>
    expect(calls.map((c) => c.key)).toContain(`GET /embed/check?origin=${encodeURIComponent(SITE)}`)
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(sentToHost()).toEqual([]);
  expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
});

it('takes the hand-over only from its popup; then the token rides on requests and the socket', async () => {
  const calls = mockApi(answers(true));
  await showEmbed();
  const button = await screen.findByRole('button', { name: 'Log in' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  fromWindow(page.host, window.location.origin, handOver()); // not the popup window
  fromWindow(page.popup, SITE, handOver()); // not this site
  fromWindow(page.popup, window.location.origin, handOver({ origin: 'https://evil.example' }));
  expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();

  fromWindow(page.popup, window.location.origin, handOver());
  expect(await screen.findByText('mia')).toBeInTheDocument();
  await waitFor(() => expect(calls.some((c) => c.headers['X-Embed-Token'] === TOKEN)).toBe(true));
  await waitFor(() =>
    expect(FakeSocket.all.at(-1).protocols).toEqual(['se-chat', `se-embed.${TOKEN}`])
  );
});

it('a guest reads but gets "Log in to write" instead of the composer, which opens the popup', async () => {
  mockApi(answers(true));
  await showEmbed();
  const write = await screen.findByRole('button', { name: 'Log in to write' });
  expect(screen.getByRole('region', { name: 'Chat: General' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Message')).toBeNull();
  expect(screen.queryByText(/You are a guest/)).toBeNull();
  await waitFor(() => expect(write).toBeEnabled());
  fireEvent.click(write);
  expect(window.open).toHaveBeenCalledWith(
    `/embed-login?origin=${encodeURIComponent(SITE)}`,
    'se-embed-login',
    expect.any(String)
  );
});

it('a member logged in with a token writes, but gets no "Attach file"', async () => {
  mockApi(answers(true));
  await showEmbed();
  await logIn();
  expect(await screen.findByLabelText('Message')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Emoji, stickers, GIFs' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Attach file' })).toBeNull();
});
